/**
 * TypeScript interfaces matching backend Pydantic schemas
 * Keep in sync with backend/app/schemas/
 */

// Apartment data structure
export interface Apartment {
  id: string;
  name: string;
  host_id: string;
  host_name: string;
  neighbourhood: string;
  latitude: number;
  longitude: number;
  room_type: string;
  price: number;
  minimum_nights: number;
  number_of_reviews: number;
  last_review?: string;
  reviews_per_month?: number;
  calculated_host_listings_count: number;
  availability_365: number;
  distance_from_center: number;
  // Additional preprocessed attributes may be included
}

// Rating request/response
export interface Rating {
  apartment_id: string;
  rating: number;
  session_id: string;
}

export interface RatingRequest {
  session_id: string;
  apartment_id: string;
  rating: number;
}

export interface RatingResponse {
  success: boolean;
  message: string;
  ratings_count: number;
}

// Recommendations
export interface Recommendation {
  apartment: Apartment;
  predicted_score: number;
}

export interface RecommendationsResponse {
  recommendations: Recommendation[];
  session_id: string;
  model_trained: boolean;
}

// PCA response
export interface PCAPoint {
  apartment_id: string;
  x: number;
  y: number;
  apartment: Apartment;
}

export interface PCAResponse {
  points: PCAPoint[];
  x_label: string;
  y_label: string;
  explained_variance?: number[];
  mode: 'pca' | 'raw';
}

// Explainability
export interface FeatureContribution {
  feature_name: string;
  contribution: number;
  coefficient: number;
  normalized_value: number;
}

export interface ApartmentExplanation {
  apartment_id: string;
  apartment: Apartment;
  predicted_score: number;
  intercept: number;
  contributions: FeatureContribution[];
}

export interface ExplainabilityResponse {
  explanations: ApartmentExplanation[];
  session_id: string;
}

// Clustering
export interface ClusterInfo {
  apartment_id: string;
  cluster_id: number;
  apartment: Apartment;
}

export interface ClusterCentroid {
  cluster_id: number;
  latitude: number;
  longitude: number;
  size: number;
}

export interface ClustersResponse {
  clusters: ClusterInfo[];
  centroids: ClusterCentroid[];
}

// Initial sample for calibration
export interface InitialSampleResponse {
  apartments: Apartment[];
  sample_size: number;
}

// Filters for apartment queries
export interface ApartmentFilters {
  price_min?: number;
  price_max?: number;
  room_types?: string[];
  neighbourhoods?: string[];
  distance_max?: number;
  min_reviews?: number;
  availability_min?: number;
}

// Query parameters for apartments endpoint
export interface ApartmentsQueryParams extends ApartmentFilters {
  page?: number;
  limit?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

export interface ApartmentsResponse {
  apartments: Apartment[];
  total: number;
  page: number;
  limit: number;
}
