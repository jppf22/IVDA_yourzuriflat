# AGENT.md

Guidelines for AI coding assistants working on YourZuriFlat in VS Code.

## 1. Agent Role & Goals

You are a senior full-stack engineer and IVDA-savvy assistant working in this repository.

### Your primary goals:

- **Implement and maintain YourZuriFlat**, an interactive visual data analysis tool for short-term apartment rentals in Zurich.
- **Provide a multi-view interactive visualization UI** that helps non-expert users find suitable apartments.
- **Implement a Python backend** that:
  - Loads and preprocesses the Zurich apartment dataset.
  - Implements a **content-based recommendation system** using cosine similarity to learn user preferences.
  - Exposes RESTful JSON APIs for recommendations, PCA, clustering, and explainability.
- **Respect and preserve the chosen tech stack:**
  - **Frontend:** React + Vite + TypeScript (Node.js/npm), with Plotly.js for visualizations.
  - **Backend:** Python FastAPI.
- **Maintain code quality, consistency, and clarity** while keeping the implementation appropriate for a university course project (no unnecessary over-engineering).

When in doubt, align your work with the IVDA tasks (T1–T6) and the human-in-the-loop recommendation goal.

## 2. Project Overview

### 2.1 Domain & Dataset

**Domain:** Short-term apartment rentals in Zurich (Airbnb-like listings).

**Users:** Non-expert short-term renters who want to find a place matching their preferences.

**Dataset:**
- **Source:** `data/listings.csv` (tabular).
- **Size:** Initially 3301 rows → after preprocessing: **2348 apartments**.
- **Attributes:** 65+ fields after feature engineering, including:
  - **Location:** latitude, longitude, neighbourhood, neighbourhood_group
  - **Listing type:** room_type, property_type
  - **Price & availability:** price, minimum_nights, maximum_nights, availability_365
  - **Capacity:** accommodates, bedrooms, bathrooms, beds
  - **Reviews:** number_of_reviews, review_scores_*, last_review
  - **Amenities:** 47 binary amenity features (WiFi, Kitchen, Parking, etc.) + amenity_others
  - **Engineered:** distance_from_city_center (Haversine distance to Zurich center: 47.3769, 8.5417)

**Preprocessing** (see `backend/Notebooks/ExploratoryAnalysis.ipynb` for details):
- Select 18 base columns, drop rows with missing price/bathrooms/bedrooms/beds.
- Parse JSON `amenities` field → 900+ binary features → keep top 46 (≥500 occurrences) + `amenity_others`.
- Semantic fixes: impute `beds=0` → `ceil(accommodates/2)`, `bedrooms=0` → `beds`.
- Remove outlier: `accommodates=2` AND `bedrooms=12`.
- Compute `distance_from_city_center` via Haversine formula.
- **Final feature matrix:** 2348 apartments × ~200 features (after StandardScaler + OneHotEncoder).

The dataset is small enough to stay in memory in the backend.

### 2.2 Human-in-the-Loop & Cold-Start Problem

The central challenge is the **cold-start problem**: at initialization, the system has no user-specific labels.

**Core idea:**
- Users rate apartments via a 1-5 star rating system.
- An **enhanced content-based filtering model** builds a user preference vector with:
  - **Feature weighting:** Location (2.0x), amenities (1.5x), and key attributes (1.3x) emphasized
  - **Recency boost:** More recent ratings weighted up to 1.2x higher
  - **Weighted centroid:** Liked items (rating ≥ 4.0) averaged with recency and rating strength weights
  - **Dampened dislikes:** Disliked items (rating ≤ 1.0) subtracted with 0.5x factor
- The model ranks apartments by **feature-weighted cosine similarity** between user vector and apartment vectors.
- **Diversity penalty** reduces scores for apartments too similar to already-rated ones (encourages variety).
- As users continue rating, the model updates in real-time, improving personalization.
- **Farthest-first sampling** (PCA + greedy max-distance selection) provides 5-8 diverse apartments for initial calibration.
- **Model activation:** Requires ≥5 ratings to train; frontend shows calibration progress until threshold met.

### 2.3 IVDA Tasks (T1–T6)

YourZuriFlat is designed around the following core analysis tasks:

**T1 – Identify suitable apartments**  
Discover listings aligned with learned user preferences through **content-based cosine similarity ranking**. Users can switch between:
- Model-based recommendations (cosine similarity scores)
- Attribute-based rankings (price, distance, reviews, beds)
- Search and filter by amenities (WiFi, Kitchen, Parking, Pet-friendly, etc.)

The system provides tabs for All Listings, My Ratings, and Bookmarked apartments.

**T2 – Compare apartments by attributes**  
Analyze trade-offs across dimensions like price, proximity to center, room type, etc. using a **radar chart with line traces** (not filled polygons) comparing up to 5 apartments on normalized attributes. Supports dynamic attribute selection with presets for common comparisons.

**T3 – Summarize model reasoning**  
Visualize **feature contributions** from the content-based model using:
- Horizontal bar charts showing element-wise products (user_vector * apartment_vector)
- Positive contributions (features driving recommendation) vs negative contributions
- Top 12 most influential features per apartment
- **Before/After comparison:** Track how recommendations change as more ratings are collected (compare initial vs calibrated model)

