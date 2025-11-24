/**
 * FilterPanel component
 * Provides filtering controls for apartments (T5 - Explore)
 */

import { useState, useEffect, useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useFilterOptions, useNumericDistributions } from '../api/hooks';
import { RangeSlider } from './RangeSlider';
import './FilterPanel.css';

interface FilterPanelProps {
  collapsed?: boolean;
}

export const FilterPanel = ({ collapsed: initialCollapsed = false }: FilterPanelProps) => {
  const { filters, setFilters, resetFilters, activeFilterFields, addFilterField, removeFilterField } = useAppStore();
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  const { data: filterOpts } = useFilterOptions();
  const { data: distributions } = useNumericDistributions();

  // Local state for range sliders (no debouncing needed, updated on mouse release)
  const handleRangeChange = (field: string, value: [number, number], singleMax: boolean = false) => {
    const upd: Record<string, any> = {};
    if (singleMax) {
      upd[`${field}_max`] = value[1];
    } else {
      upd[`${field}_min`] = value[0];
      upd[`${field}_max`] = value[1];
    }
    setFilters(upd);
  };

  const handleReset = () => {
    resetFilters();
  };

  const numericFieldsMeta: Record<string, { label: string; singleMax?: boolean; step?: number }> = {
    price: { label: 'Price (CHF)', step: 10 },
    accommodates: { label: 'Accommodates', step: 1 },
    minimum_nights: { label: 'Minimum Nights', step: 1 },
    distance_from_city_center: { label: 'Distance to Center (km)', singleMax: true, step: 0.1 },
    bedrooms: { label: 'Bedrooms', step: 1 },
    bathrooms: { label: 'Bathrooms', step: 0.5 },
    beds: { label: 'Beds', step: 1 },
    maximum_nights: { label: 'Maximum Nights', step: 10 },
    availability_365: { label: 'Availability (days/year)', step: 10 },
    number_of_reviews: { label: 'Number of Reviews', step: 10 },
  };

  const categoricalFieldsMeta: Record<string, { label: string; options: string[] }> = {
    room_type: { label: 'Room Type', options: filterOpts?.room_types || [] },
    property_type: { label: 'Property Type', options: filterOpts?.property_types || [] },
    neighbourhood_cleansed: { label: 'Neighbourhood', options: filterOpts?.neighbourhoods || [] },
    neighbourhood_group_cleansed: { label: 'Neighbourhood Group', options: filterOpts?.neighbourhood_groups || [] },
  };

  const candidateFields = useMemo(() => {
    const all = [
      ...Object.keys(numericFieldsMeta),
      ...Object.keys(categoricalFieldsMeta),
    ];
    return all.filter((f) => !activeFilterFields.includes(f));
  }, [activeFilterFields]);

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
          {/* Dynamic active fields */}
          {activeFilterFields.map((field) => {
            if (numericFieldsMeta[field]) {
              const meta = numericFieldsMeta[field];
              const dist = distributions?.[field];
              
              if (!dist) return null; // Skip if no distribution data yet
              
              const currentMin = (filters as any)[`${field}_min`] ?? dist.min;
              const currentMax = (filters as any)[`${field}_max`] ?? dist.max;
              
              return (
                <div className="filter-group" key={field}>
                  <div className="filter-group-header">
                    <label className="filter-label">{meta.label}</label>
                    <button
                      type="button"
                      className="remove-filter-btn"
                      onClick={() => {
                        removeFilterField(field);
                        // Clear filter values
                        setFilters({
                          [`${field}_min`]: undefined,
                          [`${field}_max`]: undefined,
                        } as any);
                      }}
                      aria-label={`Remove filter ${meta.label}`}
                    >✕</button>
                  </div>
                  <RangeSlider
                    min={dist.min}
                    max={dist.max}
                    value={[currentMin, currentMax]}
                    onChange={(value) => handleRangeChange(field, value, meta.singleMax)}
                    histogram={dist.histogram}
                    step={meta.step || 1}
                    singleMax={meta.singleMax}
                  />
                </div>
              );
            }
            if (categoricalFieldsMeta[field]) {
              const meta = categoricalFieldsMeta[field];
              const keyMap: Record<string, string> = {
                room_type: 'room_types',
                property_type: 'property_types',
                neighbourhood_cleansed: 'neighbourhoods',
                neighbourhood_group_cleansed: 'neighbourhood_groups',
              };
              const storeKey = keyMap[field];
              const currentValues = (filters as any)[storeKey] || [];
              return (
                <div className="filter-group" key={field}>
                  <div className="filter-group-header">
                    <label className="filter-label">{meta.label}</label>
                    <button
                      type="button"
                      className="remove-filter-btn"
                      onClick={() => {
                        removeFilterField(field);
                      }}
                      aria-label={`Remove filter ${meta.label}`}
                    >✕</button>
                  </div>
                  <div className="filter-checkboxes">
                    {meta.options.map((opt) => (
                      <label key={opt} className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={currentValues.includes(opt)}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...currentValues, opt]
                              : currentValues.filter((v: string) => v !== opt);
                            setFilters({ [storeKey]: next.length ? next : undefined } as any);
                          }}
                        />
                        <span>{opt}</span>
                      </label>
                    ))}
                    {meta.options.length === 0 && <div style={{fontSize:'0.75rem',color:'#666'}}>No options loaded</div>}
                  </div>
                </div>
              );
            }
            return null;
          })}

          {/* Add Filter Dropdown */}
          {candidateFields.length > 0 && (
            <div className="filter-group add-filter-group">
              <label className="filter-label">Add Filter</label>
              <select
                className="filter-input"
                value=""
                onChange={(e) => {
                  const val = e.target.value;
                  if (val) {
                    addFilterField(val);
                    e.target.value = '';
                  }
                }}
              >
                <option value="" disabled>Select field…</option>
                {candidateFields.map((f) => (
                  <option key={f} value={f}>{numericFieldsMeta[f]?.label || categoricalFieldsMeta[f]?.label || f}</option>
                ))}
              </select>
            </div>
          )}

          {/* Reset Button */}
          <button className="reset-filters-button" onClick={handleReset}>
            Clear Values
          </button>
        </div>
      )}
    </div>
  );
};

export default FilterPanel;
