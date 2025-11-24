/**
 * Recommended List View (T1 - Identify, T4 - Calibrate)
 * Default ranking uses personalized cosine similarity, with optional attribute-based rankings.
 */

import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import {
  useRecommendations,
  useInitialSample,
  useExplainability,
  useApartments,
} from '../api/hooks';
import { RatingControl } from '../components/RatingControl';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ErrorMessage } from '../components/ErrorMessage';
import { getColorForApartment, isTopRecommendation } from '../utils/colors';
import { formatPrice, formatDistance, formatRoomType, formatNumber } from '../utils/formatting';
import type { Recommendation, Apartment } from '../api/types';
import './RecommendedListView.css';

const ITEMS_PER_PAGE = 20;

type RankingOptionId =
  | 'model'
  | 'price_low_high'
  | 'price_high_low'
  | 'distance_low_high'
  | 'reviews_high_low'
  | 'beds_high_low';

interface RankingOption {
  id: RankingOptionId;
  label: string;
  type: 'model' | 'attribute';
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  scoreLabel: string;
  getMetricValue?: (apartment: Apartment) => number | null | undefined;
  formatMetric?: (value: number | null | undefined, apartment: Apartment) => string;
  description?: string;
}

interface DisplayRow {
  apartment: Apartment;
  similarityScore?: number;
  metricValue?: number | null;
}

interface RecommendedListViewProps {
  onRate: (apartmentId: string, rating: number) => void;
  onRemoveRating: (apartmentId: string) => void;
  currentRatings: Record<string, number>;
}

type TabView = 'all' | 'rated' | 'bookmarked';