Explainability is available after 5+ ratings; uses cosine similarity decomposition, not regression coefficients.

**T4 – Calibrate regression**  
Collect sufficient initial user ratings to overcome cold start.

**T5 – Explore apartments**  
Enable browsing and filtering independent of the model's recommendations:
- **Amenity search:** Filter by specific amenities (WiFi, Kitchen, Parking, Pet-friendly, Washer, etc.)
- **Interactive map:** Shows all listings with detailed popups on zoom (not cluster polygons)
- Multi-attribute filtering (price, bedrooms, distance, room type, neighbourhood)
- Toggle heatmap overlay for recommendation density (when model is trained)
- Expandable fullscreen map mode

**T6 – Relate apartment attributes**  
Visualize correlations and structure in feature space using:
- **"Apartment Property Comparison"** view (replaces technical "PCA" terminology for non-experts)
- 2D scatter plot: raw attribute pairs (2 attrs) or dimensionality reduction (>2 attrs)
- Multi-attribute selection with filtering and search
- Brushing/lasso selection to highlight apartments across views
- Optional outlier filtering to focus on typical apartments
- Color-coded by recommendation rank when model is trained

**Every UI or backend change should clearly support one or more of T1–T6.** Avoid adding unrelated visualizations.

## 3. Architecture

### 3.1 High-Level Overview

**Frontend**
- React app bootstrapped with Vite.
- Written in TypeScript where possible (if the repo is already JS, follow existing convention).
- Uses Plotly.js (via react-plotly.js) for all charts and visualizations.
- Uses Node.js (npm) for dependency management and scripts.

**Backend**
- Python backend using **FastAPI**.
- Exposes RESTful JSON APIs for data access, model updates, and analytics.
- Holds the entire dataset in memory (2348 apartments × ~200 features) and maintains session-specific user preference vectors.
- **No database required** – sessions stored in-memory dict (clears on restart).

**Communication**
- Frontend ↔ Backend via HTTP + JSON.
- APIs documented via FastAPI auto-generated OpenAPI docs at `/docs`.
- **Single-file architecture:** All routes in `backend/app/api/routes.py` (826 lines).
- Pydantic models defined inline in routes file (no separate schemas directory).

### 3.2 Actual Directory Structure

The project uses the following structure:

```
/ (repo root)
  AGENT.md
  README.md
  environment.yml
  .github/
    copilot-instructions.md  # AI assistant quick reference
  /frontend
    index.html
    vite.config.ts
    package.json
    src/
      main.tsx
      App.tsx
      components/       # Reusable UI components
      views/           # Page-level IVDA task implementations
      api/
        client.ts      # Axios instance
        hooks.ts       # React Query hooks
        types.ts       # TypeScript interfaces (sync with backend)
      store/
        useAppStore.ts # Zustand global state
      utils/
        colors.ts      # Color encoding logic
        formatting.ts  # Display formatters
  /backend
    requirements.txt
    app/
      main.py          # FastAPI app initialization
      __init__.py
      api/
        routes.py      # ALL endpoints (single file: 826 lines)
      data/
        loader.py      # Data loading + feature engineering
      models/
        session_model.py # Content-based cosine similarity
      Notebooks/
        ExploratoryAnalysis.ipynb  # Data preprocessing source of truth
  /data
    listings.csv       # Raw Airbnb data (3301 rows)
    listings_clean.json # Preprocessed (2348 apartments)
  /docs
    QUICKSTART.md
    frontend/
      FRONTEND_IMPLEMENTATION.md
```

- **Frontend code** stays under `/frontend`.
- **Backend code** stays under `/backend`.
- **Shared API types:**
  - **Backend:** Pydantic models defined inline in `routes.py`.
  - **Frontend:** TypeScript interfaces in `frontend/src/api/types.ts`.
  - **Keep these in sync** – when changing API, update both files in same commit.

**When you see an existing structure, conform to it rather than inventing a new one.**

## 4. Frontend Guidelines

### 4.1 Stack & Libraries

**Required:**
- React
- Vite
- npm (no Yarn/pnpm unless the repo already uses them)

**Preferred:**
- TypeScript
- React Router for view-level navigation if needed.
- Lightweight state management:
  - React Query (or TanStack Query) for server state (API data).
  - Local component state or simple global store (e.g., Zustand) for UI preferences.

**Visualization:**
- Use Plotly.js via react-plotly.js for:
  - Recommended list enhancements (e.g., in-row mini visual cues if desired).
  - Map view (e.g., scattermapbox or scattergeo).
  - PCA / scatterplot view.
  - Star / radar charts.
  - Explainability bar charts.
- **Do not introduce multiple competing visualization libraries** unless strictly necessary.

### 4.2 Core Views & Components

Organize UI into clear, testable components. A possible breakdown:

**`views/LayoutView.tsx`**
- High-level page layout and multi-view coordination (T1–T6).
- Responsible for arranging:
  - Recommended List
  - Map
  - PCA Scatter
  - Star/Radar Comparison
  - Explainability View

