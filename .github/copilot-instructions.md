# YourZuriFlat - AI Coding Assistant Guide

## Quick Start (First Time Setup)

```pwsh
# 1. Setup Python environment (Windows PowerShell)
cd backend
python.exe -m venv venv
.\venv\Scripts\activate

# 2. Start backend
pip install -r requirements.txt
uvicorn app.main:app --reload  # Runs at http://localhost:8000

# 3. Start frontend (new terminal)
cd frontend
cp .env.example .env  # Edit if backend URL differs
npm install
npm run dev  # Runs at http://localhost:5173
```

**Data loads automatically** on backend startup from `backend/Notebooks/listings_clean.json` (2348 apartments).

## Project Purpose
Interactive Visual Data Analysis (IVDA) tool for Zurich apartment rentals. **Content-based recommendation system** using cosine similarity to learn user preferences from ratings. **Always align changes with IVDA tasks T1-T6** (identify, compare, explain, calibrate, explore, relate apartments - see `AGENT.md` section 2.3).

## Architecture

### Frontend: React + Vite + TypeScript
**Location**: `frontend/` 
- **State**: React Query (@tanstack/react-query) for server state + Zustand (`store/useAppStore.ts`) for UI state
- **Viz**: Plotly.js (via react-plotly.js) ONLY - no other chart libraries
- **Multi-view coordination**: Linked brushing via `selectedApartmentIds` and `brushedApartmentIds` in Zustand
- **Color encoding**: Top 5 recommendations get consistent colors across views (see `utils/colors.ts`)
- **Persistence**: `bookmarkedApartmentIds` and user session state persist via Zustand middleware
- **Dimensionality reduction**: UMAP (non-linear) with LDA topic modeling for semantic clustering

### Backend: Python + FastAPI
**Location**: `backend/`
- **Model**: Enhanced content-based filtering (`app/models/session_model.py`)
  - Feature weighting: location (2.0x), amenities (1.5x), key attributes (1.3x)
  - User vector = weighted centroid of liked apartments (rating ≥ 4.0) with recency boost
  - Diversity penalty encourages variety in recommendations
  - Recommendations ranked by feature-weighted cosine similarity
- **Dimensionality reduction**: UMAP + LDA topic modeling for semantic apartment clustering
  - Topics labeled with human-readable names (e.g., "Entire Home & Zurich", "Budget & Solo Couple")
  - Dual color modes: topic-based and recommendation-based
- **Data**: In-memory pandas DataFrame (2348 apartments × ~200 features after encoding)
- **Session management**: In-memory dict with timestamps - no database, clears on restart
- **Dependencies**: fastapi, pandas, numpy, scikit-learn, umap-learn, gensim

### Critical Data Flow
1. User rates apartment → Frontend calls `POST /ratings` → `SESSION_MODEL.add_rating()` (stores with timestamp)
2. Model rebuilds enhanced user vector: feature-weighted centroid with recency boost and dislike dampening
3. Frontend requests `GET /recommendations?session_id=X` → Backend computes feature-weighted cosine similarity with diversity penalty
4. Frontend displays top-N with consistent color encoding across all views
5. After 5+ ratings: Explainability panel shows feature contributions (element-wise product accounting for feature weights)

### Cold-Start Strategy
**Problem**: At initialization, system has no user preferences
**Solution**: Farthest-point sampling to select diverse apartments
1. `GET /initial-sample` returns 5-8 diverse apartments (PCA + greedy max-distance)
2. User rates these calibration apartments (≥5 required for model training)
3. Model becomes active after 5+ ratings, generating personalized recommendations
4. Frontend shows "calibration mode" message when ratings < 5

## Type Synchronization (CRITICAL)
**Backend Pydantic models MUST match Frontend TypeScript types**:
- Backend: `app/api/routes.py` - Pydantic BaseModel classes defined inline
- Frontend: `src/api/types.ts` - ALL TypeScript interfaces
- **When changing API: Update BOTH files in same commit**

Key type contracts:
- `Apartment` - Core data model (65+ fields: amenities, price, location, reviews)
- `RatingRequest` - Session + apartment ID + rating value
- `RecommendationsResponse` - Array of apartments with scores
- `PCAResponse` - 2D projection data for scatter plot
- `ExplainabilityResponse` - Feature coefficients and contributions per apartment

