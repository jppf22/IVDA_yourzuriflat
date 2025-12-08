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

  // Bookmarked apartments
  bookmarkedApartmentIds: string[];
  toggleBookmark: (id: string) => void;
  clearBookmarks: () => void;

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

  // User ratings (persisted locally)
  userRatings: Record<string, number>;
  setUserRating: (apartmentId: string, rating: number) => void;
  removeUserRating: (apartmentId: string) => void;
  clearAllRatings: () => void;

  // Sync state (backend synchronization)
  isSyncing: boolean;
  setIsSyncing: (syncing: boolean) => void;
  syncComplete: boolean;
  setSyncComplete: (complete: boolean) => void;

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

  // Map expansion state
  isMapExpanded: boolean;
  toggleMapExpanded: () => void;
  setMapExpanded: (expanded: boolean) => void;

  // UMAP expansion state
  isUMAPExpanded: boolean;
  toggleUMAPExpanded: () => void;
  setUMAPExpanded: (expanded: boolean) => void;
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

  // Bookmarked apartments
  bookmarkedApartmentIds: [],
  toggleBookmark: (id) => set((state) => {
    const isBookmarked = state.bookmarkedApartmentIds.includes(id);
    return {
      bookmarkedApartmentIds: isBookmarked
        ? state.bookmarkedApartmentIds.filter((aptId) => aptId !== id)
        : [...state.bookmarkedApartmentIds, id],
    };
  }),
  clearBookmarks: () => set({ bookmarkedApartmentIds: [] }),

  // Top recommendations
  topRecommendations: [],
  setTopRecommendations: (apartments) => set({ topRecommendations: apartments }),

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

  // User ratings
  userRatings: {},
  setUserRating: (apartmentId, rating) =>
    set((state) => ({
      userRatings: { ...state.userRatings, [apartmentId]: rating },
      ratingsCount: Object.keys({ ...state.userRatings, [apartmentId]: rating }).length,
    })),
  removeUserRating: (apartmentId) =>
    set((state) => {
      const newRatings = { ...state.userRatings };
      delete newRatings[apartmentId];
      return {
        userRatings: newRatings,
        ratingsCount: Object.keys(newRatings).length,
      };
    }),
  clearAllRatings: () => set({ userRatings: {}, ratingsCount: 0, calibrationComplete: false }),

  // Sync state (not persisted - resets on page load)
  isSyncing: false,
  setIsSyncing: (syncing) => set({ isSyncing: syncing }),
  syncComplete: false, // Will be set to true after first sync
  setSyncComplete: (complete) => set({ syncComplete: complete }),

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
  // Map expansion
  isMapExpanded: false,
  toggleMapExpanded: () => set((state) => ({ isMapExpanded: !state.isMapExpanded })),
  setMapExpanded: (expanded) => set({ isMapExpanded: expanded }),

  isUMAPExpanded: false,
  toggleUMAPExpanded: () => set((state) => ({ isUMAPExpanded: !state.isUMAPExpanded })),
  setUMAPExpanded: (expanded) => set({ isUMAPExpanded: expanded }),

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
      amenities: ['amenities'],
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
      name: 'yourZuriFlatStore',
      version: 2,
      partialize: (state) => ({
        // Session persistence
        sessionId: state.sessionId,
        // Ratings persistence
        userRatings: state.userRatings,
        ratingsCount: state.ratingsCount,
        calibrationComplete: state.calibrationComplete,
        // Bookmarks persistence
        bookmarkedApartmentIds: state.bookmarkedApartmentIds,
        // Star chart preferences
        starAttributes: state.starAttributes,
        starAttributesVersion: state.starAttributesVersion,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Recalculate ratingsCount from userRatings to ensure sync
          if (state.userRatings) {
            state.ratingsCount = Object.keys(state.userRatings).length;
          }
          if (state.starAttributesVersion !== 1) {
            // future migration logic placeholder
          }
        }
      },
    }
  )
);

export default useAppStore;
