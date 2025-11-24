# YourZuriFlat - AI Coding Assistant Guide

## Project Purpose
Interactive Visual Data Analysis (IVDA) tool for Zurich apartment rentals. **Content-based recommendation system** analyzing user preferences for listing features (amenities like WiFi, parking, kitchen, etc.) using cosine similarity. **Always align changes with IVDA tasks T1-T6** (identify, compare, explain, calibrate, explore, relate apartments).

## Architecture

### Frontend: React + Vite + TypeScript
**Location**: `myzuriflat_frontend/`
- **State**: React Query (server) + Zustand (`store/useAppStore.ts`) for UI state
- **Viz**: Plotly.js ONLY - no additional chart libraries
- **Multi-view coordination**: Linked brushing via `selectedApartmentIds` and `brushedApartmentIds` in Zustand store
- **Color encoding**: Top 5 recommendations use consistent colors across all views (see `utils/colors.ts`)
- **Before/after comparison**: Consider toggle or small multiples to show model output changes as users add ratings

### Backend: Python + FastAPI
**Location**: `backend/`
- **Model**: Content-based filtering with cosine similarity - see `app/models/session_model.py`
- **Features**: Amenities (WiFi, parking, kitchen, etc.) + property attributes (price, beds, location)
- **Data**: In-memory pandas DataFrame (2348 rows × 65 features) from `data/listings_clean.json`
- **Session management**: In-memory dict in `SESSION_MODEL` - no persistence required

### Critical Data Flow
1. Frontend sends rating → `POST /ratings` → `SESSION_MODEL.add_rating()`
2. Model computes user vector as centroid of liked items (rating ≥ 4.0)
3. Recommendations via cosine similarity between user vector and apartment feature vectors (includes amenities)
4. Frontend maintains session via `sessionId` in Zustand (auto-generated client-side)

## Type Synchronization (CRITICAL)
**Backend Pydantic schemas MUST match Frontend TypeScript types**:
- Backend: `app/api/routes.py` (inline models) and response structures
- Frontend: `src/api/types.ts` (ALL interfaces)
- When changing API: Update BOTH files in same commit

Example type names to keep aligned:
- `Apartment`, `RatingRequest`, `RecommendationsResponse`, `PCAResponse`, `ExplainabilityResponse`

## Development Workflow

### Start Backend (Windows PowerShell)
```pwsh
cd backend
conda activate IVDA_GROUP  # Use existing conda env
pip install -r requirements.txt
uvicorn app.main:app --reload
```
Backend runs at `http://localhost:8000`

### Start Frontend
```pwsh
cd myzuriflat_frontend
npm install
npm run dev
```
Frontend runs at `http://localhost:5173`

### Running Tests
```pwsh
# Backend
cd backend
pytest

# Frontend
cd myzuriflat_frontend
npm test
```

## Key Files to Read First
1. **`backend/Notebooks/ExploratoryAnalysis.ipynb`** - Data cleaning & feature engineering (702 lines) - **CRITICAL for understanding data**
2. **`AGENT.md`** - Project guidelines (608 lines) - may be outdated, cross-reference with notebook
3. **`backend/app/models/session_model.py`** - Content-based cosine similarity model
4. **`backend/app/data/loader.py`** - Data preprocessing (implements notebook logic)
5. **`myzuriflat_frontend/src/store/useAppStore.ts`** - Global UI state (239 lines)
6. **`myzuriflat_frontend/src/api/types.ts`** - Type contracts with backend

## Project-Specific Patterns

### Frontend Components
- **Views** (`src/views/`) = page-level containers implementing IVDA tasks
- **Components** (`src/components/`) = reusable widgets (drawers, filters, controls)
- Always use `useAppStore()` for cross-view state (selections, filters, session)
- Use React Query hooks from `src/api/hooks.ts` for server data (never direct axios calls)

### Backend Routes
- All routes in single file: `app/api/routes.py` (608 lines)
- Use `_sanitize_for_json()` helper to convert numpy types → native Python before returning
- Access data via `DATASTORE.df` (raw), `DATASTORE.X` (feature matrix)
- Access model via `SESSION_MODEL.add_rating()`, `SESSION_MODEL.predict_scores()`

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
6. **Encoding**: StandardScaler for numeric, OneHotEncoder for categorical (property_type, room_type, neighbourhood)