**`views/RecommendedListView.tsx` (T1, T4)**
- Title: **"Recommended Apartments"**
- Three tabs: **All Listings**, **My Ratings** (user-rated apartments), **Bookmarked** (saved favorites)
- Ranking options dropdown:
  - **Model Recommendations** (cosine similarity scores) – requires 5+ ratings
  - **Price** (Low → High / High → Low)
  - **Distance from Center** (Near → Far)
  - **Reviews** (Most → Least)
  - **Bedrooms** (Most → Least)
- Integrated **Explainability Panel** (split-pane after 5 ratings):
  - Click 💡 button on any apartment to see why it was recommended
  - Shows top 12 feature contributions with color-coded bars
  - Displays similarity score and apartment details
- Inline rating controls (1-5 stars) with remove button (❌)
- Bookmark toggle (📌 / 🔖)
- Pagination (20 items per page)
- Detail-on-demand via drawer

**`components/ApartmentDetailDrawer.tsx`**
- Shows full information for one apartment (title, picture placeholder, attributes).
- Embedded rating interaction (to support T4).
- Show top attributes aligned with model explanation.

**`views/MapView.tsx` (T5, T6)**
- Title: **"Explore Zurich Apartments"**
- Plotly scattermapbox showing **all listings as individual markers** (not cluster polygons)
- **Zoom behavior:** 
  - Shows detailed popups with price, room type, distance on all zoom levels
  - No clustering – all apartments visible for direct exploration
- **Visual features:**
  - Color-coded by recommendation rank (top 5 get distinct colors when model trained)
  - Stroke highlighting for selected (blue outline) and brushed (orange outline) apartments
  - Optional **heatmap overlay** for recommendation density (toggleable, requires 5+ ratings)
  - Map style selector (light/dark/streets/satellite)
- **Interaction modes:**
  - Pan mode (default) for navigation
  - Select mode for box/lasso selection
  - Brushing updates selected apartments across all views
- **Expandable fullscreen mode** via overlay toggle
- **Cluster filter dropdown** (5 K-means clusters based on location + features)
- Click marker → opens apartment detail drawer

**`views/PCAScatterView.tsx` (T6)**
- Title: **"Apartment Property Comparison"** (non-expert-friendly, replaces "PCA Scatter")
- Multi-attribute selection dropdown with search/filter
- Modes:
  - **Raw scatter:** 2 attributes selected → direct X/Y plot
  - **Dimensionality reduction:** >2 attributes → PCA to 2 components (explained variance shown)
- Features:
  - **Outlier filtering toggle** (removes extreme values for clearer patterns)
  - **Brushing/lasso selection** updates selected apartments across all views
  - Color-coded by recommendation rank (top 5 get distinct colors)
  - Shows recommendation scores in brushed selection if model trained
  - Hover tooltips with apartment name and attribute values

**`views/StarComparisonView.tsx` (T2)**
- Title: **"Apartment Comparison"**
- Radar chart comparing up to 5 apartments on normalized attributes
- Uses **line traces (not filled polygons)** for clearer comparison across apartments
- Dynamic attribute selection (max 7 attributes):
  - Base attributes: price (log-scaled), distance_from_center (inverted), bedrooms, bathrooms, accommodates, reviews, availability
  - Advanced: minimum_nights (inverted), amenities_count (capped at 30)
  - Preset buttons for quick attribute groups
- Smart scaling per attribute:
  - Price: logarithmic + min-max normalization
  - Distance/nights: inverted (closer/shorter is better)
  - Amenities: capped at 30 then normalized
- Color-coded by recommendation rank for consistency across views
- Click apartment name in legend to open detail drawer

**`views/ExplainabilityView.tsx` (T3)**
- Title: **"Model Reasoning"** or **"Why These Recommendations?"**
- Horizontal bar chart showing **feature contributions** from content-based model:
  - Each feature's contribution = user_vector[j] * apartment_vector[j]
  - Positive contributions (green ✓) push recommendation higher
  - Negative contributions (red ✗) pull recommendation lower
  - Top 12 most influential features displayed (sorted by absolute contribution)
  - Enhanced visual design with bar borders and improved hover tooltips
  - Explanation panel teaching users how to interpret the chart
- **Before/After Model Comparison** (IMPLEMENTED):
  - Toggle to compare initial model (few ratings) vs calibrated model (5+ ratings)
  - Shows how recommendation ranking evolved as more ratings were collected
  - Side-by-side apartment lists comparing snapshots at different rating thresholds
  - Snapshots captured at 1, 3, 5, 10, 15, 20 ratings
  - Visual indicators showing model evolution insights
- Requires 5+ ratings; shows calibration progress ("X/5 ratings") until ready
- Supports viewing contributions for:
  - Selected apartments (up to 3)
  - Top 3 recommendations (default)
- Integrated into RecommendedListView as split-pane after calibration

### 4.3 Linked Multi-View Behavior

- Use a **shared color encoding** for the top 5 recommended apartments across:
  - Recommended list
  - Map
  - Apartment Property Comparison (PCA scatter)
  - Apartment Comparison (radar chart)
  - Explainability view

