/**
 * Main App Component
 * Sets up React Query provider and renders the main layout
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LayoutView } from './views/LayoutView';
import './App.css';

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LayoutView />
    </QueryClientProvider>
  );
}

export default App;
