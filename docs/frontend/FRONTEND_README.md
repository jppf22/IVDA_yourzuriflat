# YourZuriFlat Frontend

Interactive visual data analysis tool for short-term apartment rentals in Zurich.

## Overview

This React + TypeScript application provides a multi-view interactive visualization interface for exploring and rating Zurich apartment listings. It implements a human-in-the-loop recommendation system where user ratings train a personalized preference model.

## Tech Stack

- **React 19** with TypeScript
- **Vite** - Fast build tool and dev server  
- **Plotly.js** - All visualizations (maps, scatter plots, radar charts, bar charts)
- **TanStack Query (React Query)** - Server state management
- **Zustand** - UI state management  
- **Axios** - HTTP client

## IVDA Tasks Implementation

- **T1 - Identify suitable apartments**: Ranked recommendations list
- **T2 - Compare apartments**: Radar chart for multi-attribute comparison
- **T3 - Summarize model reasoning**: Feature contribution bar charts
- **T4 - Calibrate regression**: Star rating controls throughout app
- **T5 - Explore apartments**: Interactive map with filters
- **T6 - Relate attributes**: PCA scatter plot and spatial clustering

## Key Features

### Multi-View Coordination
- **Linked Brushing**: Lasso/box select in map or PCA automatically highlights in all views
- **Shared Color Encoding**: Top 5 recommendations use consistent colors across all visualizations
- **Detail-on-Demand**: Click any apartment to open detailed side drawer

### Interactive Visualizations
- **Map View**: Zurich apartments with dynamic clustering (zoom-dependent)
- **PCA Scatter Plot**: Toggle between raw attributes and principal components
- **Radar Chart**: Compare up to 5 apartments on normalized dimensions
- **Feature Contributions**: Explainability view showing model reasoning

### Personalization
- **Star Rating System**: Rate apartments 1-5 stars
- **Real-time Model Updates**: Backend retrains after each rating
- **Session-based**: Preferences maintained within session

## Setup

### Prerequisites
- Node.js 18+
- npm
- Backend API running (default: `http://localhost:8000`)

### Installation

\`\`\`bash
npm install
\`\`\`

### Environment Configuration

Create `.env` file:

\`\`\`env
VITE_BACKEND_URL=http://localhost:8000
\`\`\`

### Development

\`\`\`bash
npm run dev
\`\`\`

Opens at `http://localhost:5173`

### Production Build