- **Color palette** (see `frontend/src/utils/colors.ts`):
  - Top 5 recommendations: distinct colors (blue, orange, green, red, purple)
  - Other apartments: neutral gray
  - Selection highlight: blue stroke
  - Brushed highlight: orange stroke
  - Positive contributions: green
  - Negative contributions: red
  - **Design principle:** Minimize conflicting colors – avoid using recommendation colors for UI controls or backgrounds

- Implement **brushing and linking:**
  - Selecting an apartment in one view highlights it in all others
  - Selecting a subset of points (lasso/box selection) filters/highlights the list and other charts
  - Selection state persists across view switches

- Maintain a **central UI state** (Zustand store in `frontend/src/store/useAppStore.ts`) for:
  - Current top-N recommendations
  - Selected apartments (single or multiple)
  - Brushed apartments (from map or scatter lasso)
  - Bookmarked apartments (persisted to localStorage)
  - Current filters (price range, room type, amenities, etc.)
  - Session ID and ratings count
  - View-specific preferences (PCA attributes, map expanded state, etc.)

### 4.4 Interaction & UX Guidelines

**Filters** (e.g., price, distance, room type, **amenities**):
- Use debounced inputs when they trigger backend requests.
- **Amenity search:** Multi-select dropdown with 47 amenity options (WiFi, Kitchen, Parking, Pet-friendly, Washer, Air conditioning, etc.).
- Filters apply across all views simultaneously (list, map, scatter, comparison).
- Clear visual feedback for active filters.

**Brushing:**
- Provide clear visual feedback (hover, selection outlines).
- Box/lasso selection on map and scatter views.
- Brushed apartments highlighted with orange stroke across all views.

**Responsiveness:**
- Layout should work at laptop resolutions used in typical classrooms (1366×768 minimum).
- Map view supports fullscreen expansion for detailed exploration.

**Accessibility:**
- Use semantic HTML where possible.
- Provide text labels and tooltips for interactive controls.
- Star rating controls are keyboard-navigable.

**Error states:**
- Show simple, clear error messages when backend calls fail.
- Allow user to retry.
- Display calibration progress ("Rate X/5 apartments") when model not ready.

**Color consistency:**
- Minimize conflicting colors across UI and charts.
- Top 5 recommendations use distinct palette (blue, orange, green, red, purple).
- UI controls avoid using recommendation colors.
- Selection (blue stroke) and brushing (orange stroke) use dedicated colors.

### 4.5 API Integration

- Centralize API calls, for example in `frontend/src/api/client.ts` and `frontend/src/api/hooks.ts`.
- Use environment variables (`VITE_BACKEND_URL`) to configure backend base URL.
- **Do not hard-code localhost URLs in components.**

## 5. Backend Guidelines

### 5.1 Framework & Structure

- **Preferred framework:** FastAPI.
- If the project already uses Flask, do not rewrite everything; adapt and keep the same endpoints where feasible.
- Suggested structure (see section 3.2) with:
  - `app/main.py` – FastAPI app initialization.
  - `app/api/routes/` – endpoint definitions.
  - `app/data/` – data loading and preprocessing.
  - `app/models/` – ML models (regression, PCA, clustering, sampling).
  - `app/schemas/` – Pydantic models for request/response objects.

### 5.2 Core Responsibilities

The backend should:

#### **Load & serve the dataset**

- At startup, load `data/listings.csv` (or equivalent).
- Apply preprocessing:
  - Fill missing review fields with 0.
  - Drop license column.
  - Remove row with `price == 0`.
  - Compute `distance_from_center`.
  - Normalize numeric attributes.
  - Encode categorical attributes (e.g., one-hot).
- Keep a clean in-memory representation for:
  - Raw attributes (for UI).
  - Processed features (for ML).

#### **Maintain user/session state**

- Track user ratings per session (simple approach is sufficient: e.g., in-memory dict keyed by session ID).
- For a course project, persistence across restarts is not required but can be added.

#### **Train and update the content-based model**

- Use **cosine similarity** between user preference vector and apartment feature vectors.
- **User vector** = normalized centroid of liked item vectors (rating ≥ 4.0):
  - Optionally subtract scaled centroid of disliked items (rating ≤ 1.0)
  - Normalize to unit vector
- Train on the current set of ratings for that session.
- After each new rating, update the user vector (fast – no model retraining needed).
- Provide:
  - **Similarity scores** for all apartments (cosine similarity to user vector).
  - **Feature contributions** (element-wise product: user_vector * apartment_vector).
  - **Per-apartment explanations** showing which features drive recommendations.

#### **Provide dimensionality reduction & clustering**

**Dimensionality Reduction (for "Apartment Property Comparison" view):**
- Compute PCA on normalized features when >2 attributes selected.
- Return 2D coordinates:
  - **Raw scatter:** 2 attributes → direct X/Y values
  - **PCA mode:** >2 attributes → first 2 principal components with explained variance
- Support outlier filtering (remove extreme values before projection).

**K-means clustering:**
- Cluster apartments based on features (5 clusters, random_state=0).
- Computed dynamically on filtered apartment subset.
- Expose cluster labels for:
  - Map view filtering
  - Recommendation filtering (cluster-aware suggestions)
  - Exploratory analysis

#### **Initial sampling (cold start)**

- Implement farthest-first sampling to select a diverse set of apartments for initial calibration (T4).
- Expose an endpoint to fetch these initial candidates.

