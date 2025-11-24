/**
 * Zustand store for global UI state
 * Manages selected apartments, filters, brush selections, and top-N recommendations
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
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

  // Selected cluster (for filtering apartments by cluster)
  selectedClusterId: number | null;
  setSelectedClusterId: (clusterId: number | null) => void;
  clearClusterFilter: () => void;

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

  // Star (radar) chart dynamic attributes
  starAttributes: string[];
  setStarAttributes: (attrs: string[]) => void;
  toggleStarAttribute: (attr: string) => void;
  resetStarAttributes: () => void;
  starAttributesVersion: number; // for future migrations

  // Dynamic filter fields UI
  activeFilterFields: string[]; // underlying data field names, not *_min/_max suffixes
  addFilterField: (field: string) => void;
  removeFilterField: (field: string) => void;
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

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
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

  // Selected cluster
  selectedClusterId: null,
  setSelectedClusterId: (clusterId) => set({ selectedClusterId: clusterId }),
  clearClusterFilter: () => set({ selectedClusterId: null }),

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
  pcaAttributes: ['price', 'distance_from_city_center'],
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

  // Star chart attributes (persisted)
  starAttributesVersion: 1,
  starAttributes: [
    'minimum_nights',
    'accommodates',
    'price',
    'distance_from_city_center',
  ],
  setStarAttributes: (attrs) =>
    set({ starAttributes: attrs.slice(0, 7) }),
  toggleStarAttribute: (attr) => {
    const current = get().starAttributes;
    if (current.includes(attr)) {
      set({ starAttributes: current.filter((a) => a !== attr) });
    } else if (current.length < 7) {
      set({ starAttributes: [...current, attr] });
    }
  },
  resetStarAttributes: () =>
    set({
      starAttributes: [
        'minimum_nights',
        'accommodates',
        'price',
        'distance_from_city_center',
      ],
    }),
  // Dynamic filter fields
  activeFilterFields: ['minimum_nights','accommodates','price','distance_from_city_center'],
  addFilterField: (field: string) => set((state) => (
    state.activeFilterFields.includes(field)
      ? state
      : { activeFilterFields: [...state.activeFilterFields, field] }
  )),
  removeFilterField: (field: string) => set((state) => {
    // Map base field names to filter keys that should be cleared
    const numericMap: Record<string, string[]> = {
      price: ['price_min','price_max'],
      accommodates: ['accommodates_min','accommodates_max'],
      minimum_nights: ['minimum_nights_min','minimum_nights_max'],
      distance_from_city_center: ['distance_from_city_center_max','distance_max'], // legacy + current
      bedrooms: ['bedrooms_min','bedrooms_max'],
      bathrooms: ['bathrooms_min','bathrooms_max'],
      beds: ['beds_min','beds_max'],
      maximum_nights: ['maximum_nights_min','maximum_nights_max'],
      availability_365: ['availability_365_min'],
      number_of_reviews: ['number_of_reviews_min'],
      reviews_per_month: ['reviews_per_month_min'],
    };
    const categoricalMap: Record<string,string[]> = {
      room_type: ['room_types'],
      property_type: ['property_types'],
      neighbourhood_cleansed: ['neighbourhoods'],
      neighbourhood_group_cleansed: ['neighbourhood_groups'],
    };
    const clearKeys = [
      ...(numericMap[field] || []),
      ...(categoricalMap[field] || []),
    ];
    const newFilters = { ...state.filters } as Record<string, unknown>;
    clearKeys.forEach(k => { if (k in newFilters) newFilters[k] = undefined; });
    return {
      activeFilterFields: state.activeFilterFields.filter(f => f !== field),
      filters: newFilters as ApartmentFilters,
    };
  }),
    }),
    {
      name: 'starChartPrefs',
      version: 1,
      partialize: (state) => ({
        starAttributes: state.starAttributes,
        starAttributesVersion: state.starAttributesVersion,
      }),
      onRehydrateStorage: () => (state) => {
        if (state && state.starAttributesVersion !== 1) {
          // future migration logic placeholder
        }
      },
    }
  )
);

export default useAppStore;
