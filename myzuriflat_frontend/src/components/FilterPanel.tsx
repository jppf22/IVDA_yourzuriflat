/**
 * FilterPanel component
 * Provides filtering controls for apartments (T5 - Explore)
 */

import { useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import './FilterPanel.css';

interface FilterPanelProps {
  collapsed?: boolean;
}

export const FilterPanel = ({ collapsed: initialCollapsed = false }: FilterPanelProps) => {
  const { filters, setFilters, resetFilters } = useAppStore();
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  // Local state for controlled inputs with debouncing
  const [localPriceMin, setLocalPriceMin] = useState(filters.price_min?.toString() || '');
  const [localPriceMax, setLocalPriceMax] = useState(filters.price_max?.toString() || '');
  const [localDistanceMax, setLocalDistanceMax] = useState(
    filters.distance_max?.toString() || ''
  );

  // Debounce filter updates
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters({
        price_min: localPriceMin ? parseFloat(localPriceMin) : undefined,
        price_max: localPriceMax ? parseFloat(localPriceMax) : undefined,
        distance_max: localDistanceMax ? parseFloat(localDistanceMax) : undefined,
      });
    }, 500);

    return () => clearTimeout(timer);
  }, [localPriceMin, localPriceMax, localDistanceMax, setFilters]);

  const handleReset = () => {
    resetFilters();
    setLocalPriceMin('');
    setLocalPriceMax('');
    setLocalDistanceMax('');
  };

  return (
    <div className={`filter-panel ${collapsed ? 'collapsed' : 'expanded'}`}>
      <div className="filter-panel-header">
        <h3>Filters</h3>
        <button
          className="collapse-toggle"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? 'Expand filters' : 'Collapse filters'}
        >
          {collapsed ? '▼' : '▲'}
        </button>
      </div>

      {!collapsed && (
        <div className="filter-panel-content">
          {/* Price Range */}
          <div className="filter-group">
            <label className="filter-label">Price Range (CHF)</label>
            <div className="filter-range">
              <input
                type="number"
                className="filter-input"
                placeholder="Min"
                value={localPriceMin}
                onChange={(e) => setLocalPriceMin(e.target.value)}
                min="0"
              />
              <span className="range-separator">—</span>
              <input
                type="number"
                className="filter-input"
                placeholder="Max"
                value={localPriceMax}
                onChange={(e) => setLocalPriceMax(e.target.value)}
                min="0"
              />
            </div>
          </div>

          {/* Distance from Center */}
          <div className="filter-group">
            <label className="filter-label">Max Distance from Center (km)</label>
            <input
              type="number"
              className="filter-input"
              placeholder="e.g., 5"
              value={localDistanceMax}
              onChange={(e) => setLocalDistanceMax(e.target.value)}
              min="0"
              step="0.1"
            />
          </div>

          {/* Room Type */}
          <div className="filter-group">
            <label className="filter-label">Room Type</label>
            <div className="filter-checkboxes">
              {['Entire home/apt', 'Private room', 'Shared room', 'Hotel room'].map((type) => (
                <label key={type} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={filters.room_types?.includes(type) || false}
                    onChange={(e) => {
                      const currentTypes = filters.room_types || [];
                      const newTypes = e.target.checked
                        ? [...currentTypes, type]
                        : currentTypes.filter((t) => t !== type);
                      setFilters({
                        room_types: newTypes.length > 0 ? newTypes : undefined,
                      });
                    }}
                  />
                  <span>{type}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Minimum Reviews */}
          <div className="filter-group">
            <label className="filter-label">Minimum Reviews</label>
            <input
              type="number"
              className="filter-input"
              placeholder="e.g., 5"
              value={filters.min_reviews || ''}
              onChange={(e) =>
                setFilters({
                  min_reviews: e.target.value ? parseInt(e.target.value) : undefined,
                })
              }
              min="0"
            />
          </div>

          {/* Minimum Availability */}
          <div className="filter-group">
            <label className="filter-label">Minimum Availability (days/year)</label>
            <input
              type="number"
              className="filter-input"
              placeholder="e.g., 30"
              value={filters.availability_min || ''}
              onChange={(e) =>
                setFilters({
                  availability_min: e.target.value ? parseInt(e.target.value) : undefined,
                })
              }
              min="0"
              max="365"
            />
          </div>

          {/* Reset Button */}
          <button className="reset-filters-button" onClick={handleReset}>
            Reset All Filters
          </button>
        </div>
      )}
    </div>
  );
};

export default FilterPanel;