**Final feature matrix**: `DATASTORE.X` is **dense numpy array** (2348 × ~200 features after encoding)
- Numeric cols: price, distance_from_city_center, lat, lon, minimum_nights, maximum_nights, accommodates, bathrooms, bedrooms, beds
- Categorical cols: property_type, room_type, neighbourhood, neighbourhood_group
- Binary cols: 47 amenity features (amenity_WiFi, amenity_Kitchen, amenity_Parking, etc.)

### Explainability Pattern
Content-based model using **cosine similarity**, not regression:
- "Coefficients" = user preference vector (centroid of liked items)
- "Contributions" = element-wise product of user vector × apartment vector
- **Amenity contributions** are directly interpretable (WiFi weight × listing has WiFi)
- Frontend expects: `{ coefficients: {...}, contributions: [...] }` format

## Common Pitfalls

1. **Don't add regression model** - system uses content-based cosine similarity (see `session_model.py`)
2. **Don't modify preprocessing** without updating BOTH `loader.py` AND `ExploratoryAnalysis.ipynb`
3. **Amenity handling**: Raw `amenities` stays as string in DataFrame for frontend parsing; model uses exploded binary features
4. **Don't break multi-view coordination** - always update/read from Zustand store for selections
5. **Don't introduce competing viz libraries** - Plotly.js handles all charts
6. **Don't hard-code localhost URLs** - use `VITE_BACKEND_URL` env var
7. **String vs int apartment IDs** - frontend sends strings, backend handles both (see `_sanitize_for_json`)
8. **Farthest-point sampling** - cold-start uses PCA + greedy max-distance selection (see notebook cell #VSC-4b33627a)

## API Endpoints Reference
- `GET /apartments` - Paginated list with 20+ filter params (see `routes.py` line 61)
- `GET /apartments/{id}` - Single apartment detail
- `POST /ratings` - Submit rating, triggers model update
- `GET /recommendations?session_id=X` - Top-N ranked by cosine similarity
- `GET /pca?attributes=X,Y&mode=raw|pca` - 2D projection for scatter view
- `GET /explainability?session_id=X&apartment_ids=Y` - Feature contributions
- `GET /clusters` - K-means clusters for map view
- `GET /initial-sample` - Farthest-first sample for cold-start calibration
- `GET /filter-options` - Available room types, neighbourhoods, etc.

## Code Style
- **Frontend**: PascalCase components, camelCase functions/vars, TypeScript strict mode
- **Backend**: snake_case everywhere, Black formatter, type hints preferred
- **Files**: PascalCase for React components (`MapView.tsx`), snake_case for Python
- Keep components small - extract hooks when logic exceeds ~50 lines

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
pip install pytest pytest-cov  # Add to requirements.txt
pytest -v
pytest --cov=app tests/  # With coverage
```

### Frontend Testing
- Focus on utility functions (`utils/formatting.ts`, `utils/colors.ts`)
- Test Zustand store actions (selection, filters, brushing logic)
- Skip Plotly interaction testing (integration test territory)

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
     - `myzuriflat_frontend/src/views/RecommendedListView.tsx` - Added useState hooks, useExplainability hook, panel rendering
     - `myzuriflat_frontend/src/views/RecommendedListView.css` - Added 300+ lines for split layout, panel styling, contribution bars
   - **User Flow**: Rate apartments → After 5 ratings → Panel auto-shows → Click 💡 on any apartment → See why it was recommended

3. **Enhanced Cold-Start Calibration** (Backend):
   - Farthest-point sampling logic exists in notebook but may need refinement
   - Consider showing user WHY these 5 listings were selected (diversity explanation)

4. **Dynamic Amenity Filtering** (Frontend):
   - FilterPanel could include amenity checkboxes (WiFi, parking, etc.)
   - Backend `/apartments` endpoint needs amenity filter params

## Integration Points
- **Frontend ↔ Backend**: REST JSON over HTTP, no WebSockets
- **Cross-view communication**: Zustand store broadcasts via React subscriptions
- **Color coordination**: `getTopRecommendationColor()` in `utils/colors.ts` maps apartment ID → consistent color
- **Brush selections**: Plotly `selectedData` event → `setBrushedApartmentIds()` → other views filter

---

**See `AGENT.md` for comprehensive guidelines. This file covers 80% of daily coding tasks.**
