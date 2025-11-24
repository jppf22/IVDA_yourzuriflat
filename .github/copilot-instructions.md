# YourZuriFlat - AI Coding Assistant Guide

## Project Purpose
Interactive Visual Data Analysis (IVDA) tool for Zurich apartment rentals. **Content-based recommendation system** using cosine similarity to learn user preferences from ratings. **Always align changes with IVDA tasks T1-T6** (identify, compare, explain, calibrate, explore, relate apartments - see `AGENT.md` section 2.3).

## Architecture

### Frontend: React + Vite + TypeScript
**Location**: `frontend/` 
- **State**: React Query (@tanstack/react-query) for server state + Zustand (`store/useAppStore.ts`) for UI state
- **Viz**: Plotly.js (via react-plotly.js) ONLY - no other chart libraries
- **Multi-view coordination**: Linked brushing via `selectedApartmentIds` and `brushedApartmentIds` in Zustand
- **Color encoding**: Top 5 recommendations get consistent colors across views (see `utils/colors.ts`)
- **Persistence**: `bookmarkedApartmentIds` and `userRatings` persist via Zustand middleware

### Backend: Python + FastAPI
**Location**: `backend/`
- **Model**: Content-based filtering with cosine similarity (`app/models/session_model.py`)
  - User vector = centroid of liked apartments (rating ≥ 4.0)
  - Recommendations ranked by cosine similarity to user vector
- **Data**: In-memory pandas DataFrame (2348 apartments × ~200 features after encoding)
- **Session management**: In-memory dict `SESSION_MODEL.sessions` - no database required

### Critical Data Flow
1. User rates apartment → Frontend calls `POST /ratings` → `SESSION_MODEL.add_rating()`
2. Model rebuilds user vector as normalized centroid of liked item vectors
3. Frontend requests `GET /recommendations?session_id=X` → Backend returns apartments ranked by cosine similarity
4. Frontend displays top-N with consistent color encoding across all views
5. After 5+ ratings: Explainability panel shows feature contributions (element-wise product of user vector × apartment vector)

## Type Synchronization (CRITICAL)
**Backend Pydantic models MUST match Frontend TypeScript types**:
- Backend: `app/api/routes.py` - Pydantic BaseModel classes defined inline
- Frontend: `src/api/types.ts` - ALL TypeScript interfaces
- **When changing API: Update BOTH files in same commit**

Key type contracts to maintain:
- `Apartment` - Core data model (65+ fields including amenities, price, location)
- `RatingRequest` - Session + apartment ID + rating value
- `RecommendationsResponse` - Array of apartments with scores
- `PCAResponse` - 2D projection data for scatter plot
- `ExplainabilityResponse` - Feature coefficients and contributions per apartment

**ID Handling**: Frontend sends string IDs, backend normalizes to string internally (see `_sanitize_for_json()` and `_ensure_string_id()` in `routes.py`).

## Development Workflow

### Start Backend (Windows PowerShell)
```pwsh
cd backend
conda activate IVDA_GROUP  # Use existing conda env
pip install -r requirements.txt  # fastapi, uvicorn, pandas, numpy, scikit-learn
uvicorn app.main:app --reload
```
Backend runs at `http://localhost:8000` | Docs at `http://localhost:8000/docs`

### Start Frontend
```pwsh
cd frontend
npm install  # If first time or package.json changed
npm run dev
```
Frontend runs at `http://localhost:5173`

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
2. **`backend/app/models/session_model.py`** - Content-based cosine similarity model (164 lines)
3. **`backend/app/data/loader.py`** - Data preprocessing implementing notebook logic (221 lines)
4. **`backend/app/api/routes.py`** - All API endpoints in single file (764 lines)
5. **`frontend/src/store/useAppStore.ts`** - Global UI state with bookmarks, ratings, selections (309 lines)
6. **`frontend/src/api/types.ts`** - Type contracts with backend (205 lines)
7. **`AGENT.md`** - Comprehensive project guidelines (608 lines) - cross-reference with notebook for accuracy

## Project-Specific Patterns

### Frontend Components
- **Views** (`src/views/`) = page-level containers implementing IVDA tasks T1-T6
  - `LayoutView.tsx` - Main multi-view coordinator
  - `RecommendedListView.tsx` - T1/T4: List with tabs (All/Ratings/Bookmarks) + integrated explainability panel
  - `MapView.tsx` - T5: Plotly scattermapbox with cluster markers
  - `PCAScatterView.tsx` - T6: 2D projections (raw attributes or PCA)
  - `StarComparisonView.tsx` - T2: Radar charts comparing up to 5 apartments
  - `ExplainabilityView.tsx` - T3: Bar charts showing feature contributions
