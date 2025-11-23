<!-- .github/copilot-instructions.md -->
# Copilot instructions for contributors and AI coding agents

These concise instructions help an AI coding assistant become productive quickly in this repository.

**Start here:**
- Read `AGENT.md` (root) — authoritative project goals (T1–T6), architecture, and ML decisions.
- Read `docs/frontend/FRONTEND_README.md` — frontend structure, state strategy, and hooks.
- Inspect `myzuriflat_frontend/src/api/*` and `myzuriflat_frontend/src/store/useAppStore.ts` for API clients and UI state patterns.

**Big picture (one-liner):**
- React + Vite frontend (`myzuriflat_frontend`) talks to a Python backend (FastAPI preferred) over HTTP/JSON; the app focuses on a human-in-the-loop regression recommender (cold-start sampling, PCA, explainability) for Zurich apartment listings.

**How to run common tasks (explicit):**
- Frontend dev: `cd myzuriflat_frontend` then `npm install` and `npm run dev` (Vite server).
- Frontend build: `npm run build` and optionally `npm run preview`.
- Backend dev (per `AGENT.md`): activate the Conda environment `IVDA_GROUP` (or create it if needed), install Python requirements and run the app from `backend`:

```pwsh
conda activate IVDA_GROUP
pip install -r backend/requirements.txt
uvicorn app.main:app --reload
```

If you prefer using a virtualenv instead, follow the instructions in `backend/README.md`.

**Key files and hotspots to inspect before editing**
- `AGENT.md` — project goals, T1–T6 focus, architecture rules.
- `docs/frontend/FRONTEND_README.md` — design decisions, views, hooks, and API hooks list.
- `myzuriflat_frontend/package.json` — scripts and core deps (Vite, React, Plotly, React Query, Zustand).
- `myzuriflat_frontend/src/api/client.ts` and `src/api/hooks.ts` — centralized API client and React Query hooks; keep these synced with backend Pydantic schemas.
- `myzuriflat_frontend/src/api/types.ts` — TypeScript types mirroring backend schemas; update when changing API shapes.
- `myzuriflat_frontend/src/store/useAppStore.ts` — global UI state (Zustand) and shared selections/colors.
- `myzuriflat_frontend/src/views/*` and `src/components/*` — primary UI behavior (brushing/linking, detail drawer, rating controls).
- `backend/Notebooks/` and `data/` — dataset, preprocessing notes, and exploratory analyses to follow ML assumptions.

**Patterns & conventions specific to this repo**
- Single viz library: use Plotly.js (via `react-plotly.js`) for maps, PCA, radar, and explainability charts — do not introduce alternate charting stacks.
- Server state = React Query hooks in `src/api/hooks.ts`; UI/global state = Zustand store in `src/store/useAppStore.ts`.
- Keep API interaction centralized in `src/api/*`; components should call hooks, not raw Axios.
- Component naming: React components use `PascalCase` and `.tsx` filenames; CSS files follow kebab-case and sit next to components where used.
- Rating flow: star controls call `POST /ratings` (use the provided mutation hook) and expect the backend to retrain or update recommendations; keep interactions optimistic and idempotent where appropriate.

**API surface examples (inspect backend before changing)**
- `GET /apartments` — list with filters (price, room_type, neighbourhood).
- `GET /apartments/{id}` — apartment details for the drawer.
- `POST /ratings` — body: `{ session_id, apartment_id, rating }`.
- `GET /recommendations?session_id=&limit=` — ranked apartments by predicted score.
- `GET /pca`, `GET /explainability`, `GET /clusters`, `GET /initial-sample` — analytics endpoints used by PCA/Explainability/Map.

**When making changes**
- Inspect and update both sides of the contract: backend Pydantic models and `src/api/types.ts` TypeScript types.
- If you rename or change an endpoint, update `src/api/client.ts`, all hooks in `src/api/hooks.ts`, and any direct usage in views.
- Preserve the IVDA task alignment: every UI/ML change should clearly support one or more T1–T6 tasks in `AGENT.md`.

**Concrete examples of useful prompts**
- "Open `myzuriflat_frontend/src/views/RecommendedListView.tsx`. Implement debounced price filtering that calls `useApartments(filters)` and preserves the top-5 color encoding from `useAppStore`." 
- "Add a new field to the recommendation response: `explain_contributions`. Update backend schema `app/schemas/recommendations.py` and `myzuriflat_frontend/src/api/types.ts`, then update `useRecommendations` hook." 
- "Improve ExplainabilityView by showing normalized contributions: compute β_j * x_j* in backend and return per-apartment arrays consumed by `src/views/ExplainabilityView.tsx`."

**What not to do**
- Don’t replace Plotly with a different visualization library.
- Don’t rearchitect the stack (no switching from React/Vite or replacing the Python backend) without explicit approval.
- Avoid adding heavyweight state frameworks — prefer small, local refactors and use the existing Zustand + React Query strategy.

If anything is unclear or you need access to the backend code structure and tests, tell me which area you want expanded (backend routes, Pydantic schemas, or CI/test setup) and I will update this guidance accordingly.

---
*Would you like me to: (A) open and merge any existing `copilot-instructions` content if present, (B) expand backend endpoint references with exact Pydantic model names from `backend` (if available), or (C) run the frontend dev server and verify the default Vite URL?*
