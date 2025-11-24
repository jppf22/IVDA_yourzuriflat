/**
 * Recommended List View (T1 - Identify suitable apartments, T4 - Calibration)
 * Displays apartments sorted by model preference score with inline rating controls
 * Includes integrated explainability panel for seamless user experience
 */

import { useAppStore } from '../store/useAppStore';
import { useRecommendations, useInitialSample, useExplainability } from '../api/hooks';
import { useEffect, useMemo, useState } from 'react';
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
  onRemoveRating: (apartmentId: string) => void;
  currentRatings: Record<string, number>;
}

type TabView = 'all' | 'rated' | 'bookmarked';

export const RecommendedListView = ({ onRate, onRemoveRating, currentRatings }: RecommendedListViewProps) => {
  const {
    sessionId,
    selectedApartmentIds,
    toggleApartmentSelection,
    openDetailDrawer,
    topRecommendations,
    setTopRecommendations,
    brushedApartmentIds,
    ratingsCount,
    bookmarkedApartmentIds,
    toggleBookmark,
  } = useAppStore();

  // Local state for tabs and explainability panel
  const [activeTab, setActiveTab] = useState<TabView>('all');
  const [showExplainability, setShowExplainability] = useState(false);
  const [selectedForExplain, setSelectedForExplain] = useState<string | null>(null);

  const {
    data: recommendationsData,
    isLoading,
    isError,
    refetch,
  } = useRecommendations(sessionId, 20, ratingsCount);

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

  // Prepare display recommendations (before any early returns)
  const fallbackRecommendations: Recommendation[] = useMemo(() => {
    if (!initialSampleData || !Array.isArray(initialSampleData.apartments)) return [];
    return initialSampleData.apartments.map((apt) => ({ apartment: apt, predicted_score: 0 as number }));
  }, [initialSampleData]);

  const hasRecommendations = recommendationsArray.length > 0;
  const displayRecommendations = hasRecommendations ? recommendationsArray : fallbackRecommendations;

  // Filter recommendations based on active tab (must be before early returns)
  const filteredRecommendations = useMemo(() => {
    if (activeTab === 'rated') {
      return displayRecommendations.filter(r => 
        currentRatings[String(r.apartment.id)] !== undefined
      );
    }
    if (activeTab === 'bookmarked') {
      return displayRecommendations.filter(r => 
        bookmarkedApartmentIds.includes(String(r.apartment.id))
      );
    }
    return displayRecommendations;
  }, [displayRecommendations, activeTab, currentRatings, bookmarkedApartmentIds]);

  // Count for each tab
  const ratedCount = useMemo(() => 
    displayRecommendations.filter(r => 
      currentRatings[String(r.apartment.id)] !== undefined
    ).length,
    [displayRecommendations, currentRatings]
  );

  const bookmarkedCount = useMemo(() => 
    displayRecommendations.filter(r => 
      bookmarkedApartmentIds.includes(String(r.apartment.id))
    ).length,
    [displayRecommendations, bookmarkedApartmentIds]
  );

  // Explainability for selected apartment
  const isModelReady = ratingsCount >= 5;
  const {
    data: explainData,
    isLoading: isExplainLoading,
  } = useExplainability(
    sessionId,
    selectedForExplain ? [selectedForExplain] : undefined,
    isModelReady
  );

  const calibrationComplete = useAppStore((s) => s.calibrationComplete);
  const setCalibrationComplete = useAppStore((s) => s.setCalibrationComplete);

  // Auto-show explainability panel after calibration (5+ ratings) - only once
  useEffect(() => {
    if (
      !calibrationComplete &&              // only if we haven't marked it complete yet
      ratingsCount >= 5 &&
      recommendationsArray.length > 0 &&
      !showExplainability
    ) {
      setShowExplainability(true);
      setCalibrationComplete(true);        // latch: don't auto-open again

      if (!selectedForExplain && recommendationsArray[0]) {
        setSelectedForExplain(String(recommendationsArray[0].apartment.id));
      }
    }
  }, [ratingsCount, calibrationComplete, showExplainability]);

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
  const recommendations = filteredRecommendations;

  // Calculate min/max scores for gradient visualization
  const scores = recommendations.map(r => r.predicted_score);
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);
  const scoreRange = maxScore - minScore || 1; // Avoid division by zero

  const getScoreGradient = (score: number, index: number) => {
    // Normalize score to 0-1 range
    const normalized = (score - minScore) / scoreRange;
    
    // Top 5 get special treatment with distinct colors
    if (index < 5) {
      // Gradient from green (high) to yellow (medium-high)
      const hue = 120 - (index * 15); // 120=green, 90=yellow-green, 60=yellow
      return `hsl(${hue}, 70%, 85%)`;
    }
    
    // Rest get gradient from yellow to red
    const hue = 60 - (normalized * 60); // 60=yellow, 0=red
    return `hsl(${hue}, 60%, 90%)`;
  };

  const getScoreBarWidth = (score: number) => {
    const normalized = (score - minScore) / scoreRange;
    return Math.max(20, normalized * 100); // Minimum 20% for visibility
  };

  const handleExplainClick = (aptId: string) => {
    // Toggle: if clicking the same apartment, deselect it (keep panel open but show prompt)
    if (selectedForExplain === aptId) {
      setSelectedForExplain(null);
    } else {
      setSelectedForExplain(aptId);
      setShowExplainability(true);
    }
  };

  // Get top feature contributions for visualization
  const getTopContributions = (limit: number = 10) => {
    if (!explainData || !explainData.contributions || explainData.contributions.length === 0) {
      return [];
    }

    const contrib = explainData.contributions[0];
    const features = explainData.coefficients.feature_names;
    const contributions = contrib.contributions;

    return contributions
      .map((value: number, index: number) => ({ feature: features[index], value }))
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
      .slice(0, limit);
  };

  const selectedRecommendation = selectedForExplain 
    ? recommendations.find(r => String(r.apartment.id) === selectedForExplain)
    : null;
  const selectedApartment = selectedRecommendation?.apartment || null;
  const selectedScore = selectedRecommendation?.predicted_score || 0;

  return (
    <div className="recommended-list-view">
      <div className="list-header">
        <div className="header-top">
          <h2>Recommended Apartments</h2>
          {model_trained && ratingsCount >= 5 && (
            <button 
              className="toggle-explain-button"
              onClick={(e) => {
                e.stopPropagation();
                setShowExplainability(!showExplainability);
              }}
              title={showExplainability ? 'Hide explainability panel' : 'Show explainability panel'}
            >
              {showExplainability ? '📊 Hide Explainability' : '📊 Show Explainability'}
            </button>
          )}
        </div>

        {/* Tab Navigation */}
        <div className="tab-navigation">
          <button
            className={`tab-button ${activeTab === 'all' ? 'active' : ''}`}
            onClick={() => setActiveTab('all')}
          >
            📋 All Listings <span className="tab-count">({displayRecommendations.length})</span>
          </button>
          <button
            className={`tab-button ${activeTab === 'rated' ? 'active' : ''}`}
            onClick={() => setActiveTab('rated')}
          >
            ⭐ My Ratings <span className="tab-count">({ratedCount})</span>
          </button>
          <button
            className={`tab-button ${activeTab === 'bookmarked' ? 'active' : ''}`}
            onClick={() => setActiveTab('bookmarked')}
          >
            🔖 Bookmarked <span className="tab-count">({bookmarkedCount})</span>
          </button>
        </div>

        {!model_trained && (
          <div className="calibration-notice">
            ⚠️ Model not yet trained. Rate {Math.max(0, 5 - ratingsCount)} more apartment{ratingsCount < 4 ? 's' : ''} for personalized recommendations.
          </div>
        )}
        {model_trained && ratingsCount >= 5 && (
          <div className="success-notice">
            ✅ Model trained! Showing personalized recommendations based on your preferences.
          </div>
        )}
      </div>

      <div className={`content-container ${showExplainability ? 'with-panel' : 'full-width'}`}>
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
                    <span 
                      className="rank-badge" 
                      style={{ 
                        backgroundColor: isTop ? color : (model_trained ? getScoreGradient(predicted_score, index) : '#e5e7eb'),
                        border: isTop ? `2px solid ${color}` : 'none',
                        fontWeight: isTop ? 'bold' : 'normal'
                      }}
                    >
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
                    <div className="score-container">
                      <div 
                        className="score-bar-background"
                        style={{
                          background: model_trained 
                            ? `linear-gradient(90deg, ${getScoreGradient(predicted_score, index)} ${getScoreBarWidth(predicted_score)}%, #f0f0f0 ${getScoreBarWidth(predicted_score)}%)`
                            : '#f9fafb'
                        }}
                      >
                        <span className="score-value">{predicted_score.toFixed(3)}</span>
                      </div>
                    </div>
                  </td>
                  <td className="col-rating">
                    <RatingControl
                      apartmentId={aptId}
                      currentRating={currentRatings[aptId]}
                      onRate={(rating) => onRate(aptId, rating)}
                      onRemove={() => onRemoveRating(aptId)}
                      size="small"
                    />
                  </td>
                  <td className="col-actions">
                    <div className="action-buttons">
                      <button
                        className={`bookmark-button ${bookmarkedApartmentIds.includes(aptId) ? 'bookmarked' : ''}`}
                        onClick={() => toggleBookmark(aptId)}
                        title={bookmarkedApartmentIds.includes(aptId) ? 'Remove bookmark' : 'Bookmark apartment'}
                      >
                        {bookmarkedApartmentIds.includes(aptId) ? '🔖' : '📌'}
                      </button>
                      <button
                        className="view-details-button"
                        onClick={() => openDetailDrawer(aptId)}
                        title="View full details"
                      >
                        📄
                      </button>
                      {model_trained && (
                        <button
                          className={`explain-button ${selectedForExplain === aptId ? 'active' : ''}`}
                          onClick={() => handleExplainClick(aptId)}
                          title="Explain why recommended"
                        >
                          💡
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Empty state for filtered views */}
        {recommendations.length === 0 && (
          <div className="empty-tab-state">
            {activeTab === 'rated' && (
              <p>📝 You haven't rated any apartments yet. Rate apartments to see them here!</p>
            )}
            {activeTab === 'bookmarked' && (
              <p>🔖 No bookmarked apartments. Click the bookmark button (📌) to save apartments for later!</p>
            )}
          </div>
        )}
        </div>

        {/* Explainability Side Panel */}
        {showExplainability && model_trained && (
          <div className="explainability-panel">
            <div className="panel-header">
              <h3>Why This Recommendation?</h3>
              <button 
                className="close-panel-button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowExplainability(false);
                }}
                title="Close explainability panel"
              >
                ✕
              </button>
            </div>

            {selectedApartment ? (
              <div className="panel-content">
                <div className="selected-apartment-info">
                  <h4>{selectedApartment.name}</h4>
                  <div className="apartment-quick-stats">
                    <span>{formatPrice(selectedApartment.price)}/night</span>
                    <span>•</span>
                    <span>{selectedApartment.beds} bed(s)</span>
                    <span>•</span>
                    <span>{formatDistance(selectedApartment.distance_from_city_center || 0)}</span>
                  </div>
                  <div className="similarity-score">
                    <strong>Similarity Score:</strong>{' '}
                    {selectedScore.toFixed(3)}
                  </div>
                </div>

                {isExplainLoading ? (
                  <LoadingSpinner message="Calculating contributions..." />
                ) : explainData ? (
                  <div className="contributions-viz">
                    <h5>Top Feature Contributions</h5>
                    <p className="contributions-description">
                      These features most influenced why this apartment was recommended for you:
                    </p>
                    <div className="contributions-list">
                      {getTopContributions(12).map((item, idx) => {
                        const isPositive = item.value > 0;
                        const barWidth = Math.min(Math.abs(item.value) * 100, 100);
                        
                        return (
                          <div key={idx} className="contribution-item">
                            <div className="contribution-label">
                              <span className="feature-name">{item.feature}</span>
                              <span className={`contribution-value ${isPositive ? 'positive' : 'negative'}`}>
                                {isPositive ? '+' : ''}{item.value.toFixed(4)}
                              </span>
                            </div>
                            <div className="contribution-bar-container">
                              <div 
                                className={`contribution-bar ${isPositive ? 'positive' : 'negative'}`}
                                style={{ width: `${barWidth}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="explainability-note">
                      <strong>💡 Tip:</strong> Click the 💡 icon next to any apartment to see its feature contributions.
                    </div>
                  </div>
                ) : (
                  <div className="no-explanation">
                    <p>Select an apartment to see why it was recommended.</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="panel-content">
                <div className="no-selection">
                  <p>👈 Click the 💡 icon next to an apartment to see why it was recommended for you.</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default RecommendedListView;