### 5.3 API Endpoints (Actual Implementation)

All endpoints in `backend/app/api/routes.py`. Example endpoints:

**`GET /apartments`**
- Query parameters: 
  - Pagination: `page`, `limit`
  - Numeric filters: `price_min/max`, `accommodates_min/max`, `bedrooms_min/max`, `bathrooms_min/max`, `beds_min/max`, `distance_from_city_center_max`, etc.
  - Categorical filters: `room_types`, `property_types`, `neighbourhoods`, `neighbourhood_groups`
  - **Amenity search:** `amenities` (list of amenity names like "WiFi", "Kitchen", "Parking")
  - Cluster filter: `cluster_id` (0-4)
  - Sorting: `sort_by` (attribute name), `sort_order` (asc/desc)
  - Specific IDs: `apartment_ids` (list of IDs)
- Returns: `{apartments: [...], total: int, page: int, limit: int}`

**`GET /apartments/{id}`**
- Returns detailed information for one apartment (all 65+ fields).

**`POST /ratings`**
- Request body: `{session_id: str, apartment_id: str, rating: float}`
- Side effect: update stored ratings and rebuild user vector.
- Returns: success confirmation.

**`DELETE /ratings`**
- Query params: `session_id`, `apartment_id`
- Removes a single rating and returns updated `ratings_count`.

**`DELETE /ratings/all`**
- Query params: `session_id`
- Clears all ratings for a session.

**`GET /ratings`**
- Query params: `session_id`
- Returns: `{ratings: {apartment_id: rating, ...}, ratings_count: int}`

**`GET /recommendations`**
- Parameters: `session_id`, `limit` (default 50), optional `cluster_id`
- Returns apartments ranked by cosine similarity scores:
  ```json
  {
    "recommendations": [
      {"apartment": {...}, "score": 0.87},
      ...
    ],
    "total": 2348
  }
  ```

**`GET /recommendations/subset`**
- Parameters: `session_id`, `apartment_ids` (list)
- Returns scores only for specified apartments (used for brushed selections).

**`GET /pca`**
- Query params: `attributes` (comma-separated), `mode` (raw/pca), `filter_outliers` (bool), all apartment filters
- Returns:
  ```json
  {
    "points": [{"apartment_id": str, "x": float, "y": float, "name": str, ...}, ...],
    "mode": "raw" | "pca",
    "attributes": ["attr1", "attr2"],
    "explained_variance": [0.45, 0.32]  // only in PCA mode
  }
  ```

**`GET /explainability`**
- Query params: `session_id`, `apartment_ids` (list, max 3)
- Returns:
  ```json
  {
    "coefficients": {"feature_name": weight, ...},  // user preference vector
    "contributions": [
      {
        "apartment_id": str,
        "features": [
          {"name": str, "value": float, "contribution": float},
          ...
        ]
      },
      ...
    ]
  }
  ```
- Requires ≥5 ratings (returns 400 error if not met).

**`GET /snapshots`**
- Query params: `session_id`
- Returns all model snapshots captured at rating thresholds:
  ```json
  {
    "snapshots": [
      {
        "threshold": 5,
        "ratings_count": 5,
        "timestamp": 1234567890,
        "top_recommendations": [
          {"apartment_id": "123", "score": 0.87},
          ...
        ]
      },
      ...
    ],
    "available_thresholds": [1, 3, 5, 10, 15, 20]
  }
  ```
- Used for before/after model comparison in ExplainabilityView.

**`GET /snapshots/{threshold}`**
- Path param: `threshold` (rating count: 1, 3, 5, 10, 15, or 20)
- Query params: `session_id`
- Returns snapshot at specific rating threshold or 404 if not found.

**`GET /clusters`**
- Returns K-means cluster assignments (5 clusters) for all apartments:
  ```json
  {
    "clusters": [
      {"apartment_id": str, "cluster_id": int, "lat": float, "lon": float},
      ...
    ]
  }
  ```

**`GET /initial-sample`**
- Returns 5-8 diverse apartments using farthest-first sampling (PCA + greedy max-distance).
- Used for cold-start calibration.

**`GET /filter-options`**
- Returns available filter values:
  ```json
  {
    "room_types": [...],
    "property_types": [...],
    "neighbourhoods": [...],
    "neighbourhood_groups": [...],
    "amenities": [...]  // All 47 amenity names
  }
  ```

**`GET /numeric-distributions`**
- Returns min/max/percentiles for numeric attributes (used for filter sliders).

**`GET /image-proxy`**
- Proxy for apartment listing images (handles CORS).

**Keep all request/response schemas as Pydantic BaseModels inline in `routes.py`.**

### 5.4 Real-Time Model Updates

On each `POST /ratings`:
- Store the rating in `SESSION_MODEL.sessions[session_id][apartment_id]`.
- **No training phase** – user preference vector is recomputed from rated items:
  1. Identify liked items (rating ≥ 4.0) and disliked items (rating ≤ 1.0)
  2. Extract feature vectors from `DATASTORE.X` for these apartments
  3. Compute centroids: `liked_centroid` and `disliked_centroid`
  4. Build user vector: `user_vec = liked_centroid - ALPHA * disliked_centroid`
  5. Normalize to unit vector: `user_vec / ||user_vec||`
