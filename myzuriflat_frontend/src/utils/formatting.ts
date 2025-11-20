/**
 * Formatting utilities for consistent data display
 */

// Format price in CHF
export const formatPrice = (price: number): string => {
  return `CHF ${price.toFixed(0)}`;
};

// Format distance in kilometers
export const formatDistance = (distance: number): string => {
  return `${distance.toFixed(2)} km`;
};

// Format number with comma separators
export const formatNumber = (num: number): string => {
  return num.toLocaleString('en-US');
};

// Format percentage
export const formatPercent = (value: number): string => {
  return `${(value * 100).toFixed(1)}%`;
};

// Format date
export const formatDate = (dateString?: string): string => {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

// Truncate text with ellipsis
export const truncate = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
};

// Format room type for display
export const formatRoomType = (roomType: string): string => {
  return roomType
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

// Format attribute name for display
export const formatAttributeName = (attr: string): string => {
  return attr
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

// Round to decimal places
export const round = (value: number, decimals: number = 2): number => {
  return Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals);
};

// Format score (0-10 or 0-5 depending on scale)
export const formatScore = (score: number, maxScore: number = 10): string => {
  return `${score.toFixed(1)}/${maxScore}`;
};

// Get a readable label for neighbourhood
export const formatNeighbourhood = (neighbourhood: string): string => {
  return neighbourhood || 'Unknown';
};
