/**
 * React Query hooks for all API endpoints
 * Manages server state and caching
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../store/useAppStore';
import apiClient from './client';
import type {
  Apartment,
  ApartmentsResponse,
  ApartmentsQueryParams,
  RatingRequest,
  RatingResponse,
  RecommendationsResponse,
  PCAResponse,
  ExplainabilityResponse,
  ClustersResponse,
  InitialSampleResponse,
  FilterOptionsResponse,
  ApartmentFilters,
  NumericDistributionsResponse,
} from './types';

// Query keys for cache management
export const queryKeys = {
  apartments: (params?: ApartmentsQueryParams) => ['apartments', params] as const,
  apartmentDetail: (id: string) => ['apartment', id] as const,
  recommendations: (sessionId: string, limit: number, filterSig: string) => ['recommendations', sessionId, limit, filterSig] as const,
  pca: (attributes?: string[], mode?: 'pca' | 'raw', outliers?: boolean, filterSig?: string) => ['pca', attributes, mode, outliers, filterSig] as const,
  explainability: (sessionId: string, apartmentIds?: string[]) => ['explainability', sessionId, apartmentIds] as const,
  clusters: (filterSig: string) => ['clusters', filterSig] as const,
  initialSample: () => ['initialSample'] as const,
  initialSampleFiltered: (filterSig: string) => ['initialSample', filterSig] as const,
  filterOptions: () => ['filterOptions'] as const,
  numericDistributions: () => ['numericDistributions'] as const,
};

// Apartments list with filters
export const useApartments = (params?: ApartmentsQueryParams) => {
  const { filters, brushedApartmentIds, selectedClusterId } = useAppStore();
  const derived: Record<string, unknown> = {};
  const pushIf = (key: string, value: unknown) => {
    if (value !== undefined && value !== null && value !== '' && !(Array.isArray(value) && value.length === 0)) {
      derived[key] = value;
    }
  };

  pushIf('price_min', filters.price_min);
  pushIf('price_max', filters.price_max);

  const numericMap: Record<string, { minKey: string; maxKey: string }> = {
    accommodates: { minKey: 'accommodates_min', maxKey: 'accommodates_max' },
    bedrooms: { minKey: 'bedrooms_min', maxKey: 'bedrooms_max' },
    bathrooms: { minKey: 'bathrooms_min', maxKey: 'bathrooms_max' },
    beds: { minKey: 'beds_min', maxKey: 'beds_max' },
    minimum_nights: { minKey: 'minimum_nights_min', maxKey: 'minimum_nights_max' },
    maximum_nights: { minKey: 'maximum_nights_min', maxKey: 'maximum_nights_max' },
  };

  Object.values(numericMap).forEach((keys) => {
    const f = filters as ApartmentFilters;
    pushIf(keys.minKey, f[keys.minKey as keyof ApartmentFilters]);
    pushIf(keys.maxKey, f[keys.maxKey as keyof ApartmentFilters]);
  });

  const fAny = filters as ApartmentFilters;
  pushIf('distance_from_city_center_max', fAny.distance_from_city_center_max || filters.distance_max);
  pushIf('number_of_reviews_min', fAny.number_of_reviews_min);
  pushIf('availability_365_min', fAny.availability_365_min || filters.availability_min);
  pushIf('room_types', filters.room_types);
  pushIf('property_types', fAny.property_types);
  pushIf('neighbourhoods', filters.neighbourhoods);
  pushIf('neighbourhood_groups', fAny.neighbourhood_groups);

  if (selectedClusterId !== null) {
    pushIf('cluster_id', selectedClusterId);
  }

  if (brushedApartmentIds && brushedApartmentIds.length > 0) {
    derived['apartment_ids'] = brushedApartmentIds;
  }

  const finalParams: ApartmentsQueryParams = {
    ...(derived as ApartmentsQueryParams),
    ...(params || {}),
  };
  if (finalParams.limit === undefined) {
    finalParams.limit = 2500; // load full dataset for global views (Map, PCA)
  }
  const selectionSig = (brushedApartmentIds || []).join(',');
  const clusterSig = selectedClusterId !== null ? `cluster_${selectedClusterId}` : 'all';
  return useQuery<ApartmentsResponse>({
    queryKey: ['apartments', finalParams, selectionSig, clusterSig],
    queryFn: () => apiClient.get<ApartmentsResponse>('/apartments', finalParams as Record<string, unknown>),
    staleTime: 5 * 60 * 1000,
  });
};

// Single apartment detail
export const useApartmentDetail = (id: string) => {
  return useQuery<Apartment>({
    queryKey: queryKeys.apartmentDetail(id),
    queryFn: () => apiClient.get<Apartment>(`/apartments/${id}`),
    enabled: !!id,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
};

// Recommendations based on user ratings
export const useRecommendations = (sessionId: string, limit: number = 20, ratingsCount?: number) => {
  const { filters, brushedApartmentIds, selectedClusterId } = useAppStore();
  const params: Record<string, unknown> = { session_id: sessionId, limit };
  const pushIf = (key: string, value: unknown) => {
    if (value !== undefined && value !== null && value !== '' && !(Array.isArray(value) && value.length === 0)) {
      params[key] = value;
    }
  };
  pushIf('price_min', filters.price_min);
  pushIf('price_max', filters.price_max);
  const numericMap: Record<string, { minKey: string; maxKey: string }> = {
    accommodates: { minKey: 'accommodates_min', maxKey: 'accommodates_max' },
    bedrooms: { minKey: 'bedrooms_min', maxKey: 'bedrooms_max' },
    bathrooms: { minKey: 'bathrooms_min', maxKey: 'bathrooms_max' },
    beds: { minKey: 'beds_min', maxKey: 'beds_max' },
    minimum_nights: { minKey: 'minimum_nights_min', maxKey: 'minimum_nights_max' },
    maximum_nights: { minKey: 'maximum_nights_min', maxKey: 'maximum_nights_max' },
  };
  const fRec = filters as ApartmentFilters;
  Object.values(numericMap).forEach((keys) => {
    pushIf(keys.minKey, fRec[keys.minKey as keyof ApartmentFilters]);
    pushIf(keys.maxKey, fRec[keys.maxKey as keyof ApartmentFilters]);
  });
  pushIf('distance_from_city_center_max', fRec.distance_from_city_center_max || (fRec as ApartmentFilters).distance_max);
  pushIf('number_of_reviews_min', fRec.number_of_reviews_min);
  pushIf('availability_365_min', fRec.availability_365_min || (fRec as ApartmentFilters).availability_min);
  pushIf('room_types', filters.room_types);
  pushIf('property_types', fRec.property_types);
  pushIf('neighbourhoods', filters.neighbourhoods);
  pushIf('neighbourhood_groups', fRec.neighbourhood_groups);
  if (selectedClusterId !== null) {
    pushIf('cluster_id', selectedClusterId);
  }
  if (brushedApartmentIds && brushedApartmentIds.length > 0) {
    params['apartment_ids'] = brushedApartmentIds;
  }

  // Create a stable signature string for cache separation
  const filterSig = JSON.stringify(params, Object.keys(params).sort());

  const selectionSig = (brushedApartmentIds || []).join(',');
  return useQuery<RecommendationsResponse>({
    queryKey: ['recommendations', sessionId, limit, filterSig, selectionSig, ratingsCount],
    queryFn: () => apiClient.get<RecommendationsResponse>('/recommendations', params),
    enabled: !!sessionId,
    staleTime: 30000, // 30 seconds - prevents unnecessary refetches while scrolling
    refetchOnMount: false, // Don't refetch on mount to preserve scroll position
  });
};

// PCA or raw attribute scatter data
export const usePCA = (
  attributes?: string[],
  outliers: boolean = false
) => {
  const { filters, brushedApartmentIds } = useAppStore();
  const derived: Record<string, unknown> = {
    attributes: attributes?.join(','),
    filter_outliers: outliers,
  };
  const pushIf = (key: string, value: unknown) => {
    if (value !== undefined && value !== null && value !== '' && !(Array.isArray(value) && value.length === 0)) {
      derived[key] = value;
    }
  };
  // Reuse same mapping as apartments for consistency
  pushIf('price_min', filters.price_min);
  pushIf('price_max', filters.price_max);
  const numericMap: Record<string, { minKey: string; maxKey: string }> = {
    accommodates: { minKey: 'accommodates_min', maxKey: 'accommodates_max' },
    bedrooms: { minKey: 'bedrooms_min', maxKey: 'bedrooms_max' },
    bathrooms: { minKey: 'bathrooms_min', maxKey: 'bathrooms_max' },
    beds: { minKey: 'beds_min', maxKey: 'beds_max' },
    minimum_nights: { minKey: 'minimum_nights_min', maxKey: 'minimum_nights_max' },
    maximum_nights: { minKey: 'maximum_nights_min', maxKey: 'maximum_nights_max' },
  };
  const fPCA = filters as ApartmentFilters;
  Object.values(numericMap).forEach((keys) => {
    pushIf(keys.minKey, fPCA[keys.minKey as keyof ApartmentFilters]);
    pushIf(keys.maxKey, fPCA[keys.maxKey as keyof ApartmentFilters]);
  });
  pushIf('distance_from_city_center_max', fPCA.distance_from_city_center_max || fPCA.distance_max);
  pushIf('number_of_reviews_min', fPCA.number_of_reviews_min);
  pushIf('availability_365_min', fPCA.availability_365_min || fPCA.availability_min);
  pushIf('room_types', filters.room_types);
  pushIf('property_types', fPCA.property_types);
  pushIf('neighbourhoods', filters.neighbourhoods);
  pushIf('neighbourhood_groups', fPCA.neighbourhood_groups);
  if (brushedApartmentIds && brushedApartmentIds.length > 0) {
    derived['apartment_ids'] = brushedApartmentIds;
  }

  const filterSig = JSON.stringify(derived, Object.keys(derived).sort());
  const selectionSig = (brushedApartmentIds || []).join(',');
  return useQuery<PCAResponse>({
    queryKey: ['pca', attributes, undefined, outliers, filterSig, selectionSig],
    queryFn: () => apiClient.get<PCAResponse>('/pca', derived),
    enabled: true,
    staleTime: 5 * 60 * 1000,
  });
};

// Explainability - feature contributions
export const useExplainability = (sessionId: string, apartmentIds?: string[], modelTrained?: boolean) => {
  const { ratingsCount } = useAppStore();
  const isModelReady = modelTrained ?? (ratingsCount >= 5);
  
  return useQuery<ExplainabilityResponse>({
    queryKey: queryKeys.explainability(sessionId, apartmentIds),
    queryFn: () =>
      apiClient.get<ExplainabilityResponse>('/explainability', {
        session_id: sessionId,
        apartment_ids: apartmentIds?.join(','),
      }),
    enabled: !!sessionId && apartmentIds !== undefined && apartmentIds.length > 0 && isModelReady,
    staleTime: 0,
  });
};

// Clusters for map visualization
export const useClusters = () => {
  const { filters, brushedApartmentIds } = useAppStore();
  const derived: Record<string, unknown> = {};
  const pushIf = (key: string, value: unknown) => {
    if (value !== undefined && value !== null && value !== '' && !(Array.isArray(value) && value.length === 0)) {
      derived[key] = value;
    }
  };
  pushIf('price_min', filters.price_min);
  pushIf('price_max', filters.price_max);
  const numericMap: Record<string, { minKey: string; maxKey: string }> = {
    accommodates: { minKey: 'accommodates_min', maxKey: 'accommodates_max' },
    bedrooms: { minKey: 'bedrooms_min', maxKey: 'bedrooms_max' },
    bathrooms: { minKey: 'bathrooms_min', maxKey: 'bathrooms_max' },
    beds: { minKey: 'beds_min', maxKey: 'beds_max' },
    minimum_nights: { minKey: 'minimum_nights_min', maxKey: 'minimum_nights_max' },
    maximum_nights: { minKey: 'maximum_nights_min', maxKey: 'maximum_nights_max' },
  };
  const fClus = filters as ApartmentFilters;
  Object.values(numericMap).forEach((keys) => {
    pushIf(keys.minKey, fClus[keys.minKey as keyof ApartmentFilters]);
    pushIf(keys.maxKey, fClus[keys.maxKey as keyof ApartmentFilters]);
  });
  pushIf('distance_from_city_center_max', fClus.distance_from_city_center_max || fClus.distance_max);
  pushIf('number_of_reviews_min', fClus.number_of_reviews_min);
  pushIf('availability_365_min', fClus.availability_365_min || fClus.availability_min);
  pushIf('room_types', filters.room_types);
  pushIf('property_types', fClus.property_types);
  pushIf('neighbourhoods', filters.neighbourhoods);
  pushIf('neighbourhood_groups', fClus.neighbourhood_groups);
  if (brushedApartmentIds && brushedApartmentIds.length > 0) {
    derived['apartment_ids'] = brushedApartmentIds;
  }

  const filterSig = JSON.stringify(derived, Object.keys(derived).sort());
  const selectionSig = (brushedApartmentIds || []).join(',');
  return useQuery<ClustersResponse>({
    queryKey: ['clusters', filterSig, selectionSig],
    queryFn: () => apiClient.get<ClustersResponse>('/clusters', derived),
    staleTime: 10 * 60 * 1000,
  });
};

// Initial sample for calibration (cold start)
export const useInitialSample = () => {
  const { filters, brushedApartmentIds } = useAppStore();
  const params: Record<string, unknown> = {};
  const pushIf = (key: string, value: unknown) => {
    if (value !== undefined && value !== null && value !== '' && !(Array.isArray(value) && value.length === 0)) {
      params[key] = value;
    }
  };
  const f = filters as ApartmentFilters;
  pushIf('price_min', f.price_min);
  pushIf('price_max', f.price_max);
  const numericMap: Record<string, { minKey: string; maxKey: string }> = {
    accommodates: { minKey: 'accommodates_min', maxKey: 'accommodates_max' },
    bedrooms: { minKey: 'bedrooms_min', maxKey: 'bedrooms_max' },
    bathrooms: { minKey: 'bathrooms_min', maxKey: 'bathrooms_max' },
    beds: { minKey: 'beds_min', maxKey: 'beds_max' },
    minimum_nights: { minKey: 'minimum_nights_min', maxKey: 'minimum_nights_max' },
    maximum_nights: { minKey: 'maximum_nights_min', maxKey: 'maximum_nights_max' },
  };
  Object.values(numericMap).forEach((keys) => {
    pushIf(keys.minKey, f[keys.minKey as keyof ApartmentFilters]);
    pushIf(keys.maxKey, f[keys.maxKey as keyof ApartmentFilters]);
  });
  pushIf('distance_from_city_center_max', f.distance_from_city_center_max || f.distance_max);
  pushIf('number_of_reviews_min', f.number_of_reviews_min);
  pushIf('availability_365_min', f.availability_365_min || f.availability_min);
  pushIf('room_types', f.room_types);
  pushIf('property_types', f.property_types);
  pushIf('neighbourhoods', f.neighbourhoods);
  pushIf('neighbourhood_groups', f.neighbourhood_groups);
  if (brushedApartmentIds && brushedApartmentIds.length > 0) {
    params['apartment_ids'] = brushedApartmentIds;
  }
  const filterSig = JSON.stringify(params, Object.keys(params).sort());
  const selectionSig = (brushedApartmentIds || []).join(',');
  return useQuery<InitialSampleResponse>({
    queryKey: ['initialSample', filterSig, selectionSig],
    queryFn: () => apiClient.get<InitialSampleResponse>('/initial-sample', params),
    staleTime: 10 * 60 * 1000,
  });
};

// Mutation for submitting a rating
export const useRateMutation = () => {
  const queryClient = useQueryClient();

  return useMutation<RatingResponse, Error, RatingRequest>({
    mutationFn: (ratingData: RatingRequest) =>
      apiClient.post<RatingResponse>('/ratings', ratingData),
    onSuccess: async (_data, variables) => {
      const isRecommendationsQuery = (queryKey: unknown): boolean =>
        Array.isArray(queryKey) && queryKey[0] === 'recommendations' && queryKey[1] === variables.session_id;

      const isExplainabilityQuery = (queryKey: unknown): boolean =>
        Array.isArray(queryKey) && queryKey[0] === 'explainability' && queryKey[1] === variables.session_id;

      // Mark queries as stale - they'll refetch in background without scroll jump
      await queryClient.invalidateQueries({ predicate: (q) => isRecommendationsQuery(q.queryKey) });
      await queryClient.invalidateQueries({ predicate: (q) => isExplainabilityQuery(q.queryKey) });
      
      // Trigger background refetch without forcing immediate update
      queryClient.refetchQueries({ 
        predicate: (q) => isRecommendationsQuery(q.queryKey), 
        type: 'active'
      });
    },
    onError: (error) => {
      console.error('Rating submission failed:', error);
    },
  });
};

// Mutation for removing a rating
export const useRemoveRatingMutation = () => {
  const queryClient = useQueryClient();

  return useMutation<RatingResponse, Error, { session_id: string; apartment_id: string }>({
    mutationFn: ({ session_id, apartment_id }) =>
      apiClient.delete<RatingResponse>(`/ratings?session_id=${session_id}&apartment_id=${apartment_id}`),
    onSuccess: async (_data, variables) => {
      const isRecommendationsQuery = (queryKey: unknown): boolean =>
        Array.isArray(queryKey) && queryKey[0] === 'recommendations' && queryKey[1] === variables.session_id;

      const isExplainabilityQuery = (queryKey: unknown): boolean =>
        Array.isArray(queryKey) && queryKey[0] === 'explainability' && queryKey[1] === variables.session_id;

      // Mark queries as stale - they'll refetch in background without scroll jump
      await queryClient.invalidateQueries({ predicate: (q) => isRecommendationsQuery(q.queryKey) });
      await queryClient.invalidateQueries({ predicate: (q) => isExplainabilityQuery(q.queryKey) });
      
      // Trigger background refetch without forcing immediate update
      queryClient.refetchQueries({ 
        predicate: (q) => isRecommendationsQuery(q.queryKey), 
        type: 'active'
      });
    },
    onError: (error) => {
      console.error('Rating removal failed:', error);
    },
  });
};

// Helper hook to get all necessary data for a view
export const useApartmentData = (sessionId: string) => {
  const apartments = useApartments();
  const recommendations = useRecommendations(sessionId);
  const clusters = useClusters();

  return {
    apartments,
    recommendations,
    clusters,
    isLoading: apartments.isLoading || recommendations.isLoading || clusters.isLoading,
    isError: apartments.isError || recommendations.isError || clusters.isError,
  };
};

// Filter options (categorical values)
export const useFilterOptions = () => {
  return useQuery<FilterOptionsResponse>({
    queryKey: queryKeys.filterOptions(),
    queryFn: () => apiClient.get<FilterOptionsResponse>('/filter-options'),
    staleTime: 30 * 60 * 1000, // cache for 30 minutes
  });
};

// Numeric distributions for range sliders
export const useNumericDistributions = () => {
  return useQuery<NumericDistributionsResponse>({
    queryKey: queryKeys.numericDistributions(),
    queryFn: () => apiClient.get<NumericDistributionsResponse>('/numeric-distributions'),
    staleTime: 30 * 60 * 1000, // cache for 30 minutes
  });
};