**ID Handling**: Frontend sends string IDs, backend normalizes to string internally (see `_sanitize_for_json()` and `_ensure_string_id()` in `routes.py`).

## Development Workflow

### Start Backend (Windows PowerShell)
```pwsh
cd backend
conda activate IVDA_GROUP  # Or your preferred Python env
uvicorn app.main:app --reload
```
Backend runs at `http://localhost:8000` | Docs at `http://localhost:8000/docs`

### Start Frontend
```pwsh
cd frontend
npm run dev
```
Frontend runs at `http://localhost:5173`

### Environment Variables
- **Frontend**: Copy `.env.example` to `.env` (optional - defaults to `http://localhost:8000`):
  ```pwsh
  cd frontend
  cp .env.example .env
  ```
- **Backend**: No environment variables required - CORS origins hardcoded in `app/main.py` (ports 5173, 3000)

### Debugging Tips
- **Frontend errors**: Check browser console and React Query DevTools
- **Backend errors**: Check terminal output and visit `/docs` for API testing
- **CORS issues**: Verify frontend port matches CORS origins in `main.py`
- **Type mismatches**: Compare `routes.py` Pydantic models with `types.ts` interfaces
- **Missing data**: Backend loads data on startup - check for errors in first few lines of terminal output

### Running Tests
```pwsh
# Backend (pytest - create tests/ directory if missing)
cd backend
conda activate IVDA_GROUP
pytest -v
pytest --cov=app tests/  # With coverage

# Frontend (not yet implemented)
cd frontend
npm test
```

## Key Files to Read First
1. **`backend/Notebooks/ExploratoryAnalysis.ipynb`** - Data cleaning & feature engineering (SOURCE OF TRUTH for preprocessing)
2. **`backend/app/models/session_model.py`** - Enhanced content-based model with feature weighting, recency boost, diversity penalty
3. **`backend/app/data/loader.py`** - Data preprocessing implementing notebook logic
4. **`backend/app/api/routes.py`** - All API endpoints including UMAP+LDA topic modeling (single file architecture)
5. **`frontend/src/store/useAppStore.ts`** - Global UI state with bookmarks, ratings, selections, amenity filters
6. **`frontend/src/api/types.ts`** - Type contracts with backend (includes TopicInfo interface)
7. **`frontend/src/views/UMAPScatterView.tsx`** - UMAP visualization with topic modeling and dual color modes
8. **`AGENT.md`** - Comprehensive project guidelines (986 lines) - cross-reference with notebook for accuracy
9. **`docs/UMAP_IMPLEMENTATION.md`** - UMAP+LDA implementation details
10. **`docs/MODEL_ENHANCEMENTS.md`** - Content-based model enhancement details

## Project-Specific Patterns

### Frontend Components
- **Views** (`src/views/`) = page-level containers implementing IVDA tasks T1-T6
  - `LayoutView.tsx` - Main multi-view coordinator
  - `RecommendedListView.tsx` - T1/T4: **"Recommended Apartments"** with tabs (All/Ratings/Bookmarks) + integrated explainability panel + ranking options
  - `MapView.tsx` - T5: **"Explore Zurich Apartments"** - Plotly scattermapbox showing all individual listings (no cluster polygons)
  - `UMAPScatterView.tsx` - T6: **"Apartment Property Comparison"** - UMAP with LDA topic modeling (replaces PCAScatterView)
    - Two color modes: Topic (semantic clusters) and Recommendation (model-based)
    - Topic legend with human-readable labels and keywords
    - Supports raw 2D scatter (2 attrs) or UMAP projection (3+ attrs)
  - `PCAScatterView.tsx` - Legacy view (kept for reference, not used in LayoutView)
  - `StarComparisonView.tsx` - T2: **"Apartment Comparison"** - Radar chart with line traces (not filled polygons) comparing up to 5 apartments
  - `ExplainabilityView.tsx` - T3: **"Model Reasoning"** - Bar charts showing feature contributions from content-based model
- **Components** (`src/components/`) = reusable widgets
  - `ApartmentDetailDrawer.tsx` - Drawer for single apartment detail
  - `FilterPanel.tsx` - Multi-attribute filtering UI
  - `RatingControl.tsx` - Star rating input
