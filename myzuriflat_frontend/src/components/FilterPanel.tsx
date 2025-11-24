/**
 * FilterPanel component
 * Provides filtering controls for apartments (T5 - Explore)
 */

import { useState, useEffect, useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useFilterOptions } from '../api/hooks';
import './FilterPanel.css';

interface FilterPanelProps {
  collapsed?: boolean;
}

export const FilterPanel = ({ collapsed: initialCollapsed = false }: FilterPanelProps) => {
  const { filters, setFilters, resetFilters, activeFilterFields, addFilterField, removeFilterField } = useAppStore();
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  // Local state for controlled inputs with debouncing
  // Local numeric input state mapping field-> {min,max}
  const [numericLocal, setNumericLocal] = useState<Record<string, { min?: string; max?: string }>>({
    price: { min: filters.price_min?.toString() || '', max: filters.price_max?.toString() || '' },
    accommodates: { min: (filters as any).accommodates_min?.toString() || '', max: (filters as any).accommodates_max?.toString() || '' },
    minimum_nights: { min: (filters as any).minimum_nights_min?.toString() || '', max: (filters as any).minimum_nights_max?.toString() || '' },
    distance_from_city_center: { max: (filters as any).distance_from_city_center_max?.toString() || '' },
  });

  // Debounce filter updates
  useEffect(() => {
    const timer = setTimeout(() => {
      const upd: Record<string, any> = {};
      Object.entries(numericLocal).forEach(([field, range]) => {
        if (range.min) upd[`${field}_min`] = parseFloat(range.min);
        else upd[`${field}_min`] = undefined;
        if (range.max) upd[`${field}_max`] = parseFloat(range.max);
        else upd[`${field}_max`] = undefined;
      });
      // Special case distance: only max side
      if (numericLocal.distance_from_city_center?.max) {
        upd['distance_from_city_center_max'] = parseFloat(numericLocal.distance_from_city_center.max);
      } else {
        upd['distance_from_city_center_max'] = undefined;
      }
      setFilters(upd);
    }, 500);
    return () => clearTimeout(timer);
  }, [numericLocal, setFilters]);

  const handleReset = () => {
    resetFilters();
    setNumericLocal({});
  };

  const numericFieldsMeta: Record<string, { label: string; singleMax?: boolean }> = {
    price: { label: 'Price (CHF)' },
    accommodates: { label: 'Accommodates' },
    minimum_nights: { label: 'Minimum Nights' },
    distance_from_city_center: { label: 'Distance to Center (km)', singleMax: true },
    bedrooms: { label: 'Bedrooms' },
    bathrooms: { label: 'Bathrooms' },
    beds: { label: 'Beds' },
    maximum_nights: { label: 'Maximum Nights' },
    availability_365: { label: 'Availability (days/year)' },
    number_of_reviews: { label: 'Number of Reviews' },
  };

  const { data: filterOpts } = useFilterOptions();
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
              const state = numericLocal[field] || {};
              return (
                <div className="filter-group" key={field}>
                  <div className="filter-group-header">
                    <label className="filter-label">{meta.label}</label>
                    <button
                      type="button"
                      className="remove-filter-btn"
                      onClick={() => {
                        removeFilterField(field);
                        setNumericLocal(prev => {
                          const copy = { ...prev };
                          delete copy[field];
                          return copy;
                        });
                      }}
                      aria-label={`Remove filter ${meta.label}`}
                    >✕</button>
                  </div>
                  <div className="filter-range">
                    {!meta.singleMax && (
                      <input
                        type="number"
                        className="filter-input"
                        placeholder="Min"
                        value={state.min || ''}
                        onChange={(e) => setNumericLocal((prev) => ({
                          ...prev,
                          [field]: { ...prev[field], min: e.target.value },
                        }))}
                      />
                    )}
                    {!meta.singleMax && <span className="range-separator">—</span>}
                    <input
                      type="number"
                      className="filter-input"
                      placeholder={meta.singleMax ? 'Max' : 'Max'}
                      value={state.max || ''}
                      onChange={(e) => setNumericLocal((prev) => ({
                        ...prev,
                        [field]: { ...prev[field], max: e.target.value },
                      }))}
                    />
                  </div>
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
