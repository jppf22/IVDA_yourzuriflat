/**
 * Layout View - Main application layout coordinating all views
 * Supports all IVDA tasks (T1-T6)
 */

import { useState, useEffect } from 'react';
import { RecommendedListView } from './RecommendedListView';
import { MapView } from './MapView';
import { UMAPScatterView } from './UMAPScatterView';
import { StarComparisonView } from './StarComparisonView';
import { ExplainabilityView } from './ExplainabilityView';
import { ApartmentDetailDrawer } from '../components/ApartmentDetailDrawer';
import { FilterPanel } from '../components/FilterPanel';
import { CalibrationPopup } from '../components/CalibrationPopup';
import { useAppStore } from '../store/useAppStore';
import { useRateMutation, useRemoveRatingMutation } from '../api/hooks';
import apiClient from '../api/client';
import './LayoutView.css';

export const LayoutView = () => {
  const { 
    sessionId, 
    setRatingsCount, 
    ratingsCount, 
    userRatings, 
    setUserRating, 
    removeUserRating,
    isSyncing,
    setIsSyncing,
    syncComplete,
    setSyncComplete
  } = useAppStore();

  const rateMutation = useRateMutation();
  const removeRatingMutation = useRemoveRatingMutation();

  // Sync persisted ratings with backend on mount
  useEffect(() => {
    const syncRatings = async () => {
      const ratingEntries = Object.entries(userRatings);
      
      // If no ratings to sync, mark as complete immediately
      if (ratingEntries.length === 0) {
        setSyncComplete(true);
        return;
      }

      // Set syncing state to block queries
      setIsSyncing(true);

      // Submit all persisted ratings to backend
      try {
        console.log(`Syncing ${ratingEntries.length} ratings to backend...`);
        
        // Submit ratings sequentially to ensure backend processes them
        for (const [apartmentId, rating] of ratingEntries) {
          await apiClient.post('/ratings', {
            session_id: sessionId,
            apartment_id: apartmentId,
            rating,
          });
        }
        
        // Verify sync by getting ratings count from backend
        const response = await apiClient.get(`/ratings?session_id=${sessionId}`);
        
        // Handle response safely
        if (response && response.data) {
          const backendData = response.data;
          const backendRatings = backendData.ratings || {};
          const backendCount = backendData.ratings_count || Object.keys(backendRatings).length;
          
          setRatingsCount(backendCount);
          console.log(`✓ Successfully synced ${backendCount} ratings to backend`);
        } else {
          // If verification fails, use local count
          setRatingsCount(ratingEntries.length);
          console.log(`✓ Synced ${ratingEntries.length} ratings (verification skipped)`);
        }
        
      } catch (error) {
        console.error('Failed to sync ratings with backend:', error);
        // Even on error, set count from local state (optimistic)
        setRatingsCount(ratingEntries.length);
      } finally {
        setIsSyncing(false);
        setSyncComplete(true);
      }
    };

    syncRatings();
  }, [sessionId]); // Only run once on mount with current sessionId

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
      {/* Calibration Popup - Only shows when ratingsCount === 0 */}
      <CalibrationPopup />

      {/* Sync Loading Overlay */}
      {isSyncing && (
        <div className="sync-overlay">
          <div className="sync-message">
            <div className="sync-spinner"></div>
            <p>Restoring your ratings...</p>
            <small>Syncing {ratingsCount} rating{ratingsCount !== 1 ? 's' : ''} with backend</small>
          </div>
        </div>
      )}
      
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
              <UMAPScatterView />
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