- **State Management**:
  - Always use `useAppStore()` for cross-view state (selections, filters, brushing, bookmarks, session)
  - Use React Query hooks from `src/api/hooks.ts` for server data - NEVER direct axios calls
  - Example: `const { sessionId, selectedApartmentIds, setSelectedApartmentIds, filters } = useAppStore()`
  - Amenity filters stored in `filters.amenities` array (e.g., `['WiFi', 'Kitchen', 'Parking']`)

### Backend Routes Pattern
- **Single file architecture**: All routes in `app/api/routes.py` (764 lines)
- **Helper functions**:
  - `_sanitize_for_json(obj)` - Converts numpy types → Python natives, NaN/Inf → None
  - `_ensure_string_id(dict)` - Coerces apartment ID to string for frontend
- **Data access**:
  - `DATASTORE.df` - Raw pandas DataFrame with all apartment data
  - `DATASTORE.X` - Feature matrix (dense numpy array, 2348 × ~200 after encoding)
  - `DATASTORE.feature_names` - Column names after StandardScaler + OneHotEncoder
- **Model access**:
  - `SESSION_MODEL.add_rating(session_id, apartment_id, rating)` - Store rating
  - `SESSION_MODEL.remove_rating(session_id, apartment_id)` - Delete rating
  - `SESSION_MODEL.predict_scores(session_id)` - Returns (apartment_ids, scores) via cosine similarity
  - `SESSION_MODEL.explain_predictions(session_id, apartment_ids)` - Feature contributions

### Data Processing Pipeline (from ExploratoryAnalysis.ipynb)
**Source**: `listings.csv` (3301 rows × 79 cols) → **Output**: `listings_clean.json` (2348 rows × 65 features)

**Critical cleaning steps**:
1. **Column selection**: Keep 18 base cols (id, name, location, price, property_type, room_type, beds, bathrooms, etc.)
2. **Remove NaNs**: Drop rows with missing price, bathrooms, bedrooms, beds
3. **Amenities explosion**: Parse JSON `amenities` → 900+ binary features → keep only top 46 (≥500 occurrences) + `amenity_others`
4. **Semantic fixes**:
   - Impute `beds=0` → `ceil(accommodates/2)`
   - Impute `bedrooms=0` → `beds`
   - Drop listing with `accommodates=2` AND `bedrooms=12` (outlier)
5. **Feature engineering**: `distance_from_city_center` via Haversine (lat/lon to Zurich center: 47.3769, 8.5417)
6. **Encoding in loader.py**: StandardScaler for numeric, OneHotEncoder for categorical (property_type, room_type, neighbourhood)

**Final feature matrix**: `DATASTORE.X` is **dense numpy array** (2348 × ~200 features after encoding)
- Numeric cols: price, distance_from_city_center, lat, lon, minimum_nights, maximum_nights, accommodates, bathrooms, bedrooms, beds, availability_365
- Categorical cols: property_type, room_type, neighbourhood, neighbourhood_group
- Binary cols: 47 amenity features (amenity_WiFi, amenity_Kitchen, amenity_Parking, etc.)
- **Important**: Raw `amenities` stays as string in `DATASTORE.df` for frontend parsing; model uses exploded binary features in `DATASTORE.X`
- **Review fields excluded**: Review scores and counts (number_of_reviews, review_scores_*, etc.) are merged from listings.csv for display but NOT used in recommendations - they're informational only

### Explainability Pattern
Enhanced content-based model using **feature-weighted cosine similarity**, not regression:
- "Coefficients" = feature-weighted user preference vector (location 2.0x, amenities 1.5x, key attributes 1.3x)
- "Contributions" for apartment j = element-wise product: `user_vector * apartment_j_vector` (feature weights already applied)
- **Amenity contributions** are directly interpretable: weighted preference × 1 (has amenity) or × 0 (lacks it)
- **Location features** have 2x influence on recommendations vs baseline features
- Frontend expects: `{ coefficients: {...}, contributions: [{apartment_id: str, features: [{name, value, contribution}]}] }`
- Requires ≥5 ratings to train model (enforced in backend, checked in frontend)

## Common Pitfalls

