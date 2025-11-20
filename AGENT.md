# AGENT.md

Guidelines for AI coding assistants working on YourZuriFlat in VS Code.

## 1. Agent Role & Goals

You are a senior full-stack engineer and IVDA-savvy assistant working in this repository.

### Your primary goals:

- **Implement and maintain YourZuriFlat**, an interactive visual data analysis tool for short-term apartment rentals in Zurich.
- **Provide a multi-view interactive visualization UI** that helps non-expert users find suitable apartments.
- **Implement a Python backend** that:
  - Loads and preprocesses the Zurich apartment dataset.
  - Trains a regularized linear regression model based on user ratings.
  - Exposes RESTful JSON APIs for recommendations, PCA, clustering, and explainability.
- **Respect and preserve the chosen tech stack:**
  - **Frontend:** React + Vite (Node.js/npm), with Plotly.js for visualizations.
  - **Backend:** Python (prefer FastAPI).
- **Maintain code quality, consistency, and clarity** while keeping the implementation appropriate for a university course project (no unnecessary over-engineering).

When in doubt, align your work with the IVDA tasks (T1–T6) and the human-in-the-loop recommendation goal.

## 2. Project Overview

### 2.1 Domain & Dataset

**Domain:** Short-term apartment rentals in Zurich (Airbnb-like listings).

**Users:** Non-expert short-term renters who want to find a place matching their preferences.

**Dataset:**
- **Source:** `zurich apartment renting.csv` (tabular).
- **Size:** Initially 2246 rows, each representing one listing.
- **Attributes:** 18 attributes (after preprocessing) including:
  - **Location:** latitude, longitude, neighbourhood, etc.
  - **Listing type:** room_type, etc.
  - **Price & availability:** price, minimum_nights, availability_365, etc.
  - **Reviews:** number_of_reviews, last_review, etc.
  - **Host details:** calculated_host_listings_count, etc.
  - **Engineered:** distance_from_center (distance to Zurich city center).

**Preprocessing** (see section 6 for details):
- Missing review values → 0.
- Empty license column dropped.
- One semantic outlier (price == 0) removed.
- **Final dataset:** 2245 listings, 18 attributes, with encoded categoricals and normalized numeric ranges.

The dataset is small enough to stay in memory in the backend.

### 2.2 Human-in-the-Loop & Cold-Start Problem

The central challenge is the **cold-start problem**: at initialization, the system has no user-specific labels.

**Core idea:**
- Users rate a small set of apartments (e.g., via a star rating or numeric score).
- A regularized linear regression model learns the user's preferences.
- The model then ranks all apartments according to predicted preference scores.
- As users continue rating, the model updates, improving personalization.
- **Farthest-first sampling** is used to select a diverse initial set of apartments for calibration.

### 2.3 IVDA Tasks (T1–T6)

YourZuriFlat is designed around the following core analysis tasks:

**T1 – Identify suitable apartments**  
Discover listings aligned with learned user preferences through regression-based ranking.

**T2 – Compare apartments by attributes**  
Analyze trade-offs across dimensions like price, proximity to center, room type, etc.

**T3 – Summarize model reasoning**  
Visualize feature contributions to predicted ratings (explainable AI).

**T4 – Calibrate regression**  
Collect sufficient initial user ratings to overcome cold start.

**T5 – Explore apartments**  
Enable browsing and filtering independent of the model's recommendations.

**T6 – Relate apartment attributes**  
Visualize correlations and structure in feature space (e.g., via PCA scatterplots, clustering).

**Every UI or backend change should clearly support one or more of T1–T6.** Avoid adding unrelated visualizations.

## 3. Architecture

### 3.1 High-Level Overview

**Frontend**
- React app bootstrapped with Vite.
- Written in TypeScript where possible (if the repo is already JS, follow existing convention).
- Uses Plotly.js (via react-plotly.js) for all charts and visualizations.
- Uses Node.js (npm) for dependency management and scripts.

**Backend**
- Python backend, preferably using FastAPI.
- Exposes RESTful JSON APIs for data access, model updates, and analytics.
- Holds the entire dataset in memory and maintains the current model state.

**Communication**
- Frontend ↔ Backend via HTTP + JSON.
- APIs should be documented in a single source of truth, e.g.:
  - `backend/app/api/schema.py` (Pydantic models), or
  - `backend/openapi.yaml`.

### 3.2 Suggested Directory Structure

Use or adapt to an existing structure. If none exists, prefer something like:

```
/ (repo root)
  AGENT.md
  README.md
  /frontend
    index.html
    vite.config.ts
    package.json
    src/
      main.tsx
      App.tsx
      components/
      views/
      hooks/
      api/
      styles/
  /backend
    requirements.txt
    app/
      main.py
      api/
        __init__.py
        routes/
          apartments.py
          ratings.py
          recommendations.py
          analytics.py  # PCA, explainability, clusters
      core/
        config.py
        logging.py
      models/
        regression.py
        pca.py
        clustering.py
        sampling.py
      data/
        __init__.py
        loader.py
        preprocessing.py
        zurich_apartments.csv
      schemas/
        __init__.py
        apartments.py
        ratings.py
        recommendations.py
        analytics.py
      tests/
        test_api_*.py
        test_models_*.py
```

