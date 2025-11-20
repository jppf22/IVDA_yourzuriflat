/**
 * Zustand store for global UI state
 * Manages selected apartments, filters, brush selections, and top-N recommendations
 */

import { create } from 'zustand';
import type { Apartment, ApartmentFilters } from '../api/types';

export interface AppState {
  // Session management
  sessionId: string;
  setSessionId: (id: string) => void;

  // Selected apartments (for detail view and comparison)
  selectedApartmentIds: string[];
  setSelectedApartmentIds: (ids: string[]) => void;
  toggleApartmentSelection: (id: string) => void;
  clearSelection: () => void;

  // Brushed apartments (from map or PCA lasso selection)
  brushedApartmentIds: string[];
  setBrushedApartmentIds: (ids: string[]) => void;
  clearBrushed: () => void;

  // Top N recommendations (for consistent color encoding)
  topRecommendations: Apartment[];
  setTopRecommendations: (apartments: Apartment[]) => void;

  // Filters
  filters: ApartmentFilters;
  setFilters: (filters: Partial<ApartmentFilters>) => void;
  resetFilters: () => void;

  // PCA view mode
  pcaMode: 'raw' | 'pca';
  setPcaMode: (mode: 'raw' | 'pca') => void;

  // PCA selected attributes
  pcaAttributes: string[];
  setPcaAttributes: (attributes: string[]) => void;

  // Outlier filtering
  filterOutliers: boolean;
  setFilterOutliers: (filter: boolean) => void;

  // Detail drawer state
  detailDrawerOpen: boolean;
  detailApartmentId: string | null;
  openDetailDrawer: (id: string) => void;
  closeDetailDrawer: () => void;

  // Calibration state
  calibrationComplete: boolean;
  setCalibrationComplete: (complete: boolean) => void;
  ratingsCount: number;
  setRatingsCount: (count: number) => void;
}

const defaultFilters: ApartmentFilters = {
  price_min: undefined,
  price_max: undefined,
  room_types: undefined,
  neighbourhoods: undefined,
  distance_max: undefined,
  min_reviews: undefined,
  availability_min: undefined,
};

// Generate a simple session ID (in production, this might come from backend)
const generateSessionId = (): string => {
  return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
};

export const useAppStore = create<AppState>((set) => ({
  // Session management
  sessionId: generateSessionId(),
  setSessionId: (id) => set({ sessionId: id }),

  // Selected apartments
  selectedApartmentIds: [],
  setSelectedApartmentIds: (ids) => set({ selectedApartmentIds: ids }),
  toggleApartmentSelection: (id) =>
    set((state) => {
      const isSelected = state.selectedApartmentIds.includes(id);
      if (isSelected) {
        return {
          selectedApartmentIds: state.selectedApartmentIds.filter((aptId) => aptId !== id),
        };
      } else {
        // Limit to 5 selections for comparison view
        const newSelection = [...state.selectedApartmentIds, id];
        return {
          selectedApartmentIds: newSelection.slice(-5),
        };
      }
    }),
  clearSelection: () => set({ selectedApartmentIds: [] }),

  // Brushed apartments
  brushedApartmentIds: [],
  setBrushedApartmentIds: (ids) => set({ brushedApartmentIds: ids }),
  clearBrushed: () => set({ brushedApartmentIds: [] }),

  // Top recommendations
  topRecommendations: [],
  setTopRecommendations: (apartments) => set({ topRecommendations: apartments.slice(0, 5) }),

  // Filters
  filters: defaultFilters,
  setFilters: (newFilters) =>
    set((state) => ({
      filters: { ...state.filters, ...newFilters },
    })),
  resetFilters: () => set({ filters: defaultFilters }),

  // PCA mode
  pcaMode: 'raw',
  setPcaMode: (mode) => set({ pcaMode: mode }),

  // PCA attributes
  pcaAttributes: ['price', 'distance_from_center'],
  setPcaAttributes: (attributes) => set({ pcaAttributes: attributes }),

  // Outlier filtering
  filterOutliers: false,
  setFilterOutliers: (filter) => set({ filterOutliers: filter }),

  // Detail drawer
  detailDrawerOpen: false,
  detailApartmentId: null,
  openDetailDrawer: (id) => set({ detailDrawerOpen: true, detailApartmentId: id }),
  closeDetailDrawer: () => set({ detailDrawerOpen: false, detailApartmentId: null }),

  // Calibration
  calibrationComplete: false,
  setCalibrationComplete: (complete) => set({ calibrationComplete: complete }),
  ratingsCount: 0,
  setRatingsCount: (count) => set({ ratingsCount: count }),
}));

export default useAppStore;