1. **Don't add regression model** - system uses content-based cosine similarity (see `session_model.py`)
2. **Don't modify preprocessing** without updating BOTH `loader.py` AND `ExploratoryAnalysis.ipynb`
3. **Amenity handling**: Raw `amenities` stays as string in DataFrame for frontend parsing; model uses exploded binary features in `DATASTORE.X`
4. **Don't break multi-view coordination** - always update/read from Zustand store for selections
5. **Don't introduce competing viz libraries** - Plotly.js handles all charts
6. **Don't hard-code localhost URLs** - use `VITE_BACKEND_URL` env var (frontend default: `http://localhost:8000`)
7. **String vs int apartment IDs** - frontend sends strings, backend handles both (see `_sanitize_for_json`)
8. **Farthest-point sampling** - cold-start uses PCA + greedy max-distance selection (see notebook)
9. **Session persistence** - sessions are in-memory only; restarting backend clears all ratings
10. **Model training threshold** - requires ≥5 ratings; frontend shows calibration message below this
11. **Use domain-friendly names** - "Apartment Property Comparison" not "UMAP Scatter", "Model Reasoning" not "Explainability"
12. **Map shows all listings** - no cluster polygons at low zoom; individual markers visible at all zoom levels
13. **Radar chart uses line traces** - not filled polygons (for better visual clarity)
14. **Color consistency critical** - avoid conflicting colors; top 5 recommendations use fixed palette (blue, orange, green, red, purple)
15. **UMAP requires 10+ points** - backend returns empty array if fewer points; frontend handles gracefully
16. **Topic modeling is non-deterministic** - LDA uses random_state=42 but may vary slightly; topics regenerated per request
17. **PCA endpoint redirects to UMAP** - maintained for backward compatibility but uses UMAP+LDA internally
18. **Always activate conda environment** - `conda activate IVDA_GROUP` before running backend commands

## API Endpoints Reference
- `GET /apartments` - Paginated list with 20+ filter params (see `routes.py`)
  - **Supports cluster filtering**: `?cluster_id=X` parameter to filter by K-means cluster
  - **Amenity search**: `?amenities=WiFi,Kitchen,Parking` to filter by specific amenities (47 options available)
  - **Filter params**: price_min/max, accommodates_min/max, bedrooms_min/max, bathrooms_min/max, beds_min/max, room_types, property_types, neighbourhoods, neighbourhood_groups, distance_from_city_center_max, etc.
- `GET /apartments/{id}` - Single apartment detail
- `POST /ratings` - Submit rating, triggers model update (body: `{session_id, apartment_id, rating}`)
- `DELETE /ratings` - Remove a rating by apartment_id and session_id, returns updated ratings_count
- `GET /ratings?session_id=X` - Get all ratings for a session
- `GET /recommendations?session_id=X` - Top-N ranked by cosine similarity
  - **Supports cluster filtering**: `?cluster_id=X` parameter to filter recommendations by cluster
- `GET /umap?attributes=X,Y,Z&n_topics=5` - UMAP projection with LDA topic modeling (primary endpoint)
  - **Raw mode** (2 attributes): Direct X/Y scatter plot
  - **UMAP mode** (3+ attributes): Non-linear dimensionality reduction with semantic topic discovery
  - **Topics**: LDA-based clustering with human-readable labels (e.g., "Entire Home & Zurich")
  - **Non-expert explanation**: Non-linear mapping preserving local structure - similar apartments cluster together
- `GET /pca?attributes=X,Y&mode=raw|pca` - Legacy endpoint, redirects to UMAP for backward compatibility
- `GET /explainability?session_id=X&apartment_ids=Y` - Feature contributions (requires 5+ ratings)
- `GET /clusters` - K-means clusters (5 clusters) for map view
- `GET /initial-sample` - Farthest-first sample for cold-start calibration (5-8 diverse apartments)
- `GET /filter-options` - Available room types, neighbourhoods, property types, **and all 47 amenity names**
- `GET /numeric-distributions` - Min/max/percentiles for numeric attributes (used for filter sliders)
- `GET /recommendations/subset` - Get scores for specific apartment IDs (used for brushed selections)

## Code Style
- **Frontend**: PascalCase components, camelCase functions/vars, TypeScript strict mode
- **Backend**: snake_case everywhere, Black formatter (not enforced), type hints preferred
- **Files**: PascalCase for React components (`MapView.tsx`), snake_case for Python (`session_model.py`)
- Keep components small - extract hooks when logic exceeds ~50 lines
- **Imports**: Group by external → internal → relative, alphabetize within groups

## Testing Strategy with pytest
**Location**: `backend/tests/` (create if missing)