- **If <5 ratings:** Model still computes scores but frontend shows calibration message.
- **If ≥5 ratings:** Model is "trained" and explainability becomes available.
- **Performance:** O(n_ratings) to rebuild user vector – fast enough for real-time updates.

On each `GET /recommendations`:
- Compute `cosine_similarity(user_vector, DATASTORE.X)` for all apartments
- Return sorted list with scores
- Optional cluster filtering applied before scoring

### 5.5 Testing

- Use **pytest** for backend tests.
- Test categories:
  - **Unit tests** for:
    - Preprocessing (missing values, outlier removal, distance-from-center computation, amenities explosion).
    - Feature encoding and normalization.
    - Content-based model (user vector construction, cosine similarity computation).
    - PCA and clustering utilities.
    - Farthest-first sampling logic.
  - **API tests** using FastAPI's TestClient:
    - Rating submission and model updates.
    - Recommendation retrieval with various filters.
    - Explainability endpoint (test 400 error when <5 ratings).
    - Amenity filtering logic.
- Place tests under `backend/tests/` (currently not fully implemented).
- Run with: `pytest -v` or `pytest --cov=app tests/` for coverage.

## 6. Data & ML Considerations

**Dataset characteristics:**
- Multivariate, mix of numerical, categorical, and textual attributes.
- **Raw:** `listings.csv` (3301 rows × 79 columns) → **Preprocessed:** `listings_clean.json` (2348 rows × 65 fields).
- **Feature matrix:** 2348 × ~200 features after encoding (dense numpy array).

**Preprocessing pipeline** (implemented in `backend/Notebooks/ExploratoryAnalysis.ipynb` and `backend/app/data/loader.py`):

1. **Column selection:** Keep 18 base columns (id, name, location, price, property_type, room_type, beds, bathrooms, etc.).
2. **Drop missing values:** Remove rows with missing price, bathrooms, bedrooms, or beds.
3. **Amenities explosion:**
   - Parse JSON `amenities` field (900+ unique amenities)
   - Create binary features for top 46 amenities (occurrence ≥ 500)
   - Add `amenity_others` flag for remaining amenities
   - Raw `amenities` string kept in DataFrame for frontend parsing
4. **Semantic fixes:**
   - Impute `beds=0` → `ceil(accommodates/2)`
   - Impute `bedrooms=0` → `beds`
   - Remove outlier: `accommodates=2` AND `bedrooms=12`
5. **Feature engineering:**
   - `distance_from_city_center` via Haversine formula (lat/lon to Zurich center: 47.3769, 8.5417)
6. **Encoding:**
   - **Numeric features:** StandardScaler (price, distance_from_city_center, lat, lon, minimum_nights, maximum_nights, accommodates, bathrooms, bedrooms, beds, availability_365)
   - **Categorical features:** OneHotEncoder (property_type, room_type, neighbourhood, neighbourhood_group)
   - **Binary features:** 47 amenity flags (amenity_WiFi, amenity_Kitchen, amenity_Parking, etc.)

**Important notes:**
- **Review scores excluded from model:** Fields like `number_of_reviews`, `review_scores_*` are merged for display but NOT used in recommendations (informational only).
- **Amenity handling:** Raw `amenities` stays as string in `DATASTORE.df` for frontend; model uses exploded binary features in `DATASTORE.X`.
- **Do not modify preprocessing** without updating BOTH `loader.py` AND `ExploratoryAnalysis.ipynb`.

**ML methods** (implemented in `backend/app/models/session_model.py`):

**Enhanced content-based filtering** for recommendations:
- **Feature weighting:** Emphasizes important attributes
  - Location features (distance, lat, lon): 2.0x weight
  - Amenity features (WiFi, Kitchen, etc.): 1.5x weight
  - Key attributes (beds, bathrooms, accommodates, room_type): 1.3x weight
  - Other features: 1.0x baseline
- **User vector:** Weighted centroid of liked items with enhancements
  - Recency boost: Newer ratings weighted up to 1.2x higher
  - Rating strength: 5-star ratings weighted more than 4-star
  - Dislike dampening: Disliked items (rating ≤ 1.0) subtracted with 0.5x factor
- **Similarity scoring:** Feature-weighted cosine similarity
- **Diversity penalty:** Reduces scores for apartments very similar to already-rated ones (0.7-1.0x multiplier)
- **Ranking:** Sort apartments by enhanced similarity score (descending)
- **Benefits:** Interpretable, fast updates, emphasizes important features, encourages variety
- **Drawbacks:** Requires feature engineering, more parameters to tune

**Dimensionality reduction (PCA)** for "Apartment Property Comparison" view:
- **Purpose:** Visualize relationships between apartments when comparing many attributes at once
- **How it works (non-expert explanation):**
  - When you select 2 attributes (e.g., price and distance), we plot them directly on X and Y axes
  - When you select >2 attributes (e.g., price, distance, bedrooms, bathrooms), we use a mathematical technique to "project" this multi-dimensional space onto a 2D chart
  - Think of it like taking a photograph of a 3D sculpture: you lose some depth, but capture the main shape
  - The "explained variance" percentage tells you how much information is retained in the 2D view