- **Frontend code** stays under `/frontend`.
- **Backend code** stays under `/backend`.
- **Shared API types** are reflected in:
  - **Backend:** Pydantic models in `backend/app/schemas/`.
  - **Frontend:** TypeScript interfaces in `frontend/src/api/types.ts`.
  - **Keep these in sync.**

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
- Displays a table / list of apartments sorted by model preference score.
- Shows basic info: price, distance_from_center, room_type, neighbourhood, rating, etc.
- Includes:
  - Inline rating controls (e.g., stars or sliders).
  - A "detail-on-demand" link or expand panel.

**`components/ApartmentDetailDrawer.tsx`**
- Shows full information for one apartment (title, picture placeholder, attributes).
- Embedded rating interaction (to support T4).
- Show top attributes aligned with model explanation.

**`views/MapView.tsx` (T5, T6)**
- Plotly map view of Zurich with apartments as points.
- **Behaviour:**
  - Clustering at low zoom (group markers showing counts).
  - Individual markers at higher zoom levels.
- **Brushing / selection:**
  - Selecting points highlights them across other views (list, PCA, star, explainability).

**`views/PCAScatterView.tsx` (T6)**
- Scatterplot using either:
  - User-selected two attributes, or
  - First two principal components from PCA.
- **Options:**
  - Toggle between "raw attributes" and "PCA".
  - Basic outlier handling toggle (e.g., filter out extreme values).
- **Brushing:**
  - Selecting points updates selected apartments in other views.

**`views/StarComparisonView.tsx` (T2)**
- Star/radar chart comparing up to 5 apartments on normalized attributes (price, distance, reviews, etc.).
- Input comes from:
  - User manually selecting apartments (e.g., via checkboxes in the recommended list), or
  - Current top-N recommendations.

**`views/ExplainabilityView.tsx` (T3)**
- Bar chart expressing contributions as visually similar to:
  - ŷ = β₀ + Σⱼ βⱼ xⱼ*
- **Show:**
  - Each attribute's contribution (β_j * x_j*) per apartment.
  - Positive vs negative contributions clearly separated (e.g., left vs right).
- **Supports:**
  - Viewing contributions for the current top-N or selected apartments.

### 4.3 Linked Multi-View Behavior

- Use a **shared color encoding** for the top 5 recommended apartments across:
  - Recommended list
  - Map
  - PCA scatter
  - Star/radar view
  - Explainability view

- Implement **brushing and linking:**
  - Selecting an apartment in one view highlights it in all others.
  - Selecting a subset of points (lasso/box selection) filters/highlights the list and other charts.

- Maintain a **central UI state** for:
  - Current top-N recommendations.
  - Selected apartments (single or multiple).
  - Current filters (price range, room type, etc.).
  - Current brush selection.

- Prefer to hold this UI state in a small global store (e.g., Zustand) or a top-level context, and server state in React Query.

### 4.4 Interaction & UX Guidelines

**Filters** (e.g., price, distance, room type):
- Use debounced inputs when they trigger backend requests.

**Brushing:**
- Provide clear visual feedback (hover, selection outlines).

**Responsiveness:**
- Layout should work at laptop resolutions used in typical classrooms.

**Accessibility:**
- Use semantic HTML where possible.
- Provide text labels and tooltips for interactive controls.

**Error states:**
- Show simple, clear error messages when backend calls fail.
- Allow user to retry.

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

- At startup, load `zurich_apartments.csv` (or equivalent).
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

#### **Train and update the regression model**

- Use regularized linear regression (e.g., Ridge).
- Train on the current set of ratings for that session.
- After each new rating batch, update or retrain the model.
- Provide:
  - Predicted scores for all apartments.
  - Regression coefficients (β_j) and intercept (β₀) for explainability.
  - Per-apartment contributions (β_j * x_j*) when requested.

#### **Provide PCA & clustering**

**PCA:**
- Compute PCA on normalized features when needed (or precompute).
- Return coordinates for:
  - Selected attributes (2D scatter).
  - First two principal components when >2 attributes are chosen.

**K-means clustering:**
- Cluster apartments based on a subset of features (e.g., location and price).
- Expose cluster labels and centroids for visualization.

#### **Initial sampling (cold start)**

- Implement farthest-first sampling to select a diverse set of apartments for initial calibration (T4).
- Expose an endpoint to fetch these initial candidates.

### 5.3 API Endpoints (Indicative)

Use descriptive names and versioning if possible (`/api/v1/...`). Example:

