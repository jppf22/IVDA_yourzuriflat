/**
 * Recommended List View (T1 - Identify suitable apartments, T4 - Calibration)
 * Displays apartments sorted by model preference score with inline rating controls
 */

import { useAppStore } from '../store/useAppStore';
import { useRecommendations } from '../api/hooks';
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

  // Update top recommendations when data changes
  if (recommendationsData && recommendationsData.recommendations.length > 0) {
    const topApts = recommendationsData.recommendations.slice(0, 5).map((r) => r.apartment);
    if (JSON.stringify(topApts) !== JSON.stringify(topRecommendations)) {
      setTopRecommendations(topApts);
    }
  }

  const topRecommendationIds = topRecommendations.map((apt) => apt.id);

  if (isLoading) {
    return (
      <div className="recommended-list-view">
        <LoadingSpinner message="Loading recommendations..." />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="recommended-list-view">
        <ErrorMessage message="Failed to load recommendations" onRetry={() => refetch()} />
      </div>
    );
  }

  if (!recommendationsData || recommendationsData.recommendations.length === 0) {
    return (
      <div className="recommended-list-view">
        <div className="empty-state">
          <p>No recommendations yet. Please rate some apartments to get started!</p>
        </div>
      </div>
    );
  }

  const { recommendations, model_trained } = recommendationsData;

  return (
    <div className="recommended-list-view">
      <div className="list-header">
        <h2>Recommended Apartments</h2>
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
              <th className="col-room-type">Room Type</th>
              <th className="col-reviews">Reviews</th>
              <th className="col-score">Score</th>
              <th className="col-rating">Your Rating</th>
              <th className="col-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {recommendations.map((rec, index) => {
              const { apartment, predicted_score } = rec;
              const isSelected = selectedApartmentIds.includes(apartment.id);
              const isBrushed = brushedApartmentIds.includes(apartment.id);
              const isTop = isTopRecommendation(apartment.id, topRecommendationIds);
              const color = getColorForApartment(apartment.id, topRecommendationIds);

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
                      onChange={() => toggleApartmentSelection(apartment.id)}
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
                      onClick={() => openDetailDrawer(apartment.id)}
                    >
                      {apartment.name}
                    </button>
                  </td>
                  <td className="col-price">{formatPrice(apartment.price)}</td>
                  <td className="col-distance">{formatDistance(apartment.distance_from_center)}</td>
                  <td className="col-room-type">{formatRoomType(apartment.room_type)}</td>
                  <td className="col-reviews">{formatNumber(apartment.number_of_reviews)}</td>
                  <td className="col-score">
                    <span className="score-value">{predicted_score.toFixed(2)}</span>
                  </td>
                  <td className="col-rating">
                    <RatingControl
                      apartmentId={apartment.id}
                      currentRating={currentRatings[apartment.id]}
                      onRate={(rating) => onRate(apartment.id, rating)}
                      size="small"
                    />
                  </td>
                  <td className="col-actions">
                    <button
                      className="view-details-button"
                      onClick={() => openDetailDrawer(apartment.id)}
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