\`\`\`bash
npm run build
npm run preview
\`\`\`

## Project Structure

\`\`\`
src/
├── api/                    # API layer
│   ├── client.ts           # Axios HTTP client
│   ├── types.ts            # TypeScript interfaces (sync with backend)
│   └── hooks.ts            # React Query hooks for all endpoints
│
├── components/             # Reusable components
│   ├── ApartmentDetailDrawer.tsx   # Side drawer for details
│   ├── FilterPanel.tsx             # Collapsible filter controls
│   ├── RatingControl.tsx           # Star rating widget
│   ├── LoadingSpinner.tsx          # Loading state
│   └── ErrorMessage.tsx            # Error state with retry
│
├── views/                  # Main application views
│   ├── LayoutView.tsx              # Master layout coordinating all views
│   ├── RecommendedListView.tsx     # T1, T4: Ranked list + ratings
│   ├── MapView.tsx                 # T5, T6: Interactive Zurich map
│   ├── PCAScatterView.tsx          # T6: Attribute relationships
│   ├── StarComparisonView.tsx      # T2: Radar chart comparison
│   └── ExplainabilityView.tsx      # T3: Feature contributions
│
├── store/
│   └── useAppStore.ts      # Zustand global UI state
│
├── utils/
│   ├── colors.ts           # Color schemes and palettes
│   └── formatting.ts       # Data display formatters
│
├── styles/                 # Component-specific CSS
├── App.tsx                 # Root component with providers
└── main.tsx                # Entry point
\`\`\`

## State Management Strategy

### Server State (React Query)
- Apartments list
- Recommendations
- PCA coordinates
- Explainability data
- Clusters
- Initial calibration sample

### UI State (Zustand)
- Selected apartment IDs
- Brushed apartment IDs (from lasso selection)
- Top 5 recommendations (for color encoding)
- Active filters
- PCA mode (raw vs PCA)
- Detail drawer state
- Session ID
- Ratings count

## API Integration

All backend communication is centralized in `src/api/`:

\`\`\`typescript
// Example: Using React Query hooks
const { data, isLoading, isError } = useRecommendations(sessionId);
const rateMutation = useRateMutation();

rateMutation.mutate({
  session_id: sessionId,
  apartment_id: '123',
  rating: 5,
});
\`\`\`

### Available Hooks
- `useApartments(filters)` - GET /apartments
- `useApartmentDetail(id)` - GET /apartments/:id
- `useRecommendations(sessionId, limit)` - GET /recommendations
- `usePCA(attributes, mode, outliers)` - GET /pca
- `useExplainability(sessionId, apartmentIds)` - GET /explainability
- `useClusters()` - GET /clusters
- `useInitialSample()` - GET /initial-sample
- `useRateMutation()` - POST /ratings

## Design Decisions

### Why Plotly.js?
- Single visualization library (per AGENT.md requirements)
- Interactive out-of-the-box (hover, zoom, pan, select)
- Supports all needed chart types
- React integration via react-plotly.js

### Why Zustand?
- Lightweight (compared to Redux)
- Simple API for UI state
- Works alongside React Query (server state)
- No boilerplate

### Why React Query?
- Automatic caching and revalidation
- Loading and error states built-in
- Optimistic updates
- Request deduplication

## Development Guidelines

### Adding New Features

1. **Check IVDA alignment**: Does it support T1-T6?
2. **Update types**: Add interfaces to `src/api/types.ts`
3. **Add API hooks**: Create query/mutation hooks in `src/api/hooks.ts`
4. **Update views**: Modify relevant view component
5. **Test interactions**: Ensure brushing/linking still works

### Code Style

- TypeScript for all new code
- PascalCase for components
- camelCase for functions/variables
- Functional components with hooks
- Extract reusable logic into custom hooks

### Performance

- Debounce filter inputs (500ms)
- Lazy load detail drawer content
- Virtualize large lists if needed
- Use React.memo for expensive renders

## Known Limitations

- No authentication/user management
- Session data not persisted (lost on refresh)
- No mobile/tablet optimization
- Limited error recovery options
- No offline support

## Future Enhancements

### High Priority
- [ ] Persistent sessions (localStorage or backend)
- [ ] Initial calibration modal/wizard
- [ ] Better error handling with user-friendly messages
- [ ] Loading skeleton screens

### Medium Priority
- [ ] Advanced filters (text search, date ranges)
- [ ] Export recommendations as CSV/PDF
- [ ] Share session via URL
- [ ] Comparison history

### Low Priority
- [ ] Dark mode theme
- [ ] Mobile responsive design
- [ ] Keyboard shortcuts
- [ ] Accessibility improvements (WCAG AA)
- [ ] Unit and integration tests

## Troubleshooting

### Backend Connection Issues
\`\`\`
Error: Network Error
\`\`\`
- Check backend is running on configured URL
- Verify VITE_BACKEND_URL in .env
- Check CORS settings in backend

### Build Errors
\`\`\`bash
npm install  # Reinstall dependencies
rm -rf node_modules package-lock.json
npm install  # Clean install
\`\`\`

### Type Errors
- Ensure `src/api/types.ts` matches backend Pydantic schemas
- Check TypeScript version compatibility

## Contributing

This is a university course project. Follow AGENT.md guidelines:

1. Maintain alignment with T1-T6 tasks
2. Keep frontend/backend contracts in sync
3. Update types when changing APIs
4. Test linked multi-view interactions
5. Follow existing code conventions

## License

University course project for IVDA (Interactive Visual Data Analysis).
