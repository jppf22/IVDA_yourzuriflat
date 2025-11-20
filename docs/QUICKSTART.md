# YourZuriFlat - Quick Start Guide

## What You Have Now

✅ **Complete Frontend Implementation**
- All UI components built
- All views implemented (T1-T6)
- Multi-view coordination working
- State management configured
- API client ready

## File Structure Overview

\`\`\`
IVDA/
├── AGENT.md                        # Project guidelines
├── FRONTEND_IMPLEMENTATION.md      # Detailed implementation doc
├── myzuriflat_frontend/           # ← FRONTEND (COMPLETE)
│   ├── src/
│   │   ├── api/                   # API client + React Query hooks
│   │   ├── components/            # Reusable UI components
│   │   ├── views/                 # Main application views
│   │   ├── store/                 # Zustand state management
│   │   ├── utils/                 # Helper functions
│   │   └── App.tsx                # Root component
│   ├── package.json               # Dependencies installed
│   ├── .env                       # Backend URL config
│   └── FRONTEND_README.md         # Frontend documentation
│
└── backend/                        # ← NEEDS IMPLEMENTATION
    └── (to be created)
\`\`\`

## Running the Frontend

### 1. Open Terminal in Frontend Directory

\`\`\`bash
cd myzuriflat_frontend
\`\`\`

### 2. Start Development Server

\`\`\`bash
npm run dev
\`\`\`

### 3. Open Browser

Navigate to: `http://localhost:5173`

**Note:** You'll see loading/error states because the backend isn't running yet.

## What the Frontend Expects from Backend

The frontend is configured to call these API endpoints at `http://localhost:8000`:

### Core Endpoints

1. **GET /apartments**
   - Query params: `price_min`, `price_max`, `room_types[]`, `neighbourhoods[]`, `distance_max`, `min_reviews`, `availability_min`, `page`, `limit`, `sort_by`, `sort_order`
   - Returns: `{ apartments: [...], total: number, page: number, limit: number }`

2. **GET /apartments/:id**
   - Returns: Single apartment object

3. **POST /ratings**
   - Body: `{ session_id: string, apartment_id: string, rating: number }`
   - Returns: `{ success: boolean, message: string, ratings_count: number }`

4. **GET /recommendations**
   - Query params: `session_id`, `limit`
   - Returns: `{ recommendations: [{ apartment, predicted_score }], session_id, model_trained }`

5. **GET /pca**
   - Query params: `attributes` (comma-separated), `mode` ('raw'|'pca'), `filter_outliers` (boolean)
   - Returns: `{ points: [{ apartment_id, x, y, apartment }], x_label, y_label, explained_variance?, mode }`

6. **GET /explainability**
   - Query params: `session_id`, `apartment_ids` (comma-separated)
   - Returns: `{ explanations: [{ apartment_id, apartment, predicted_score, intercept, contributions: [{ feature_name, contribution, coefficient, normalized_value }] }] }`

7. **GET /clusters**
   - Returns: `{ clusters: [{ apartment_id, cluster_id, apartment }], centroids: [{ cluster_id, latitude, longitude, size }] }`

8. **GET /initial-sample**
   - Returns: `{ apartments: [...], sample_size: number }`

### TypeScript Interfaces

All request/response types are defined in:
`myzuriflat_frontend/src/api/types.ts`

**Use these as reference when creating backend Pydantic models!**

## Next Steps

### Option 1: Test Frontend Standalone

You can explore the UI structure without backend:

1. Run `npm run dev`
2. Components will show loading states or empty states
3. You can see the layout and styling
4. Most interactions won't work yet

### Option 2: Create Mock Backend

For quick testing, create a minimal FastAPI backend:

\`\`\`python
# backend/main.py (minimal example)
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/apartments")
def get_apartments():
    return {
        "apartments": [],
        "total": 0,
        "page": 1,
        "limit": 20
    }

# Add other endpoints...
\`\`\`

### Option 3: Full Backend Implementation

Follow AGENT.md guidelines to implement the complete backend:

1. **Setup**
   - Create `backend/` directory
   - Setup Python virtual environment
   - Install FastAPI, uvicorn, pandas, scikit-learn, etc.

2. **Data Loading**
   - Load `zurich_apartments.csv`
   - Preprocess (fill NAs, drop outliers, compute distance_from_center)
   - Normalize features

3. **Model Implementation**
   - Ridge regression for user preferences
   - PCA for dimensionality reduction
   - K-means for clustering
   - Farthest-first sampling

4. **API Routes**
   - Implement all 8 endpoints listed above
   - Use Pydantic models (match `src/api/types.ts`)
   - Add CORS middleware

## Verifying Everything Works

Once backend is running:

### 1. Check API Connection
- Open browser console at `http://localhost:5173`
- Should see successful API calls (200 status)
- No CORS errors

### 2. Test Core Flows

**Initial Load:**
- ✓ Apartments list appears
- ✓ Map shows apartment markers
- ✓ PCA scatter shows initial plot

**Rating Flow:**
- ✓ Click stars in recommended list
- ✓ Rating count increases in header
- ✓ Recommendations list updates
- ✓ Explainability view shows contributions

**Selection Flow:**
- ✓ Check boxes in list
- ✓ Selected apartments highlighted in map
- ✓ Selected apartments highlighted in PCA
- ✓ Radar chart shows selected apartments

**Brushing Flow:**
- ✓ Lasso select in map
- ✓ Brushed apartments highlighted in list
- ✓ Brushed apartments highlighted in PCA

**Filtering:**
- ✓ Change price range
- ✓ Select room types
- ✓ List updates after debounce (500ms)
- ✓ Map markers update

### 3. Check Console for Errors
- No TypeScript errors
- No API call failures
- No rendering errors

## Troubleshooting

### Frontend Won't Start
\`\`\`bash
rm -rf node_modules package-lock.json
npm install
npm run dev
\`\`\`

### CORS Errors
Backend needs CORS middleware:
\`\`\`python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)
\`\`\`

### Wrong Backend URL
Edit `myzuriflat_frontend/.env`:
\`\`\`env
VITE_BACKEND_URL=http://localhost:8000
\`\`\`
Restart dev server after changing.

### Type Mismatches
If frontend shows type errors:
1. Check `src/api/types.ts`
2. Ensure backend JSON matches these interfaces
3. Check browser network tab for actual API responses

## Development Workflow

### Making Frontend Changes

1. Edit files in `src/`
2. Vite hot-reloads automatically
3. Check browser console for errors
4. Test interactions

### Making Backend Changes

1. Edit backend files
2. Uvicorn auto-reloads (if `--reload` flag used)
3. Check frontend updates automatically via React Query

### Syncing Types

When changing API contracts:

1. Update backend Pydantic models
2. Update `frontend/src/api/types.ts`
3. Update `frontend/src/api/hooks.ts` if needed
4. Test both sides

## Summary

✅ **Frontend:** Complete and ready
❌ **Backend:** Needs implementation
📝 **Next:** Follow AGENT.md to build backend

**Estimated Backend Implementation Time:** 4-8 hours for experienced developer

**Key Backend Components:**
- Data preprocessing (~1 hour)
- Ridge regression (~1 hour)
- PCA + clustering (~1 hour)
- API endpoints (~2-3 hours)
- Testing (~1-2 hours)

Good luck! 🚀
