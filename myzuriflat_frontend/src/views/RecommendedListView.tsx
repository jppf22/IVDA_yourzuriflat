/**
 * Recommended List View (T1 - Identify suitable apartments, T4 - Calibration)
 * Displays apartments sorted by model preference score with inline rating controls
 */

import { useAppStore } from '../store/useAppStore';
import { useRecommendations, useInitialSample } from '../api/hooks';
import { useEffect, useMemo } from 'react';
import { RatingControl } from '../components/RatingControl';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ErrorMessage } from '../components/ErrorMessage';
import { getColorForApartment, isTopRecommendation } from '../utils/colors';
import {
  formatPrice,
  formatDistance,
  formatRoomType,
  formatNumber,
} from '../utils/formatting';
import './RecommendedListView.css';
import type { Recommendation } from '../api/types';

interface RecommendedListViewProps {
  onRate: (apartmentId: string, rating: number) => void;
  currentRatings: Record<string, number>;
}

export const RecommendedListView = ({ onRate, currentRatings }: RecommendedListViewProps) => {
  const {
    sessionId,
    selectedApartmentIds,
    toggleApartmentSelection,
    openDetailDrawer,
    topRecommendations,
    setTopRecommendations,
    brushedApartmentIds,
  } = useAppStore();

  const {
    data: recommendationsData,
    isLoading,
    isError,
    refetch,
  } = useRecommendations(sessionId);

  const {
    data: initialSampleData,
    isLoading: isInitialSampleLoading,
    isError: isInitialSampleError,
  } = useInitialSample();

  // Memoize recommendation array safely
  const recommendationsArray: Recommendation[] = useMemo(() => {
    if (!recommendationsData || !Array.isArray(recommendationsData.recommendations)) return [];
    return recommendationsData.recommendations as Recommendation[];
  }, [recommendationsData]);

  // Update top recommendations in an effect (avoid state change during render)
  useEffect(() => {
    if (recommendationsArray.length > 0) {
      const topApts = recommendationsArray.slice(0, 5).map((r) => r.apartment);
      if (JSON.stringify(topApts) !== JSON.stringify(topRecommendations)) {
        setTopRecommendations(topApts);
      }
    }
  }, [recommendationsArray, topRecommendations, setTopRecommendations]);

  const topRecommendationIds = topRecommendations.map((apt) => String(apt.id));

  if (isLoading && !isInitialSampleLoading) {
    return (
      <div className="recommended-list-view">
        <LoadingSpinner message="Loading recommendations..." />
      </div>
    );
  }

  if (isError && !initialSampleData) {
    return (
      <div className="recommended-list-view">
        <ErrorMessage message="Failed to load recommendations" onRetry={() => refetch()} />
      </div>
    );
  }

  const fallbackRecommendations: Recommendation[] = initialSampleData && Array.isArray(initialSampleData.apartments)
    ? initialSampleData.apartments.map((apt) => ({ apartment: apt, predicted_score: 0 as number }))
    : [];

  const hasRecommendations = recommendationsArray.length > 0;
  const recommendationsSource = hasRecommendations ? 'model' : 'initial';
  const displayRecommendations = hasRecommendations ? recommendationsArray : fallbackRecommendations;

  if (!displayRecommendations || displayRecommendations.length === 0) {
    return (
      <div className="recommended-list-view">
        <div className="empty-state">
          <p>No recommendations yet. Please rate some apartments to get started!</p>
          {isInitialSampleError && (
            <p>Initial sample unavailable. Please try refreshing.</p>
          )}
        </div>
      </div>
    );
  }

  const model_trained = recommendationsData?.model_trained ?? false;
  const recommendations = displayRecommendations;

  return (
    <div className="recommended-list-view">
      <div className="list-header">
        <h2>Recommended Apartments</h2>
        <div style={{fontSize:'0.7rem',color:'#555'}}>debug: recs={recommendations.length} source={recommendationsSource} trained={String(model_trained)} session={sessionId.substring(0,8)}</div>
        {!model_trained && (
          <div className="calibration-notice">
            ⚠️ Model not yet trained. Rate more apartments for personalized recommendations.
          </div>
        )}
      </div>

      <div className="list-container">
        <table className="apartments-table">
          <thead>
            <tr>
              <th className="col-select">Select</th>
              <th className="col-rank">Rank</th>
              <th className="col-name">Name</th>
              <th className="col-price">Price</th>
              <th className="col-distance">Distance</th>
              <th className="col-property-type">Property</th>
              <th className="col-room-type">Room Type</th>
              <th className="col-accommodates">Accom.</th>
              <th className="col-bedrooms">Beds/Bedrooms</th>
              <th className="col-reviews">Reviews</th>
              <th className="col-score">Score</th>
              <th className="col-rating">Your Rating</th>
              <th className="col-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {recommendations.map((rec: Recommendation, index: number) => {
              const { apartment, predicted_score } = rec;
              const aptId = String(apartment.id);
              const isSelected = selectedApartmentIds.includes(aptId);
              const isBrushed = brushedApartmentIds.includes(aptId);
              const isTop = isTopRecommendation(aptId, topRecommendationIds);
              const color = getColorForApartment(aptId, topRecommendationIds);

              return (
                <tr
                  key={apartment.id}
                  className={`apartment-row ${isSelected ? 'selected' : ''} ${isBrushed ? 'brushed' : ''}`}
                  style={{
                    borderLeft: isTop ? `4px solid ${color}` : undefined,
                  }}
                >
                  <td className="col-select">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleApartmentSelection(aptId)}
                      aria-label={`Select ${apartment.name}`}
                    />
                  </td>
                  <td className="col-rank">
                    <span className="rank-badge" style={{ backgroundColor: isTop ? color : undefined }}>
                      #{index + 1}
                    </span>
                  </td>
                  <td className="col-name">
                    <button
                      className="apartment-name-button"
                      onClick={() => openDetailDrawer(aptId)}
                    >
                      {apartment.name}
                    </button>
                  </td>
                  <td className="col-price">{formatPrice(apartment.price)}</td>
                  <td className="col-distance">{formatDistance((apartment.distance_from_city_center || apartment.distance_from_center || 0))}</td>
                  <td className="col-property-type">{apartment.property_type}</td>
                  <td className="col-room-type">{formatRoomType(apartment.room_type)}</td>
                  <td className="col-accommodates">{apartment.accommodates}</td>
                  <td className="col-bedrooms">{apartment.beds}/{apartment.bedrooms}</td>
                  <td className="col-reviews">{apartment.number_of_reviews !== undefined ? formatNumber(apartment.number_of_reviews) : '—'}</td>
                  <td className="col-score">
                    <span className="score-value">{predicted_score.toFixed(2)}</span>
                  </td>
                  <td className="col-rating">
                    <RatingControl
                      apartmentId={aptId}
                      currentRating={currentRatings[aptId]}
                      onRate={(rating) => onRate(aptId, rating)}
                      size="small"
                    />
                  </td>
                  <td className="col-actions">
                    <button
                      className="view-details-button"
                      onClick={() => openDetailDrawer(aptId)}
                    >
                      View Details
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default RecommendedListView;
