/**
 * React Query hooks for all API endpoints
 * Manages server state and caching
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
} from './types';

// Query keys for cache management
export const queryKeys = {
  apartments: (params?: ApartmentsQueryParams) => ['apartments', params] as const,
  apartmentDetail: (id: string) => ['apartment', id] as const,
  recommendations: (sessionId: string, limit?: number) => ['recommendations', sessionId, limit] as const,
  pca: (attributes?: string[], mode?: 'pca' | 'raw', outliers?: boolean) => ['pca', attributes, mode, outliers] as const,
  explainability: (sessionId: string, apartmentIds?: string[]) => ['explainability', sessionId, apartmentIds] as const,
  clusters: () => ['clusters'] as const,
  initialSample: () => ['initialSample'] as const,
};

// Apartments list with filters
export const useApartments = (params?: ApartmentsQueryParams) => {
  return useQuery<ApartmentsResponse>({
    queryKey: queryKeys.apartments(params),
    queryFn: () => apiClient.get<ApartmentsResponse>('/apartments', params as Record<string, unknown>),
    staleTime: 5 * 60 * 1000, // 5 minutes
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
export const useRecommendations = (sessionId: string, limit: number = 20) => {
  return useQuery<RecommendationsResponse>({
    queryKey: queryKeys.recommendations(sessionId, limit),
    queryFn: () => apiClient.get<RecommendationsResponse>('/recommendations', { session_id: sessionId, limit }),
    enabled: !!sessionId,
    staleTime: 0, // Always refetch after mutation
  });
};

// PCA or raw attribute scatter data
export const usePCA = (
  attributes?: string[],
  mode: 'pca' | 'raw' = 'raw',
  outliers: boolean = false
) => {
  return useQuery<PCAResponse>({
    queryKey: queryKeys.pca(attributes, mode, outliers),
    queryFn: () =>
      apiClient.get<PCAResponse>('/pca', {
        attributes: attributes?.join(','),
        mode,
        filter_outliers: outliers,
      }),
    // The backend will compute PCA on available features if no attributes are passed.
    enabled: true,
    staleTime: 5 * 60 * 1000,
  });
};

// Explainability - feature contributions
export const useExplainability = (sessionId: string, apartmentIds?: string[]) => {
  return useQuery<ExplainabilityResponse>({
    queryKey: queryKeys.explainability(sessionId, apartmentIds),
    queryFn: () =>
      apiClient.get<ExplainabilityResponse>('/explainability', {
        session_id: sessionId,
        apartment_ids: apartmentIds?.join(','),
      }),
    enabled: !!sessionId && apartmentIds !== undefined && apartmentIds.length > 0,
    staleTime: 0,
  });
};

// Clusters for map visualization
export const useClusters = () => {
  return useQuery<ClustersResponse>({
    queryKey: queryKeys.clusters(),
    queryFn: () => apiClient.get<ClustersResponse>('/clusters'),
    staleTime: 10 * 60 * 1000,
  });
};

// Initial sample for calibration (cold start)
export const useInitialSample = () => {
  return useQuery<InitialSampleResponse>({
    queryKey: queryKeys.initialSample(),
    queryFn: () => apiClient.get<InitialSampleResponse>('/initial-sample'),
    staleTime: Infinity, // Only fetch once per session
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

      // Force a fresh recommendation pull so list + color encodings stay in sync after every rating.
      await queryClient.invalidateQueries({ predicate: (q) => isRecommendationsQuery(q.queryKey) });
      await queryClient.refetchQueries({ predicate: (q) => isRecommendationsQuery(q.queryKey), type: 'active' });

      // Refresh explainability panels for the same session (covers selected + top-N ids).
      await queryClient.invalidateQueries({ predicate: (q) => isExplainabilityQuery(q.queryKey) });
      await queryClient.refetchQueries({ predicate: (q) => isExplainabilityQuery(q.queryKey), type: 'active' });
    },
    onError: (error) => {
      console.error('Rating submission failed:', error);
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