**`GET /apartments`**
- Query parameters: pagination, filters (price range, room_type, neighbourhood, etc.), sort options.
- Returns a list of apartments with necessary attributes for the list view.

**`GET /apartments/{id}`**
- Returns detailed information for one apartment.

**`POST /ratings`**
- Request body: session identifier, apartment ID, rating value.
- Side effect: update stored ratings and trigger model update.

**`GET /recommendations`**
- Parameters: session identifier, limit (e.g., top_n).
- Returns apartments sorted by predicted preference score, plus their scores.

**`GET /pca`**
- Query params: selected attributes, whether to use PCA or raw attributes, outlier handling options.
- Returns coordinates and metadata for plotting.

**`GET /explainability`**
- Query params: session identifier, apartment IDs.
- Returns:
  - Regression coefficients and intercept.
  - Per-apartment feature contributions.

**`GET /clusters`**
- Returns cluster assignments and optional centroid info (for map view or feature-based clusters).

**`GET /initial-sample`**
- Returns a farthest-first sample of apartments for initial rating.

**Keep all request/response schemas in `app/schemas/` and reference them in route handlers.**

### 5.4 Incremental Model Updates

On each `POST /ratings`:
- Store the rating.
- If the number of ratings is below a certain threshold, still perform a simple fit or fallback to a baseline (e.g., price-based or uniform ranking).
- Once enough ratings exist:
  - Fit or refit the regression model.
  - For a small dataset, re-fitting the model per update is acceptable and simplifies code.

### 5.5 Testing

- Use **pytest** for backend tests.
- Test categories:
  - **Unit tests** for:
    - Preprocessing (missing values, outlier removal, distance-from-center computation).
    - Feature encoding and normalization.
    - Regression, PCA, and clustering utilities.
  - **API tests** using FastAPI's TestClient or similar.
- Place tests under `backend/app/tests/`.

## 6. Data & ML Considerations

**Dataset characteristics:**
- Multivariate, mix of numerical, categorical, date, and textual attributes.
- Final prepared dataset: 2245 rows, 18 attributes.

**Preprocessing rules** (do not change without good reason):
- Review-related missing values → 0.
- Drop empty license column.
- Remove `price == 0` outlier.
- Compute `distance_from_center` (e.g., from lat/lon to Zurich city center coordinates).
- Encode categorical variables (e.g., room_type, neighbourhood) using one-hot or target encoding.
- Normalize numeric variables (e.g., min-max or standardization) to support regression and PCA.

**ML methods** (fixed design choices for this project):

**Linear regression with regularization** for predicting user preference scores:
- Provides interpretable coefficients for explainability (T1, T3, T4).

**PCA** for dimensionality reduction in the scatterplot view (T6):
- 2D projections for >2 attributes.

**K-means clustering** to group apartments:
- Useful for map clustering and structural exploration (T5, T6).

**Farthest-first sampling:**
- To choose diverse initial apartments for calibration (T4).

**Explainability:**
- The backend should surface:
  - β_j coefficients.
  - Normalized inputs x_j*.
  - Contribution values β_j x_j* per feature and apartment.
- The frontend should map these into the explainability bar chart.

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

**Create and activate a virtual environment** (if not already done).

**Install dependencies:**
```bash
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
- No switching away from React + Vite on the frontend.
- No switching away from a Python backend (FastAPI/Flask).

**Avoid unnecessary dependencies:**
- Use Plotly.js for visualizations instead of adding multiple competing chart libraries.
- Avoid heavy state management frameworks unless clearly needed.

**No over-engineering:**
- This is a course project—aim for clarity, correctness, and maintainability rather than enterprise complexity.

**Stay aligned with IVDA tasks:**
- Do not add visualizations or ML components that are unrelated to T1–T6.

**Do not introduce persistence complexity** (e.g., full DB migrations) unless explicitly required.

**Do not break existing APIs** without updating all callers and relevant docs.

## 10. How the Agent Should Interact

When collaborating with humans or other tools in this repo:

- **Ask clarifying questions when requirements are ambiguous:**
  - Example: "Should the PCA view default to raw attributes or PCA components for 3+ attributes?"

- **Propose small, meaningful refactorings:**
  - E.g., extracting a shared hook, consolidating duplicated logic, or renaming confusing variables.

- **Keep code and documentation in sync:**
  - If you change behavior, update comments, README, and any user-facing hints.

- **Align changes with YourZuriFlat goals:**
  - Always consider how a change supports:
    - Better identification, comparison, exploration, or explanation of apartments.
    - A smoother human-in-the-loop workflow for rating and recommendations.

- **Be explicit about assumptions:**
  - If you need to make a design decision (e.g., rating scale, default feature set for PCA), document it briefly in code or in a relevant markdown file.

**If you are unsure whether a change is appropriate, default to minimal and reversible modifications that preserve the existing architecture and the intent described in this AGENT.md.**
