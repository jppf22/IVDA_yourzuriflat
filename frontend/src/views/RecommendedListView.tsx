/**
 * Recommended List View (T1 - Identify, T4 - Calibrate)
 * Default ranking uses personalized cosine similarity, with optional attribute-based rankings.
 */

import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '../store/useAppStore';
import {
  useRecommendations,
  useInitialSample,
  useExplainability,
  useApartments,
  useClearRatingsMutation,
} from '../api/hooks';
import apiClient from '../api/client';
import { RatingControl } from '../components/RatingControl';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ErrorMessage } from '../components/ErrorMessage';
import { getColorForApartment, isTopRecommendation } from '../utils/colors';
import { formatPrice, formatDistance, formatRoomType, formatNumber } from '../utils/formatting';
import type { Recommendation, Apartment, ApartmentsResponse, RecommendationsResponse } from '../api/types';
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
    clearSelection,
    openDetailDrawer,
    topRecommendations,
    setTopRecommendations,
    brushedApartmentIds,
    ratingsCount,
    bookmarkedApartmentIds,
    toggleBookmark,
    clearBrushed,
    clearAllRatings,
    setRatingsCount,
    syncComplete,
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
        // Don't pass brushed IDs filter for attribute rankings - we want to show all apartments
        // and just highlight the brushed ones
        ignoreBrushedFilter: true,
      } as const;
    }
    return undefined;
  }, [isModelRanking, rankingOption]);

  const {
    data: apartmentsData,
    isLoading: isApartmentsLoading,
    isError: isApartmentsError,
  } = useApartments(sortParams);

  // Fetch rated apartments separately when on "rated" tab
  // Use a separate query that bypasses global filters
  const ratedApartmentIds = useMemo(() => Object.keys(currentRatings), [currentRatings]);
  
  const {
    data: ratedApartmentsData,
    isLoading: isRatedApartmentsLoading,
  } = useQuery<ApartmentsResponse>({
    queryKey: ['ratedApartments', ratedApartmentIds.sort()], // Sort for stable key
    queryFn: () => 
      apiClient.get<ApartmentsResponse>('/apartments', {
        apartment_ids: ratedApartmentIds,
        limit: 2500,
      }),
    enabled: ratedApartmentIds.length > 0, // Always fetch when there are ratings
    staleTime: 5 * 60 * 1000,
  });

  // Fetch recommendations for rated apartments to get their similarity scores
  const {
    data: ratedRecommendationsData,
  } = useQuery<RecommendationsResponse>({
    queryKey: ['ratedRecommendations', sessionId, ratedApartmentIds.sort(), ratingsCount],
    queryFn: () =>
      apiClient.get<RecommendationsResponse>('/recommendations', {
        session_id: sessionId,
        apartment_ids: ratedApartmentIds,
        limit: ratedApartmentIds.length, // Get all rated apartments
      }),
    enabled: syncComplete && ratedApartmentIds.length > 0 && ratingsCount >= 5, // Only when model is trained
    staleTime: 30000,
  });

  const clearRatingsMutation = useClearRatingsMutation();

  const handleClearAllRatings = useCallback(() => {
    if (ratingsCount === 0 || clearRatingsMutation.isPending) {
      return;
    }
    const confirmed = window.confirm(
      'This will remove all of your ratings and reset the recommendation model. Continue?' 
    );
    if (!confirmed) {
      return;
    }
    clearRatingsMutation.mutate(
      { session_id: sessionId },
      {
        onSuccess: (data) => {
          clearAllRatings();
          clearSelection();
          clearBrushed();
          setTopRecommendations([]);
          setRatingsCount(data.ratings_count);
          setSelectedForExplain(null);
          setShowExplainability(false);
        },
      }
    );
  }, [
    ratingsCount,
    clearRatingsMutation,
    sessionId,
    clearAllRatings,
    clearSelection,
    clearBrushed,
    setTopRecommendations,
    setRatingsCount,
    setSelectedForExplain,
    setShowExplainability,
  ]);

  const recommendationsArray: Recommendation[] = useMemo(() => {
    if (!recommendationsData || !Array.isArray(recommendationsData.recommendations)) {
      return [];
    }
    return (recommendationsData.recommendations as Recommendation[]).map((rec) => {
      const numericScore = Number(rec.predicted_score);
      return {
        apartment: rec.apartment,
        predicted_score: Number.isFinite(numericScore) ? numericScore : 0,
      };
    });
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
    // Add scores from main recommendations
    recommendationsArray.forEach((rec) => {
      const numericScore = Number(rec.predicted_score);
      map.set(String(rec.apartment.id), Number.isFinite(numericScore) ? numericScore : 0);
    });
    // Add scores from rated apartments query (for My Ratings tab)
    if (ratedRecommendationsData?.recommendations) {
      ratedRecommendationsData.recommendations.forEach((rec: Recommendation) => {
        const numericScore = Number(rec.predicted_score);
        map.set(String(rec.apartment.id), Number.isFinite(numericScore) ? numericScore : 0);
      });
    }
    return map;
  }, [recommendationsArray, ratedRecommendationsData]);

  const rankingRows: DisplayRow[] = useMemo(() => {
    if (isModelRanking) {
      const source = recommendationsArray.length > 0 ? recommendationsArray : fallbackRecommendations;
      return source.map((rec) => {
        const numericScore = Number(rec.predicted_score);
        const safeScore = Number.isFinite(numericScore) ? numericScore : undefined;
        return {
          apartment: rec.apartment,
          similarityScore: safeScore,
          metricValue: safeScore,
        };
      });
    }
    const apartments = apartmentsData?.apartments ?? [];
    return apartments.map((apartment) => {
      const metricRaw = rankingOption.getMetricValue?.(apartment) ?? null;
      const metricNumeric = typeof metricRaw === 'number' ? metricRaw : Number(metricRaw);
      const metric = Number.isFinite(metricNumeric) ? metricNumeric : null;
      const score = recommendationScoreMap.get(String(apartment.id));
      const safeScore = score !== undefined ? Number(score) : undefined;
      const normalizedScore = safeScore !== undefined && Number.isFinite(safeScore) ? safeScore : undefined;
      return {
        apartment,
        metricValue: metric,
        similarityScore: normalizedScore,
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
      // Use dedicated rated apartments query for consistent results
      if (!ratedApartmentsData?.apartments) {
        return [];
      }
      return ratedApartmentsData.apartments.map((apartment) => {
        const metricRaw = rankingOption.getMetricValue?.(apartment) ?? null;
        const metricNumeric = typeof metricRaw === 'number' ? metricRaw : Number(metricRaw);
        const metric = Number.isFinite(metricNumeric) ? metricNumeric : null;
        const score = recommendationScoreMap.get(String(apartment.id));
        const safeScore = score !== undefined ? Number(score) : undefined;
        const normalizedScore = safeScore !== undefined && Number.isFinite(safeScore) ? safeScore : undefined;
        return {
          apartment,
          metricValue: metric,
          similarityScore: normalizedScore,
        };
      });
    }
    if (activeTab === 'bookmarked') {
      return rankingRows.filter((row) => bookmarkedApartmentIds.includes(String(row.apartment.id)));
    }
    return rankingRows;
  }, [rankingRows, activeTab, ratedApartmentsData, bookmarkedApartmentIds, rankingOption, recommendationScoreMap]);

  const visibleRows = useMemo(() => {
    if (activeTab === 'all') {
      return filteredRows.slice(0, displayLimit);
    }
    return filteredRows;
  }, [filteredRows, activeTab, displayLimit]);

  const totalCount = rankingRows.length;
  
  // Calculate ratedCount from currentRatings directly, not from rankingRows
  const ratedCount = useMemo(
    () => Object.keys(currentRatings).length,
    [currentRatings]
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
    let source: Recommendation[] = recommendationsArray.length > 0 ? recommendationsArray : fallbackRecommendations;
    if (brushedApartmentIds.length > 0) {
      const filtered = source.filter((rec) => brushedApartmentIds.includes(String(rec.apartment.id)));
      if (filtered.length > 0) {
        source = filtered;
      }
    }
    if (source.length === 0) {
      if (topRecommendations.length !== 0) {
        setTopRecommendations([]);
      }
      return;
    }
    const plannedTop = source
      .slice(0, 5)
      .map((item) => ({ ...item.apartment, id: String(item.apartment.id) }));
    const changed =
      plannedTop.length !== topRecommendations.length ||
      plannedTop.some((apartment, index) => String(apartment.id) !== String(topRecommendations[index]?.id));
    if (changed) {
      setTopRecommendations(plannedTop);
    }
  }, [
    recommendationsArray,
    fallbackRecommendations,
    brushedApartmentIds,
    topRecommendations,
    setTopRecommendations,
  ]);

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
  const canResetProfile = ratingsCount > 0;
  const isResettingProfile = clearRatingsMutation.isPending;

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
        // Top 5 recommendations: use green shades (120 hue)
        const lightness = 85 - index * 3; // Gradually darker green
        return `hsl(120, 70%, ${lightness}%)`;
      }
      // Others: gradient from green (high score) to red (low score)
      const hue = normalized * 120; // 0 (red) to 120 (green)
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
    if (
      !explainData ||
      !Array.isArray(explainData.contributions) ||
      explainData.contributions.length === 0 ||
      !explainData.coefficients ||
      !Array.isArray(explainData.coefficients.feature_names)
    ) {
      return [];
    }
    const contribution = explainData.contributions[0];
    if (!contribution || !Array.isArray(contribution.contributions)) {
      return [];
    }
    const features = explainData.coefficients.feature_names;
    return contribution.contributions
      .map((value, index) => {
        const numericValue = Number(value);
        return {
          feature: features[index] ?? `feature_${index + 1}`,
          value: Number.isFinite(numericValue) ? numericValue : 0,
        };
      })
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
      .slice(0, limit);
  };

  const selectedRow = selectedForExplain
    ? filteredRows.find((row) => String(row.apartment.id) === selectedForExplain)
    : null;
  const selectedApartment = selectedRow?.apartment ?? null;
  const explainPredictedScore = explainData?.contributions?.[0]?.predicted_score;
  const selectedScore = selectedRow?.similarityScore ?? explainPredictedScore ?? null;

  // Calculate color for selected apartment's similarity score
  const selectedScoreColor = useMemo(() => {
    if (!selectedForExplain) {
      return '#e5e7eb'; // Default gray
    }
    const row = filteredRows.find((item) => String(item.apartment.id) === selectedForExplain);
    const fallbackScore = explainData?.contributions?.[0]?.predicted_score ?? null;
    const resolvedScore = row?.similarityScore ?? fallbackScore;
    if (resolvedScore === null || resolvedScore === undefined) {
      return '#e5e7eb';
    }
    const indexInFiltered = filteredRows.findIndex((item) => String(item.apartment.id) === selectedForExplain);
    if (indexInFiltered < 0) {
      return '#e5e7eb';
    }
    return getScoreGradient(resolvedScore, indexInFiltered);
  }, [selectedForExplain, filteredRows, explainData, getScoreGradient]);

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

  if (activeTab === 'rated' && isRatedApartmentsLoading && !ratedApartmentsData) {
    return (
      <div className="recommended-list-view">
        <LoadingSpinner message="Loading your rated apartments..." />
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
          <div className="header-actions">
            <button
              className="reset-profile-button"
              onClick={handleClearAllRatings}
              disabled={!canResetProfile || isResettingProfile}
              title={
                canResetProfile
                  ? 'Remove all ratings and restart your recommendation profile'
                  : 'No ratings to clear yet'
              }
            >
              {isResettingProfile ? 'Resetting…' : 'Reset Ratings'}
            </button>
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
                      {(() => {
                        const reviewScore = Number(apartment.review_scores_rating);
                        const hasScore = Number.isFinite(reviewScore) && reviewScore > 0;
                        const reviewsCount = Number(apartment.number_of_reviews);
                        const hasCount = Number.isFinite(reviewsCount) && reviewsCount > 0;
                        if (hasScore) {
                          return (
                            <div className="review-info">
                              <span className="review-rating" title="Average rating">
                                ⭐ {reviewScore.toFixed(1)}
                              </span>
                              {hasCount && (
                                <span className="review-count" title="Number of reviews">
                                  ({formatNumber(reviewsCount)})
                                </span>
                              )}
                            </div>
                          );
                        }
                        if (hasCount) {
                          return (
                            <span className="review-count">{formatNumber(reviewsCount)} reviews</span>
                          );
                        }
                        return <span className="no-reviews">No reviews</span>;
                      })()}
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
                  <div 
                    className="similarity-score"
                    style={{ 
                      backgroundColor: selectedScoreColor,
                      padding: '0.5rem',
                      borderRadius: '4px',
                      marginTop: '0.5rem'
                    }}
                  >
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