const RANKING_OPTIONS: RankingOption[] = [
  {
    id: 'model',
    label: 'Model Recommendations',
    type: 'model',
    scoreLabel: 'Similarity Score',
    description: 'Personalized ranking based on your ratings.',
  },
  {
    id: 'price_low_high',
    label: 'Price (Low → High)',
    type: 'attribute',
    sortBy: 'price',
    sortOrder: 'asc',
    scoreLabel: 'Nightly Price',
    getMetricValue: (apartment) => apartment.price,
    formatMetric: (value) => (typeof value === 'number' ? formatPrice(value) : '—'),
    description: 'Sorts the list by nightly price from least to most expensive.',
  },
  {
    id: 'price_high_low',
    label: 'Price (High → Low)',
    type: 'attribute',
    sortBy: 'price',
    sortOrder: 'desc',
    scoreLabel: 'Nightly Price',
    getMetricValue: (apartment) => apartment.price,
    formatMetric: (value) => (typeof value === 'number' ? formatPrice(value) : '—'),
    description: 'Sorts the list by nightly price from most to least expensive.',
  },
  {
    id: 'distance_low_high',
    label: 'Distance to Center (Near → Far)',
    type: 'attribute',
    sortBy: 'distance_from_city_center',
    sortOrder: 'asc',
    scoreLabel: 'Distance to Center',
    getMetricValue: (apartment) =>
      apartment.distance_from_city_center ?? (apartment.distance_from_center as number | undefined) ?? null,
    formatMetric: (_value, apartment) =>
      formatDistance(apartment.distance_from_city_center ?? apartment.distance_from_center ?? 0),
    description: 'Highlights listings closest to Zurich city center first.',
  },
  {
    id: 'reviews_high_low',
    label: 'Reviews (Most → Fewest)',
    type: 'attribute',
    sortBy: 'number_of_reviews',
    sortOrder: 'desc',
    scoreLabel: 'Number of Reviews',
    getMetricValue: (apartment) => apartment.number_of_reviews ?? 0,
    formatMetric: (value) => (typeof value === 'number' ? formatNumber(value) : '—'),
    description: 'Surface the most-reviewed listings to understand popularity.',
  },
  {
    id: 'beds_high_low',
    label: 'Beds (Most → Fewest)',
    type: 'attribute',
    sortBy: 'beds',
    sortOrder: 'desc',
    scoreLabel: 'Beds Available',
    getMetricValue: (apartment) => apartment.beds ?? 0,
    formatMetric: (value) => (typeof value === 'number' ? value.toString() : '—'),
    description: 'Focus on listings that offer the highest sleeping capacity.',
  },
];

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

  const [activeTab, setActiveTab] = useState<TabView>('all');
  const [selectedRankingId, setSelectedRankingId] = useState<RankingOptionId>('model');
  const rankingOption = useMemo(
    () => RANKING_OPTIONS.find((option) => option.id === selectedRankingId) ?? RANKING_OPTIONS[0],
    [selectedRankingId]
  );
  const isModelRanking = rankingOption.type === 'model';

  const [showExplainability, setShowExplainability] = useState(false);
  const [selectedForExplain, setSelectedForExplain] = useState<string | null>(null);

  const [displayLimit, setDisplayLimit] = useState(ITEMS_PER_PAGE);
  const [modelLimit, setModelLimit] = useState(ITEMS_PER_PAGE);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const loadMoreRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollPositionRef = useRef<number>(0);

  useEffect(() => {
    if (isModelRanking) {
      setModelLimit(displayLimit);
    }
  }, [isModelRanking, displayLimit]);

  const {
    data: recommendationsData,
    isLoading: isRecommendationsLoading,
    isError: isRecommendationsError,
    refetch,
  } = useRecommendations(sessionId, modelLimit, ratingsCount);

  const {
    data: initialSampleData,
    isLoading: isInitialSampleLoading,
    isError: isInitialSampleError,
  } = useInitialSample();

  const sortParams = useMemo(() => {
    if (!isModelRanking && rankingOption.sortBy) {
      return {
        sort_by: rankingOption.sortBy,
        sort_order: rankingOption.sortOrder ?? 'asc',
        limit: 2500,
      } as const;
    }
    return undefined;
  }, [isModelRanking, rankingOption]);

  const {
    data: apartmentsData,
    isLoading: isApartmentsLoading,
    isError: isApartmentsError,
  } = useApartments(sortParams);

  const recommendationsArray: Recommendation[] = useMemo(() => {
    if (!recommendationsData || !Array.isArray(recommendationsData.recommendations)) {
      return [];
    }
    return recommendationsData.recommendations as Recommendation[];
  }, [recommendationsData]);

  const fallbackRecommendations: Recommendation[] = useMemo(() => {
    if (!initialSampleData || !Array.isArray(initialSampleData.apartments)) {
      return [];
    }
    return initialSampleData.apartments.map((apartment) => ({
      apartment,
      predicted_score: 0,
    }));
  }, [initialSampleData]);

  const recommendationScoreMap = useMemo(() => {
    const map = new Map<string, number>();
    recommendationsArray.forEach((rec) => {
      map.set(String(rec.apartment.id), rec.predicted_score);
    });
    return map;
  }, [recommendationsArray]);

  const rankingRows: DisplayRow[] = useMemo(() => {
    if (isModelRanking) {
      const source = recommendationsArray.length > 0 ? recommendationsArray : fallbackRecommendations;
      return source.map((rec) => ({
        apartment: rec.apartment,
        similarityScore: rec.predicted_score,
        metricValue: rec.predicted_score,
      }));
    }
    const apartments = apartmentsData?.apartments ?? [];
    return apartments.map((apartment) => {
      const metric = rankingOption.getMetricValue?.(apartment) ?? null;
      return {
        apartment,
        metricValue: metric,
        similarityScore: recommendationScoreMap.get(String(apartment.id)) ?? undefined,
      };
    });
  }, [
    isModelRanking,
    recommendationsArray,
    fallbackRecommendations,
    apartmentsData,
    rankingOption,
    recommendationScoreMap,
  ]);

  const filteredRows = useMemo(() => {
    if (activeTab === 'rated') {
      return rankingRows.filter((row) => currentRatings[String(row.apartment.id)] !== undefined);
    }
    if (activeTab === 'bookmarked') {
      return rankingRows.filter((row) => bookmarkedApartmentIds.includes(String(row.apartment.id)));
    }
    return rankingRows;
  }, [rankingRows, activeTab, currentRatings, bookmarkedApartmentIds]);

  const visibleRows = useMemo(() => {
    if (activeTab === 'all') {
      return filteredRows.slice(0, displayLimit);
    }
    return filteredRows;
  }, [filteredRows, activeTab, displayLimit]);

  const totalCount = rankingRows.length;
  const ratedCount = useMemo(
    () => rankingRows.filter((row) => currentRatings[String(row.apartment.id)] !== undefined).length,
    [rankingRows, currentRatings]
  );
  const bookmarkedCount = useMemo(
    () => rankingRows.filter((row) => bookmarkedApartmentIds.includes(String(row.apartment.id))).length,
    [rankingRows, bookmarkedApartmentIds]
  );

  const rankLookup = useMemo(() => {
    const map = new Map<string, number>();
    rankingRows.forEach((row, index) => {
      map.set(String(row.apartment.id), index);
    });
    return map;
  }, [rankingRows]);

  const topRecommendationIds = useMemo(
    () => topRecommendations.map((apartment) => String(apartment.id)),
    [topRecommendations]
  );

  const isModelReady = ratingsCount >= 5;
  const {
    data: explainData,
    isLoading: isExplainLoading,
  } = useExplainability(
    sessionId,
    selectedForExplain ? [selectedForExplain] : undefined,
    isModelReady
  );

  const calibrationComplete = useAppStore((state) => state.calibrationComplete);
  const setCalibrationComplete = useAppStore((state) => state.setCalibrationComplete);

  useEffect(() => {
    if (
      !calibrationComplete &&
      ratingsCount >= 5 &&
      recommendationsArray.length > 0 &&
      !showExplainability &&
      selectedRankingId === 'model'
    ) {
      setShowExplainability(true);
      setCalibrationComplete(true);
      if (!selectedForExplain && recommendationsArray[0]) {
        setSelectedForExplain(String(recommendationsArray[0].apartment.id));
      }
    }
  }, [
    calibrationComplete,
    ratingsCount,
    recommendationsArray,
    showExplainability,
    selectedForExplain,
    selectedRankingId,
    setCalibrationComplete,
  ]);

  useEffect(() => {
    if (selectedRankingId !== 'model' || recommendationsArray.length === 0) {
      return;
    }
    const plannedTop = recommendationsArray.slice(0, 5).map((item) => item.apartment);
    const changed =
      plannedTop.length !== topRecommendations.length ||
      plannedTop.some((apartment, index) => String(apartment.id) !== String(topRecommendations[index]?.id));
    if (changed) {
      setTopRecommendations(plannedTop);
    }
  }, [selectedRankingId, recommendationsArray, topRecommendations, setTopRecommendations]);

  useEffect(() => {
    setDisplayLimit(ITEMS_PER_PAGE);
  }, [activeTab, selectedRankingId]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container && scrollPositionRef.current > 0) {
      requestAnimationFrame(() => {
        if (scrollPositionRef.current) {
          container.scrollTop = scrollPositionRef.current;
        }
      });
    }
  }, [visibleRows]);

  const saveScrollPosition = useCallback(() => {
    if (scrollContainerRef.current) {
      scrollPositionRef.current = scrollContainerRef.current.scrollTop;
    }
  }, []);

  const isPrimaryLoading = isModelRanking ? isRecommendationsLoading : isApartmentsLoading;

  const loadMoreItems = useCallback(() => {
    if (isLoadingMore || isPrimaryLoading) {
      return;
    }
    if (activeTab !== 'all') {
      return;
    }

    if (isModelRanking) {
      if (recommendationsArray.length < modelLimit) {
        return;
      }
      saveScrollPosition();
      setIsLoadingMore(true);
      setDisplayLimit((prev) => prev + ITEMS_PER_PAGE);
      return;
    }

    if (displayLimit >= totalCount) {
      return;
    }

    saveScrollPosition();
    setIsLoadingMore(true);
    setDisplayLimit((prev) => Math.min(prev + ITEMS_PER_PAGE, totalCount));
    setTimeout(() => setIsLoadingMore(false), 200);
  }, [
    isLoadingMore,
    isPrimaryLoading,
    activeTab,
    isModelRanking,
    recommendationsArray.length,
    modelLimit,
    saveScrollPosition,
    displayLimit,
    totalCount,
  ]);

  useEffect(() => {
    if (!isRecommendationsLoading) {
      setIsLoadingMore(false);
    }
  }, [isRecommendationsLoading]);

  useEffect(() => {
    if (!isModelRanking) {
      setIsLoadingMore(false);
    }
  }, [isModelRanking]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          loadMoreItems();
        }
      },
      { threshold: 0.1, rootMargin: '160px' }
    );

    const target = loadMoreRef.current;
    if (target) {
      observer.observe(target);
    }
    return () => {
      if (target) {
        observer.unobserve(target);
      }
    };
  }, [loadMoreItems]);

  const modelTrained = recommendationsData?.model_trained ?? false;

  const scoreStats = useMemo(() => {
    if (!isModelRanking || filteredRows.length === 0) {
      return { min: 0, max: 1, range: 1 };
    }
    const values = filteredRows.map((row) => row.similarityScore ?? 0);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    return { min, max, range };
  }, [isModelRanking, filteredRows]);

  const getScoreGradient = useCallback(
    (score: number, index: number) => {
      if (!isModelRanking) {
        return '#e5e7eb';
      }
      const normalized = (score - scoreStats.min) / scoreStats.range;
      if (index < 5) {
        const hue = 120 - index * 15;
        return `hsl(${hue}, 70%, 85%)`;
      }
      const hue = 60 - normalized * 60;
      return `hsl(${hue}, 60%, 90%)`;
    },
    [isModelRanking, scoreStats]
  );

  const getScoreBarWidth = useCallback(
    (score: number) => {
      if (!isModelRanking) {
        return 100;
      }
      const normalized = (score - scoreStats.min) / scoreStats.range;
      return Math.max(20, normalized * 100);
    },
    [isModelRanking, scoreStats]
  );

  const handleExplainClick = (apartmentId: string) => {
    if (selectedForExplain === apartmentId) {
      setSelectedForExplain(null);
      return;
    }
    setSelectedForExplain(apartmentId);
    setShowExplainability(true);
  };

  const getTopContributions = (limit: number = 10) => {
    if (!explainData || !explainData.contributions?.length) {
      return [];
    }
    const contribution = explainData.contributions[0];
    const features = explainData.coefficients.feature_names;
    return contribution.contributions
      .map((value, index) => ({ feature: features[index], value }))
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
      .slice(0, limit);
  };

  const selectedRow = selectedForExplain
    ? rankingRows.find((row) => String(row.apartment.id) === selectedForExplain)
    : null;
  const selectedApartment = selectedRow?.apartment ?? null;
  const explainPredictedScore = explainData?.contributions?.[0]?.predicted_score;
  const selectedScore = selectedRow?.similarityScore ?? explainPredictedScore ?? null;

  const formatMetricValue = (row: DisplayRow, apartment: Apartment) => {
    if (isModelRanking) {
      return row.similarityScore !== undefined ? row.similarityScore.toFixed(3) : '—';
    }
    if (!rankingOption.formatMetric) {
      return row.metricValue !== null && row.metricValue !== undefined ? String(row.metricValue) : '—';
    }
    return rankingOption.formatMetric(row.metricValue ?? null, apartment);
  };

  if (isModelRanking && isRecommendationsLoading && !isInitialSampleLoading) {
    return (
      <div className="recommended-list-view">
        <LoadingSpinner message="Loading recommendations..." />
      </div>
    );
  }

  if (!isModelRanking && isApartmentsLoading && rankingRows.length === 0) {
    return (
      <div className="recommended-list-view">
        <LoadingSpinner message="Loading apartments..." />
      </div>
    );
  }

  if (isModelRanking && isRecommendationsError && !initialSampleData) {
    return (
      <div className="recommended-list-view">
        <ErrorMessage message="Failed to load recommendations" onRetry={() => refetch()} />
      </div>
    );
  }

  if (!isModelRanking && isApartmentsError) {
    return (
      <div className="recommended-list-view">
        <ErrorMessage message="Unable to load apartments for the selected ranking." onRetry={() => setSelectedRankingId('model')} />
      </div>
    );
  }

  if (rankingRows.length === 0) {
    if (isModelRanking && (isRecommendationsLoading || isInitialSampleLoading)) {
      return (
        <div className="recommended-list-view">
          <LoadingSpinner message="Preparing apartments..." />
        </div>
      );
    }
    return (
      <div className="recommended-list-view">
        <div className="empty-state">
          <p>No apartments match the current filters. Try adjusting the filters or your ranking selection.</p>
          {isModelRanking && isInitialSampleError && <p>Initial sample unavailable. Please try refreshing.</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="recommended-list-view">
      <div className="list-header">
        <div className="header-top">
          <h2>Recommended Apartments</h2>
          {modelTrained && ratingsCount >= 5 && (
            <button
              className="toggle-explain-button"
              onClick={(event) => {
                event.stopPropagation();
                setShowExplainability((visible) => !visible);
              }}
              title={showExplainability ? 'Hide explainability panel' : 'Show explainability panel'}
            >
              {showExplainability ? '📊 Hide Explainability' : '📊 Show Explainability'}
            </button>
          )}
        </div>

        <div className="tab-navigation">
          <button className={`tab-button ${activeTab === 'all' ? 'active' : ''}`} onClick={() => setActiveTab('all')}>
            📋 All Listings <span className="tab-count">({totalCount})</span>
          </button>
          <button className={`tab-button ${activeTab === 'rated' ? 'active' : ''}`} onClick={() => setActiveTab('rated')}>
            ⭐ My Ratings <span className="tab-count">({ratedCount})</span>
          </button>
          <button
            className={`tab-button ${activeTab === 'bookmarked' ? 'active' : ''}`}
            onClick={() => setActiveTab('bookmarked')}
          >
            🔖 Bookmarked <span className="tab-count">({bookmarkedCount})</span>
          </button>
        </div>

        <div className="ranking-controls">
          <label htmlFor="ranking-select">Ranking mode</label>
          <select
            id="ranking-select"
            className="ranking-select"
            value={selectedRankingId}
            onChange={(event) => setSelectedRankingId(event.target.value as RankingOptionId)}
          >
            {RANKING_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          {rankingOption.description && <span className="ranking-description">{rankingOption.description}</span>}
        </div>

        {!modelTrained && (
          <div className="calibration-notice">
            ⚠️ Model not yet trained. Rate {Math.max(0, 5 - ratingsCount)} more apartment{ratingsCount < 4 ? 's' : ''} for personalized recommendations.
          </div>
        )}
        {modelTrained && ratingsCount >= 5 && (
          <div className="success-notice">
            ✅ Model trained! Showing personalized recommendations based on your preferences.
          </div>
        )}
      </div>

      <div className={`content-container ${showExplainability ? 'with-panel' : 'full-width'}`}>
        <div className="list-container" ref={scrollContainerRef}>
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
                <th className="col-score">{rankingOption.scoreLabel}</th>
                <th className="col-rating">Your Rating</th>
                <th className="col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, index) => {
                const { apartment } = row;
                const apartmentId = String(apartment.id);
                const isSelected = selectedApartmentIds.includes(apartmentId);
                const isBrushed = brushedApartmentIds.includes(apartmentId);
                const isTop = isTopRecommendation(apartmentId, topRecommendationIds);
                const color = getColorForApartment(apartmentId, topRecommendationIds);
                const globalIndex = rankLookup.get(apartmentId) ?? index;

                return (
                  <tr
                    key={apartmentId}
                    className={`apartment-row ${isSelected ? 'selected' : ''} ${isBrushed ? 'brushed' : ''}`}
                    style={{ borderLeft: isTop ? `4px solid ${color}` : undefined }}
                  >
                    <td className="col-select">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleApartmentSelection(apartmentId)}
                        aria-label={`Select ${apartment.name}`}
                      />
                    </td>
                    <td className="col-rank">
                      <span
                        className="rank-badge"
                        style={{
                          backgroundColor: isTop ? color : getScoreGradient(row.similarityScore ?? 0, globalIndex),
                          border: isTop ? `2px solid ${color}` : 'none',
                          fontWeight: isTop ? 'bold' : 'normal',
                        }}
                      >
                        #{globalIndex + 1}
                      </span>
                    </td>
                    <td className="col-name">
                      <button className="apartment-name-button" onClick={() => openDetailDrawer(apartmentId)}>
                        {apartment.name}
                      </button>
                    </td>
                    <td className="col-price">{formatPrice(apartment.price)}</td>
                    <td className="col-distance">
                      {formatDistance(apartment.distance_from_city_center ?? apartment.distance_from_center ?? 0)}
                    </td>
                    <td className="col-property-type">{apartment.property_type}</td>
                    <td className="col-room-type">{formatRoomType(apartment.room_type)}</td>
                    <td className="col-accommodates">{apartment.accommodates}</td>
                    <td className="col-bedrooms">
                      {apartment.beds}/{apartment.bedrooms}
                    </td>
                    <td className="col-reviews">
                      {apartment.number_of_reviews !== undefined ? formatNumber(apartment.number_of_reviews) : '—'}
                    </td>
                    <td className={`col-score ${isModelRanking ? '' : 'attribute-score'}`}>
                      {isModelRanking ? (
                        <div className="score-container">
                          <div
                            className="score-bar-background"
                            style={{
                              background: `linear-gradient(90deg, ${getScoreGradient(
                                row.similarityScore ?? 0,
                                globalIndex
                              )} ${getScoreBarWidth(row.similarityScore ?? 0)}%, #f0f0f0 ${getScoreBarWidth(
                                row.similarityScore ?? 0
                              )}%)`,
                            }}
                          >
                            <span className="score-value">
                              {row.similarityScore !== undefined ? row.similarityScore.toFixed(3) : '—'}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <span className="attribute-score-value">{formatMetricValue(row, apartment)}</span>
                      )}
                    </td>
                    <td className="col-rating">
                      <RatingControl
                        apartmentId={apartmentId}
                        currentRating={currentRatings[apartmentId]}
                        onRate={(rating) => onRate(apartmentId, rating)}
                        onRemove={() => onRemoveRating(apartmentId)}
                        size="small"
                      />
                    </td>
                    <td className="col-actions">
                      <div className="action-buttons">
                        <button
                          className={`bookmark-button ${bookmarkedApartmentIds.includes(apartmentId) ? 'bookmarked' : ''}`}
                          onClick={() => toggleBookmark(apartmentId)}
                          title={
                            bookmarkedApartmentIds.includes(apartmentId)
                              ? 'Remove bookmark'
                              : 'Bookmark apartment'
                          }
                        >
                          {bookmarkedApartmentIds.includes(apartmentId) ? '🔖' : '📌'}
                        </button>
                        <button
                          className="view-details-button"
                          onClick={() => openDetailDrawer(apartmentId)}
                          title="View full details"
                        >
                          📄
                        </button>
                        {modelTrained && (
                          <button
                            className={`explain-button ${selectedForExplain === apartmentId ? 'active' : ''}`}
                            onClick={() => handleExplainClick(apartmentId)}
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

          <div ref={loadMoreRef} className="load-more-trigger">
            {isLoadingMore && <span className="loading-more-indicator">Loading more apartments…</span>}
          </div>

          {visibleRows.length === 0 && (
            <div className="empty-tab-state">
              {activeTab === 'rated' && <p>📝 You have not rated any apartments yet.</p>}
              {activeTab === 'bookmarked' && <p>🔖 Bookmark apartments to track them here.</p>}
            </div>
          )}
        </div>

        {showExplainability && modelTrained && (
          <div className="explainability-panel">
            <div className="panel-header">
              <h3>Why This Recommendation?</h3>
              <button
                className="close-panel-button"
                onClick={(event) => {
                  event.stopPropagation();
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
                    <span>{formatDistance(selectedApartment.distance_from_city_center ?? 0)}</span>
                  </div>
                  <div className="similarity-score">
                    <strong>Similarity Score:</strong>{' '}
                    {selectedScore !== null ? selectedScore.toFixed(3) : '—'}
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
                        const positive = item.value > 0;
                        const width = Math.min(Math.abs(item.value) * 100, 100);
                        return (
                          <div key={`${item.feature}-${idx}`} className="contribution-item">
                            <div className="contribution-label">
                              <span className="feature-name">{item.feature}</span>
                              <span className={`contribution-value ${positive ? 'positive' : 'negative'}`}>
                                {positive ? '+' : ''}
                                {item.value.toFixed(4)}
                              </span>
                            </div>
                            <div className="contribution-bar-container">
                              <div
                                className={`contribution-bar ${positive ? 'positive' : 'negative'}`}
                                style={{ width: `${width}%` }}
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
