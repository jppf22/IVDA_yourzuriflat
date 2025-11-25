/**
 * TypeScript interfaces matching backend Pydantic schemas
 * Keep in sync with backend/app/schemas/
 */

// Apartment data structure
export interface Apartment {
  // Core identification
  id: string; // always coerced to string to avoid precision loss
  name: string;
  // Host details
  host_id: number | string;
  host_name: string | null;
  picture_url?: string | null;
  // Location (cleaned naming plus legacy access)
  neighbourhood_group?: string; // original column
  neighbourhood?: string; // original column
  neighbourhood_group_cleansed?: string; // alias provided by backend
  neighbourhood_cleansed?: string; // alias provided by backend
  latitude: number;
  longitude: number;
  // Property characteristics
  property_type: string;
  room_type: string;
  accommodates: number;
  bathrooms: number;
  bedrooms: number;
  beds: number;
  // Raw amenities string parsed client-side into array
  amenities: string | string[];
  // Pricing & stay constraints
  price: number;
  minimum_nights: number;
  maximum_nights: number;
  // Review information (informational only, not used in recommendations)
  number_of_reviews?: number;
  last_review?: string;
  first_review?: string;
  reviews_per_month?: number;
  review_scores_rating?: number;
  review_scores_accuracy?: number;
  review_scores_cleanliness?: number;
  review_scores_checkin?: number;
  review_scores_communication?: number;
  review_scores_location?: number;
  review_scores_value?: number;
  // Existing legacy / additional metrics (may not be present in cleaned JSON)
  calculated_host_listings_count?: number;
  availability_365?: number;
  distance_from_center?: number; // old naming retained if present
  distance_from_city_center?: number; // new naming from cleaned dataset
  // Any additional engineered features will be allowed
  [key: string]: unknown;
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
  removed_count?: number;
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

// Recommendations within a subset
export interface RecommendationInSubset {
  apartment: Apartment;
  predicted_score: number;
  rank: number; // 1-indexed global ranking
}

export interface RecommendationsSubsetResponse {
  recommendations_in_subset: RecommendationInSubset[];
  session_id: string;
  model_trained: boolean;
  total_in_subset: number;
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
// Explainability (backend provides coefficients + per-apartment numeric contributions)
export interface ExplainabilityCoefficients {
  coef: number[];
  intercept: number;
  feature_names: string[];
}

export interface ApartmentContributions {
  apartment_id: string; // Changed from number to string to preserve precision
  predicted_score: number;
  contributions: number[]; // numeric array aligned with feature_names
}

export interface ExplainabilityResponse {
  coefficients: ExplainabilityCoefficients;
  contributions: ApartmentContributions[];
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

// Filter options for dynamic categorical selection
export interface FilterOptionsResponse {
  room_types: string[];
  property_types: string[];
  neighbourhoods: string[];
  neighbourhood_groups: string[];
}

// Numeric field distribution for visualizing range sliders
export interface NumericDistribution {
  min: number;
  max: number;
  histogram: number[];
  bin_edges: number[];
  log_scale?: boolean;
}

export interface NumericDistributionsResponse {
  [field: string]: NumericDistribution;
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
  // Extended dynamic numeric filters
  accommodates_min?: number;
  accommodates_max?: number;
  bedrooms_min?: number;
  bedrooms_max?: number;
  bathrooms_min?: number;
  bathrooms_max?: number;
  beds_min?: number;
  beds_max?: number;
  minimum_nights_min?: number;
  minimum_nights_max?: number;
  maximum_nights_min?: number;
  maximum_nights_max?: number;
  distance_from_city_center_max?: number;
  price_per_person_max?: number; // example engineered filter if needed
  availability_365_min?: number;
  number_of_reviews_min?: number;
  reviews_per_month_min?: number;
  // Extended categorical filters
  property_types?: string[];
  neighbourhood_groups?: string[];
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