### Test Structure
```python
# tests/test_data_loader.py
def test_amenity_explosion():
    """Verify amenities JSON parsing produces binary features"""
    
def test_distance_calculation():
    """Verify Haversine formula for distance_from_city_center"""
    
def test_semantic_imputation():
    """Beds=0 imputed to ceil(accommodates/2), bedrooms=0 to beds"""

# tests/test_session_model.py
def test_user_vector_centroid():
    """User vector = mean of liked items (rating>=4.0)"""
    
def test_cosine_similarity_scores():
    """Scores match sklearn cosine_similarity output"""

# tests/test_api.py (use FastAPI TestClient)
def test_post_rating():
    """Rating updates session and triggers model recalculation"""
    
def test_get_recommendations():
    """Returns top-N ranked by cosine similarity"""
```

### Running Tests
```pwsh
cd backend
conda activate IVDA_GROUP
pip install pytest pytest-cov  # Add to requirements.txt if missing
pytest -v
pytest --cov=app tests/  # With coverage
```

### Frontend Testing (Not Yet Implemented)
- Focus on utility functions (`utils/formatting.ts`, `utils/colors.ts`)
- Test Zustand store actions (selection, filters, brushing logic)
- Skip Plotly interaction testing (integration test territory)
- Use Vitest (already configured with Vite)

## When Adding Features
1. Verify it supports one of T1-T6 IVDA tasks (see `AGENT.md` section 2.3)
2. Update both TypeScript types AND Pydantic schemas if touching API
3. Maintain multi-view coordination (update Zustand store if selections change)
4. **Write pytest tests** for new backend logic (data processing, model updates)
5. Test with backend running - frontend shows errors without API
6. Update `docs/QUICKSTART.md` if workflow changes

## Feature Status

**✅ COMPLETED:**
- Content-based recommendation system with feature-weighted cosine similarity
  - Feature weighting: location (2.0x), amenities (1.5x), key attributes (1.3x)
  - Recency boost for recent ratings (up to 1.2x)
  - Diversity penalty to encourage variety (0.7x-1.0x based on similarity)
  - Dislike dampening (0.5x factor for ratings ≤1.0)
- **UMAP + LDA Topic Modeling** for semantic apartment clustering
  - Non-linear dimensionality reduction preserving local structure
  - Automatic topic discovery with human-readable labels
  - Dual color modes: Topic and Recommendation
  - Topic legend with keywords explaining each cluster
- **Amenity search and filtering** (47 amenity options: WiFi, Kitchen, Parking, Pet-friendly, Washer, etc.)
- Integrated explainability panel in RecommendedListView
- Tabbed view (All / My Ratings / Bookmarked)
- Multi-ranking options (model-based + 5 attribute-based rankings)
- Cluster filtering on map and recommendations
- Rating management (add/remove ratings with timestamps)
- Fullscreen map expansion
- **Domain-friendly titles** ("Apartment Property Comparison" instead of "PCA/UMAP")
- **Line traces in radar chart** (not filled polygons)
- **Map shows all listings** (no cluster polygons)

**🚧 IN PROGRESS:**
- **Before/After Model Comparison** (T3):
  - Toggle in ExplainabilityView to compare initial vs calibrated model
  - Show how recommendations evolved with more ratings
  - Snapshot storage at rating thresholds (1, 3, 5, 10, 15, 20)

**📋 PLANNED:**
- **Enhanced Explainability Visualization:**
  - More intuitive visualization for non-experts (radar overlay, feature alignment matrix)
  - Goal: Make content-based model reasoning clearer without ML knowledge

- **Amenity-Based Recommendations:**
  - "Find similar apartments" based on amenity overlap
  - Amenity importance learning per user

- **Improved Cold-Start Experience:**
  - Explain WHY farthest-first sample was chosen (diversity visualization)
  - Calibration progress with visual feedback (confidence gauge)
  - Progressive disclosure: unlock features as more ratings collected

## Integration Points
- **Frontend ↔ Backend**: REST JSON over HTTP, no WebSockets
- **Cross-view communication**: Zustand store broadcasts via React subscriptions
- **Color coordination**: `getTopRecommendationColor()` in `utils/colors.ts` maps apartment ID → consistent color
- **Brush selections**: Plotly `selectedData` event → `setBrushedApartmentIds()` → other views filter

---

**See `AGENT.md` for comprehensive guidelines. This file covers 80% of daily coding tasks.**
