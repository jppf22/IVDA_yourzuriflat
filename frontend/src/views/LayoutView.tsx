/**
 * Layout View - Main application layout coordinating all views
 * Supports all IVDA tasks (T1-T6)
 */

import { useState, useEffect } from 'react';
import { RecommendedListView } from './RecommendedListView';
import { MapView } from './MapView';
import { PCAScatterView } from './PCAScatterView';
import { StarComparisonView } from './StarComparisonView';
import { ExplainabilityView } from './ExplainabilityView';
import { ApartmentDetailDrawer } from '../components/ApartmentDetailDrawer';
import { FilterPanel } from '../components/FilterPanel';
import { useAppStore } from '../store/useAppStore';
import { useRateMutation, useRemoveRatingMutation } from '../api/hooks';
import './LayoutView.css';

export const LayoutView = () => {
  const { sessionId, setRatingsCount, ratingsCount, userRatings, setUserRating, removeUserRating } = useAppStore();

  const rateMutation = useRateMutation();
  const removeRatingMutation = useRemoveRatingMutation();

  const handleRate = (apartmentId: string, rating: number) => {
    // Update persisted store immediately
    setUserRating(apartmentId, rating);

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
          // Keep local rating even if backend fails
        },
      }
    );
  };

  const handleRemoveRating = (apartmentId: string) => {
    // Update persisted store immediately
    removeUserRating(apartmentId);

    // Submit to backend
    removeRatingMutation.mutate(
      {
        session_id: sessionId,
        apartment_id: apartmentId,
      },
      {
        onSuccess: (data) => {
          setRatingsCount(data.ratings_count);
        },
        onError: (error) => {
          console.error('Failed to remove rating:', error);
          // Keep local state even if backend fails
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
        {/* Sidebar with Map and Filters */}
        <aside className="sidebar">
          <div className="sidebar-map">
            <MapView />
          </div>
          <FilterPanel />
        </aside>

        {/* Primary View Area */}
        <main className="primary-area">
          {/* Top Section: Recommended List */}
          <section className="section-recommended">
            <RecommendedListView onRate={handleRate} onRemoveRating={handleRemoveRating} currentRatings={userRatings} />
          </section>

          {/* Middle Section: PCA */}
          <section className="section-visualizations">
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
      <ApartmentDetailDrawer onRate={handleRate} onRemoveRating={handleRemoveRating} currentRatings={userRatings} />
    </div>
  );
};

export default LayoutView;
