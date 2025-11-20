/**
 * Color utilities for consistent visualization styling
 * Provides color schemes for top 5 recommendations and general use
 */

// Top 5 color palette - distinct colors for recommendations
export const TOP_COLORS = [
  '#e41a1c', // Red
  '#377eb8', // Blue
  '#4daf4a', // Green
  '#ff7f00', // Orange
  '#984ea3', // Purple
];

// Get color for apartment based on its rank in top 5
export const getTopColor = (rank: number): string => {
  if (rank < 0 || rank >= TOP_COLORS.length) {
    return '#999999'; // Gray for non-top-5
  }
  return TOP_COLORS[rank];
};

// Get color by apartment ID if it's in the top recommendations
export const getColorForApartment = (
  apartmentId: string,
  topRecommendationIds: string[]
): string => {
  const index = topRecommendationIds.indexOf(apartmentId);
  return getTopColor(index);
};

// Check if apartment is in top 5
export const isTopRecommendation = (
  apartmentId: string,
  topRecommendationIds: string[]
): boolean => {
  return topRecommendationIds.includes(apartmentId);
};

// Cluster colors for map visualization
export const CLUSTER_COLORS = [
  '#8dd3c7',
  '#ffffb3',
  '#bebada',
  '#fb8072',
  '#80b1d3',
  '#fdb462',
  '#b3de69',
  '#fccde5',
];

export const getClusterColor = (clusterId: number): string => {
  return CLUSTER_COLORS[clusterId % CLUSTER_COLORS.length];
};

// Selection and brushing colors
export const SELECTION_COLOR = '#f39c12';
export const BRUSHED_COLOR = '#3498db';
export const HOVER_COLOR = '#e67e22';

// Opacity values
export const OPACITY = {
  normal: 0.7,
  selected: 1.0,
  brushed: 0.9,
  dimmed: 0.3,
  hover: 0.85,
};

// Feature contribution colors (for explainability)
export const CONTRIBUTION_COLORS = {
  positive: '#27ae60',
  negative: '#e74c3c',
  neutral: '#95a5a6',
};