- **User-facing name:** "Apartment Property Comparison" (avoids technical jargon)
- Shows explained variance to indicate information retention
- Helps non-experts understand apartment clusters without technical jargon
- **Implementation details:**
  - Uses scikit-learn PCA with 2 components
  - StandardScaler applied before PCA
  - Optional outlier filtering (removes extreme values before projection)
  - Color-coded by recommendation rank when model is trained

**K-means clustering** (5 clusters) to group apartments:
- Used for map filtering and exploratory analysis
- Computed dynamically on filtered subsets
- Cluster assignments exposed via API

**Farthest-first sampling** for cold-start calibration:
- Uses PCA + greedy max-distance selection
- Returns 5-8 diverse apartments for initial rating
- Ensures wide coverage of feature space

**Explainability** (content-based decomposition):
- **User coefficients:** Components of feature-weighted user preference vector (not regression coefficients)
- **Feature contributions:** Element-wise product `user_vector[j] * apartment_vector[j]`
- **Feature weighting applied:** Location (2.0x), amenities (1.5x), key attributes (1.3x)
- **Interpretation:** Shows which features align with user preferences (weighted by importance)
- **Amenity contributions:** Directly interpretable (binary × weighted preference)
- **Frontend receives:** `{coefficients: {...}, contributions: [{apartment_id, features: [{name, value, contribution}]}]}`

**Key difference from regression:**
- No training phase – user vector is computed directly from liked items
- No hyperparameters to tune (except like_threshold = 4.0)
- Real-time updates after each rating
- Contributions are feature alignments, not causal effects

**Always prioritize transparency and interpretability over marginal accuracy gains.**

## 7. Coding Conventions

### 7.1 General

- Prefer clear, simple code over clever tricks.
- Keep functions and components small and focused.
- Write docstrings for Python functions and classes that perform key logic, especially in ML and preprocessing.
- Add inline comments where logic is non-obvious.

### 7.2 Frontend

**Prefer TypeScript:**
- Use PascalCase for React components.
- Use camelCase for functions and variables.
- Use kebab-case for filenames except React components (`RecommendedListView.tsx`, `map-view.css`, etc.).

**Use consistent formatting:**
- Prefer Prettier and ESLint (or follow existing configuration).

**Component organization:**
- Reusable low-level components → `components/`.
- Page-level or multi-view containers → `views/`.
- Hooks → `hooks/`.
- API layer → `api/`.

### 7.3 Backend

- Use **Black** (auto-format) and **Ruff** or **flake8** (lint) if available; otherwise follow PEP 8.

**Naming:**
- Modules and packages: `lower_snake_case`.
- Classes: `PascalCase`.
- Functions and variables: `lower_snake_case`.

- Use **Pydantic models** for input/output validation and documentation.
- Keep business logic out of route handlers where possible:
  - Route handlers call services/models that encapsulate ML and preprocessing logic.

## 8. Dev Workflow in VS Code

### 8.1 Frontend

From `/frontend`:

**Install dependencies:**
```bash
npm install
```

**Run development server:**
```bash
npm run dev
```

**Build for production:**
```bash
npm run build
```

**Run tests** (if configured, e.g. with Vitest or Jest):
```bash
npm test
```

### 8.2 Backend

From `/backend`:

**Activate the Conda environment `IVDA_GROUP`** (used by the project notebooks and kernels).

**Install dependencies:**
```bash
conda activate IVDA_GROUP
pip install -r requirements.txt
```

**Run FastAPI backend with Uvicorn:**
```bash
uvicorn app.main:app --reload
```

**Run tests:**
```bash
pytest
```

### 8.3 AI Assistant Behavior in VS Code

When operating as an AI assistant:

- **Always inspect existing files before generating new ones:**
  - Check `AGENT.md`, `README.md`, and any architecture-relevant files.

- **Prefer incremental changes:**
  - Modify existing components and modules instead of large rewrites.
  - When a refactor is necessary, explain it clearly in the context of the project.

- **Keep frontend/backend contracts aligned:**
  - If you change an endpoint or schema, update:
    - Backend routers and Pydantic models.
    - Frontend API clients and TypeScript types.
    - Any documentation that references these APIs.

- **Respect the existing tooling:**
  - Use the lint/format tools configured in the project.

- **When adding new files:**
  - Place them in the appropriate directory according to the structure described above.

## 9. Non-Goals & Constraints

**Do not change the core stack:**
- Frontend: React + Vite + TypeScript (required)
- Backend: Python FastAPI (required)
- Visualization: Plotly.js only (no D3.js, Chart.js, etc.)

**Avoid unnecessary dependencies:**
- Use Plotly.js for all visualizations instead of adding multiple competing chart libraries.
- Lightweight state management: Zustand (global) + React Query (server state).
- No heavy state management frameworks (Redux, MobX) unless clearly needed.

**No over-engineering:**
- This is a course project—aim for clarity, correctness, and maintainability rather than enterprise complexity.
- In-memory session storage is sufficient (no database required).
- No authentication/authorization system needed.

**Stay aligned with IVDA tasks:**
- Do not add visualizations or ML components that are unrelated to T1–T6.
- Every feature should clearly support identification, comparison, exploration, explanation, calibration, or relation of apartments.