- **Components** (`src/components/`) = reusable widgets
  - `ApartmentDetailDrawer.tsx` - Drawer for single apartment detail
  - `FilterPanel.tsx` - Multi-attribute filtering UI
  - `RatingControl.tsx` - Star rating input
- **State Management**:
  - Always use `useAppStore()` for cross-view state (selections, filters, brushing, session)
  - Use React Query hooks from `src/api/hooks.ts` for server data - NEVER direct axios calls
  - Example: `const { sessionId, selectedApartmentIds, setSelectedApartmentIds } = useAppStore()`

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
Content-based model using **cosine similarity**, not regression:
- "Coefficients" = user preference vector (normalized centroid of liked items)
- "Contributions" for apartment j = element-wise product: `user_vector * apartment_j_vector`
- **Amenity contributions** are directly interpretable: positive weight × 1 (has amenity) or × 0 (lacks it)
- Frontend expects: `{ coefficients: {...}, contributions: [{apartment_id: str, features: [{name, value, contribution}]}] }`
- Requires ≥5 ratings to train model (enforced in backend, checked in frontend)

## Common Pitfalls

1. **Don't add regression model** - system uses content-based cosine similarity (see `session_model.py`)
2. **Don't modify preprocessing** without updating BOTH `loader.py` AND `ExploratoryAnalysis.ipynb`
3. **Amenity handling**: Raw `amenities` stays as string in DataFrame for frontend parsing; model uses exploded binary features
4. **Don't break multi-view coordination** - always update/read from Zustand store for selections
5. **Don't introduce competing viz libraries** - Plotly.js handles all charts
6. **Don't hard-code localhost URLs** - use `VITE_BACKEND_URL` env var (frontend default: `http://localhost:8000`)
7. **String vs int apartment IDs** - frontend sends strings, backend handles both (see `_sanitize_for_json`)
8. **Farthest-point sampling** - cold-start uses PCA + greedy max-distance selection (see notebook cell #VSC-4b33627a)
9. **Session persistence** - sessions are in-memory only; restarting backend clears all ratings
10. **Model training threshold** - requires ≥5 ratings; frontend shows calibration message below this

## API Endpoints Reference
- `GET /apartments` - Paginated list with 20+ filter params (see `routes.py` line 61)
  - **Supports cluster filtering**: `?cluster_id=X` parameter to filter by K-means cluster
  - **Filter params**: price_min/max, accommodates_min/max, bedrooms_min/max, bathrooms_min/max, beds_min/max, room_types, property_types, neighbourhoods, neighbourhood_groups, distance_from_city_center_max, etc.
- `GET /apartments/{id}` - Single apartment detail
- `POST /ratings` - Submit rating, triggers model update (body: `{session_id, apartment_id, rating}`)
- `DELETE /ratings` - Remove a rating by apartment_id and session_id, returns updated ratings_count
- `GET /ratings?session_id=X` - Get all ratings for a session
- `GET /recommendations?session_id=X` - Top-N ranked by cosine similarity
  - **Supports cluster filtering**: `?cluster_id=X` parameter to filter recommendations by cluster
- `GET /pca?attributes=X,Y&mode=raw|pca` - 2D projection for scatter view
- `GET /explainability?session_id=X&apartment_ids=Y` - Feature contributions (requires 5+ ratings)
- `GET /clusters` - K-means clusters (5 clusters) for map view
- `GET /initial-sample` - Farthest-first sample for cold-start calibration
- `GET /filter-options` - Available room types, neighbourhoods, property types, etc.

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

## Incomplete/Planned Features (as of expert feedback)
1. **Before/After Model Comparison** (Frontend):
   - Add toggle or small multiples view showing recommendation changes
   - Compare initial model (few ratings) vs calibrated model (5+ ratings)
   - Could show side-by-side apartment lists or parallel coordinate plots
   
2. **✅ COMPLETED: Integrated Explainability Panel** (Frontend):
   - **Implementation**: Split-panel layout in `RecommendedListView.tsx`
   - **Activation**: After 5+ ratings (calibration complete), explainability panel appears
   - **Features**:
     - Side-by-side view: Recommendations table (60%) + Explainability panel (38%)
     - Click 💡 button next to any apartment to see feature contributions
     - Auto-selects first recommendation on panel open
     - Top 12 feature contributions shown as horizontal bars
     - Positive (green) and negative (red) contribution visualization
     - Similarity score displayed prominently
     - Toggle button to show/hide panel without losing state
   - **Files Modified**:
     - `frontend/src/views/RecommendedListView.tsx` - Added useState hooks, useExplainability hook, panel rendering
     - `frontend/src/views/RecommendedListView.css` - Added 300+ lines for split layout, panel styling, contribution bars
   - **User Flow**: Rate apartments → After 5 ratings → Panel auto-shows → Click 💡 on any apartment → See why it was recommended

3. **✅ COMPLETED: Cluster Filtering** (Backend + Frontend):
   - **Backend**: K-means clustering (5 clusters, random_state=0) computed dynamically on filtered data
   - **Endpoints**: `GET /apartments?cluster_id=X` and `GET /recommendations?cluster_id=X` support cluster filtering
   - **Frontend**: Cluster filter in UI allows users to filter apartments by geographic/feature-based clusters
   - **Files Modified**:
     - `backend/app/api/routes.py` - Added cluster filtering logic to /apartments and /recommendations
     - Frontend components updated to support cluster_id parameter

4. **✅ COMPLETED: Rating Management** (Backend + Frontend):
   - **Backend**: `DELETE /ratings` and `GET /ratings` endpoints for rating removal and retrieval
   - **Frontend**: Remove button (❌) on rated apartments in RecommendedListView
   - **Features**:
     - Delete ratings with automatic UI updates across all views
     - Backend returns updated ratings_count after deletion
     - React Query automatically invalidates recommendations and explainability caches
   - **Files Modified**:
     - `backend/app/models/session_model.py` - Added remove_rating() and get_ratings() methods
     - `backend/app/api/routes.py` - Added DELETE and GET /ratings endpoints
     - `frontend/src/api/hooks.ts` - Added useRemoveRatingMutation() hook
     - `frontend/src/views/RecommendedListView.tsx` - Added remove button UI

5. **✅ COMPLETED: Tabbed View & Bookmarks** (Frontend):
   - **Three Tabs in RecommendedListView**:
     - 📋 **All Listings**: Shows all apartments (default view)
     - ⭐ **My Ratings**: Shows only rated apartments (filtered by currentRatings)
     - 📌 **Bookmarked**: Shows only bookmarked apartments
   - **Bookmark System**:
     - Click 📌 button to bookmark any apartment
     - Bookmarked apartments show 🔖 icon
     - Bookmarks persist in browser storage (Zustand persistence)
     - Toggle on/off with visual feedback (gray → yellow)
   - **Dynamic Counters**: Each tab shows live count of apartments
   - **Empty States**: Helpful messages when filtered tabs are empty
   - **Files Modified**:
     - `frontend/src/store/useAppStore.ts` - Added bookmarkedApartmentIds, toggleBookmark(), clearBookmarks()
     - `frontend/src/views/RecommendedListView.tsx` - Added tab state, filtering logic, bookmark buttons
     - `frontend/src/views/RecommendedListView.css` - Tab navigation and bookmark button styles

6. **✅ COMPLETED: Explainability Model Training Check** (Frontend):
   - **Implementation**: Added model readiness check to prevent API errors
   - **Features**:
     - `useExplainability` hook checks `ratingsCount >= 5` before making API calls
     - ExplainabilityView shows calibration message when model not ready
     - Displays progress: "Current ratings: X/5"
     - Prevents 400 errors from backend when model not trained
   - **Files Modified**:
     - `frontend/src/api/hooks.ts` - Added modelTrained parameter and isModelReady check
     - `frontend/src/views/ExplainabilityView.tsx` - Added isModelReady state and calibration message
     - `frontend/src/views/RecommendedListView.tsx` - Passes isModelReady to useExplainability

7. **Enhanced Cold-Start Calibration** (Backend):
   - Farthest-point sampling logic exists in notebook but may need refinement
   - Consider showing user WHY these 5 listings were selected (diversity explanation)

8. **Dynamic Amenity Filtering** (Frontend):
   - FilterPanel could include amenity checkboxes (WiFi, parking, etc.)
   - Backend `/apartments` endpoint needs amenity filter params

## Integration Points
- **Frontend ↔ Backend**: REST JSON over HTTP, no WebSockets
- **Cross-view communication**: Zustand store broadcasts via React subscriptions
- **Color coordination**: `getTopRecommendationColor()` in `utils/colors.ts` maps apartment ID → consistent color
- **Brush selections**: Plotly `selectedData` event → `setBrushedApartmentIds()` → other views filter

---

**See `AGENT.md` for comprehensive guidelines. This file covers 80% of daily coding tasks.**
1. **Before/After Model Comparison** (Frontend):
   - Add toggle or small multiples view showing recommendation changes
   - Compare initial model (few ratings) vs calibrated model (5+ ratings)
   - Could show side-by-side apartment lists or parallel coordinate plots
   
2. **✅ COMPLETED: Integrated Explainability Panel** (Frontend):
   - **Implementation**: Split-panel layout in `RecommendedListView.tsx`
   - **Activation**: After 5+ ratings (calibration complete), explainability panel appears
   - **Features**:
     - Side-by-side view: Recommendations table (60%) + Explainability panel (38%)
     - Click 💡 button next to any apartment to see feature contributions
     - Auto-selects first recommendation on panel open
     - Top 12 feature contributions shown as horizontal bars
     - Positive (green) and negative (red) contribution visualization
     - Similarity score displayed prominently
     - Toggle button to show/hide panel without losing state
   - **Files Modified**:
     - `frontend/src/views/RecommendedListView.tsx` - Added useState hooks, useExplainability hook, panel rendering
     - `frontend/src/views/RecommendedListView.css` - Added 300+ lines for split layout, panel styling, contribution bars
   - **User Flow**: Rate apartments → After 5 ratings → Panel auto-shows → Click 💡 on any apartment → See why it was recommended

3. **✅ COMPLETED: Cluster Filtering** (Backend + Frontend):
   - **Backend**: K-means clustering (5 clusters, random_state=0) computed dynamically on filtered data
   - **Endpoints**: `GET /apartments?cluster_id=X` and `GET /recommendations?cluster_id=X` support cluster filtering
   - **Frontend**: Cluster filter in UI allows users to filter apartments by geographic/feature-based clusters
   - **Files Modified**:
     - `backend/app/api/routes.py` - Added cluster filtering logic to /apartments and /recommendations
     - Frontend components updated to support cluster_id parameter

4. **✅ COMPLETED: Rating Management** (Backend + Frontend):
   - **Backend**: `DELETE /ratings` and `GET /ratings` endpoints for rating removal and retrieval
   - **Frontend**: Remove button (❌) on rated apartments in RecommendedListView
   - **Features**:
     - Delete ratings with automatic UI updates across all views
     - Backend returns updated ratings_count after deletion
     - React Query automatically invalidates recommendations and explainability caches
   - **Files Modified**:
     - `backend/app/models/session_model.py` - Added remove_rating() and get_ratings() methods
     - `backend/app/api/routes.py` - Added DELETE and GET /ratings endpoints
     - `frontend/src/api/hooks.ts` - Added useRemoveRatingMutation() hook
     - `frontend/src/views/RecommendedListView.tsx` - Added remove button UI

5. **✅ COMPLETED: Tabbed View & Bookmarks** (Frontend):
   - **Three Tabs in RecommendedListView**:
     - 📋 **All Listings**: Shows all apartments (default view)
     - ⭐ **My Ratings**: Shows only rated apartments (filtered by currentRatings)
     - 📌 **Bookmarked**: Shows only bookmarked apartments
   - **Bookmark System**:
     - Click 📌 button to bookmark any apartment
     - Bookmarked apartments show 🔖 icon
     - Bookmarks persist in browser storage (Zustand persistence)
     - Toggle on/off with visual feedback (gray → yellow)
   - **Dynamic Counters**: Each tab shows live count of apartments
   - **Empty States**: Helpful messages when filtered tabs are empty
   - **Files Modified**:
     - `frontend/src/store/useAppStore.ts` - Added bookmarkedApartmentIds, toggleBookmark(), clearBookmarks()
     - `frontend/src/views/RecommendedListView.tsx` - Added tab state, filtering logic, bookmark buttons
     - `frontend/src/views/RecommendedListView.css` - Tab navigation and bookmark button styles

6. **✅ COMPLETED: Explainability Model Training Check** (Frontend):
   - **Implementation**: Added model readiness check to prevent API errors
   - **Features**:
     - `useExplainability` hook checks `ratingsCount >= 5` before making API calls
     - ExplainabilityView shows calibration message when model not ready
     - Displays progress: "Current ratings: X/5"
     - Prevents 400 errors from backend when model not trained
   - **Files Modified**:
     - `frontend/src/api/hooks.ts` - Added modelTrained parameter and isModelReady check
     - `frontend/src/views/ExplainabilityView.tsx` - Added isModelReady state and calibration message
     - `frontend/src/views/RecommendedListView.tsx` - Passes isModelReady to useExplainability

7. **Enhanced Cold-Start Calibration** (Backend):
   - Farthest-point sampling logic exists in notebook but may need refinement
   - Consider showing user WHY these 5 listings were selected (diversity explanation)

8. **Dynamic Amenity Filtering** (Frontend):
   - FilterPanel could include amenity checkboxes (WiFi, parking, etc.)
   - Backend `/apartments` endpoint needs amenity filter params

## Integration Points
- **Frontend ↔ Backend**: REST JSON over HTTP, no WebSockets
- **Cross-view communication**: Zustand store broadcasts via React subscriptions
- **Color coordination**: `getTopRecommendationColor()` in `utils/colors.ts` maps apartment ID → consistent color
- **Brush selections**: Plotly `selectedData` event → `setBrushedApartmentIds()` → other views filter

---

**See `AGENT.md` for comprehensive guidelines. This file covers 80% of daily coding tasks.**
