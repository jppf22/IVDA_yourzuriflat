/**
 * Layout View - Main application layout coordinating all views
 * Supports all IVDA tasks (T1-T6)
 */

import { useState } from 'react';
import { RecommendedListView } from './RecommendedListView';
import { MapView } from './MapView';
import { PCAScatterView } from './PCAScatterView';
import { StarComparisonView } from './StarComparisonView';
import { ExplainabilityView } from './ExplainabilityView';
import { ApartmentDetailDrawer } from '../components/ApartmentDetailDrawer';
import { FilterPanel } from '../components/FilterPanel';
import { useAppStore } from '../store/useAppStore';
import { useRateMutation } from '../api/hooks';
import './LayoutView.css';

export const LayoutView = () => {
  const { sessionId, setRatingsCount, ratingsCount } = useAppStore();
  const [currentRatings, setCurrentRatings] = useState<Record<string, number>>({});

  const rateMutation = useRateMutation();

  const handleRate = (apartmentId: string, rating: number) => {
    // Update local state immediately
    setCurrentRatings((prev) => ({ ...prev, [apartmentId]: rating }));

    // Submit to backend
    rateMutation.mutate(
      {
        session_id: sessionId,
        apartment_id: apartmentId,
        rating,
      },
      {
        onSuccess: (data) => {
          setRatingsCount(data.ratings_count);
        },
        onError: (error) => {
          console.error('Failed to submit rating:', error);
          // Optionally revert local state on error
        },
      }
    );
  };

  return (
    <div className="layout-view">
      {/* Header */}
      <header className="app-header">
        <h1>YourZuriFlat</h1>
        <div className="header-info">
          <span className="ratings-count">Ratings: {ratingsCount}</span>
          <span className="session-id" title={sessionId}>
            Session: {sessionId.substring(0, 12)}...
          </span>
        </div>
      </header>

      {/* Main Content */}
      <div className="main-content">
        {/* Sidebar with Filters */}
        <aside className="sidebar">
          <FilterPanel />
        </aside>

        {/* Primary View Area */}
        <main className="primary-area">
          {/* Top Section: Recommended List */}
          <section className="section-recommended">
            <RecommendedListView onRate={handleRate} currentRatings={currentRatings} />
          </section>

          {/* Middle Section: Map and PCA */}
          <section className="section-visualizations">
            <div className="viz-panel">
              <MapView />
            </div>
            <div className="viz-panel">
              <PCAScatterView />
            </div>
          </section>

          {/* Bottom Section: Comparison and Explainability */}
          <section className="section-analysis">
            <div className="analysis-panel">
              <StarComparisonView />
            </div>
            <div className="analysis-panel">
              <ExplainabilityView />
            </div>
          </section>
        </main>
      </div>

      {/* Detail Drawer */}
      <ApartmentDetailDrawer onRate={handleRate} currentRatings={currentRatings} />
    </div>
  );
};

export default LayoutView;