**Do not introduce persistence complexity** (e.g., full DB migrations) unless explicitly required.

**Do not break existing APIs** without updating all callers and relevant docs in the same commit.

**Color consistency is critical:**
- Avoid conflicting colors across UI and charts.
- Top 5 recommendations use a fixed palette (blue, orange, green, red, purple).
- Selection and brushing use dedicated colors (blue/orange strokes).
- UI controls and backgrounds should not reuse recommendation colors.

## 10. Planned Features & Enhancements

These features are planned or partially implemented. When working on them, align with IVDA tasks:

**✅ COMPLETED:**
- Content-based recommendation system with cosine similarity
- Amenity search and filtering (47 amenity options)
- Integrated explainability panel in RecommendedListView
- Tabbed view (All / My Ratings / Bookmarked)
- Multi-ranking options (model-based + 5 attribute-based rankings)
- Cluster filtering on map and recommendations
- Rating management (add/remove ratings)
- Fullscreen map expansion
- Domain-friendly titles ("Apartment Property Comparison" instead of "PCA")
- Line traces in radar chart (consistent with design principles)
- **All individual apartment markers visible at all zoom levels** (no cluster polygons)
- **PCA view with non-expert explanations** (explained variance with intuitive analogy)
- **Before/After Model Comparison** (T3):
  - Snapshot storage at rating thresholds (1, 3, 5, 10, 15, 20)
  - Toggle in ExplainabilityView to compare initial vs calibrated model
  - Side-by-side comparison showing how recommendations evolved
  - Backend endpoints: `GET /snapshots` and `GET /snapshots/{threshold}`
- **Enhanced Explainability Visualization:**
  - Top 12 most influential features sorted by absolute contribution
  - Visual distinction with checkmarks (✓) and crosses (✗)
  - Helpful explanation panel teaching users how to interpret the chart
  - Improved bar chart styling with borders and better hover information

**📋 PLANNED:**
  
- **Amenity-Based Recommendations:**
  - "Find similar apartments" feature based on amenity overlap
  - Amenity importance weighting in user preference vector
  
- **Improved Cold-Start Experience:**
  - Explain WHY farthest-first sample was chosen (diversity visualization)
  - Show calibration progress with visual feedback (e.g., confidence gauge)
  - Progressive disclosure: unlock features as more ratings are collected

**❌ NOT PLANNED:**
- Collaborative filtering (out of scope for course project)
- User accounts and persistent storage (in-memory is sufficient)
- Real estate API integration (static dataset only)
- Mobile-responsive design (desktop/laptop focus)

## 11. How the Agent Should Interact

When collaborating with humans or other tools in this repo:

- **Always inspect existing files before making changes:**
  - Check `AGENT.md` (this file), `.github/copilot-instructions.md` (quick reference), and `README.md`.
  - Review actual implementation files before proposing changes.

- **Ask clarifying questions when requirements are ambiguous:**
  - Example: "Should the explainability view show all features or only top-N?"
  - Example: "For before/after comparison, should we store snapshots or recompute from rating history?"

- **Prefer incremental changes:**
  - Modify existing components and modules instead of large rewrites.
  - When a refactor is necessary, explain it clearly in the context of the project.

- **Keep frontend/backend contracts aligned:**
  - If you change an endpoint or schema, update:
    - Backend Pydantic models in `routes.py`
    - Frontend TypeScript interfaces in `api/types.ts`
    - API documentation and comments
  - **Update both in the same commit** to prevent type mismatches.

- **Keep code and documentation in sync:**
  - If you change behavior, update:
    - Inline comments and docstrings
    - `AGENT.md` (this file) for architectural changes
    - `.github/copilot-instructions.md` for quick reference updates
    - `README.md` for user-facing changes

- **Align changes with YourZuriFlat goals:**
  - Always consider how a change supports:
    - Better identification, comparison, exploration, or explanation of apartments (T1–T6)
    - A smoother human-in-the-loop workflow for rating and recommendations
    - Clearer communication for non-expert users

- **Be explicit about assumptions:**
  - If you need to make a design decision (e.g., amenity weighting, rating threshold, color palette), document it briefly in code or in a relevant markdown file.
  - Explain the rationale for ML/UX choices (e.g., "using cosine similarity because it's interpretable and fast").

- **Respect the tech stack and design principles:**
  - Content-based model (not collaborative filtering or regression)
  - Plotly.js for all visualizations
  - Domain-friendly terminology (e.g., "Apartment Property Comparison" not "PCA")
  - Line traces in radar charts (not filled polygons)
  - Consistent color encoding across views
  - All listings visible on map (no clustering polygons)

- **When implementing new features:**
  1. Check if it aligns with T1–T6 IVDA tasks
  2. Review existing implementation patterns in codebase
  3. Update both frontend and backend if API changes are needed
  4. Test with model in different states (<5 ratings, 5+ ratings, 10+ ratings)
  5. Update documentation (comments, AGENT.md, copilot-instructions.md)

**If you are unsure whether a change is appropriate, default to minimal and reversible modifications that preserve the existing architecture and the intent described in this AGENT.md.**
