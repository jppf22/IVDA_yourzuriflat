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
export const formatNumber = (num: number | null | undefined): string => {
  if (num === null || num === undefined) return 'N/A';
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

// Parse amenities field which may arrive as a JSON-like string list
export const parseAmenities = (amenities: string | string[] | undefined): string[] => {
  if (!amenities) return [];
  if (Array.isArray(amenities)) return amenities;
  const trimmed = amenities.trim();
  // Attempt JSON parse; fall back to naive split
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      // ignore and fall through
    }
  }
  // Split on comma, strip quotes
  return trimmed
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map((s) => s.replace(/^[\s\"']+|[\s\"']+$/g, ''))
    .filter((s) => s.length > 0);
};

// Format amenities nicely (limit list length with optional cap)
export const formatAmenities = (amenities: string[] , cap: number = 12): string => {
  if (amenities.length === 0) return 'None';
  const shown = amenities.slice(0, cap).join(', ');
  return amenities.length > cap ? `${shown}, …` : shown;
};
