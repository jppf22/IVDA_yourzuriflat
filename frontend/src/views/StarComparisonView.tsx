/**
 * Star Comparison View (T2 - Compare apartments by attributes)
 * Parallel coordinates chart comparing up to 5 apartments on multiple attributes
 */

import Plot from 'react-plotly.js';
import { useAppStore } from '../store/useAppStore';
import { getColorForApartment } from '../utils/colors';
import type { Data, Layout } from 'plotly.js';
import { useMemo, useState, useRef, useEffect } from 'react';
import type { Apartment } from '../api/types';
import './StarComparisonView.css';

// Base attributes always offered (extended dynamically with numeric fields from data)
const BASE_CANDIDATES: string[] = [
  'minimum_nights',
  'accommodates',
  'price',
  'distance_from_city_center',
  'beds',
  'bathrooms',
  'bedrooms',
  'amenities_count',
];

const DEFAULT_STAR_ATTRIBUTES: string[] = [
  'minimum_nights',
  'accommodates',
  'price',
  'distance_from_city_center',
];

// Human readable tooltip descriptions
const ATTRIBUTE_DESCRIPTIONS: Record<string, string> = {
  price: 'Listing price per night',
  accommodates: 'Max number of guests the listing can host',
  bedrooms: 'Number of separate bedrooms',
  bathrooms: 'Number of bathrooms',
  beds: 'Total number of beds',
  minimum_nights: 'Minimum nights required',
  amenities_count: 'Total count of amenities',
  distance_from_city_center: 'Distance to Zurich city center (km)',
  availability_365: 'Days available per year',
  maximum_nights: 'Maximum nights allowed',
};

// Derive a numeric value for each attribute
function deriveNumeric(apartment: Apartment | null | undefined, key: string): number {
  if (!apartment) return 0;
  if (key === 'amenities_count') {
    const raw = apartment.amenities;
    if (!raw) return 0;
    if (Array.isArray(raw)) return raw.length;
    const match = String(raw).match(/"[^"]+"/g);
    return match ? match.length : 0;
  }
  if (key === 'price') {
    const p = typeof apartment.price === 'number' ? apartment.price : parseFloat(String(apartment.price).replace(/[^0-9.]/g, ''));
    return isFinite(p) ? p : 0;
  }
  const v = apartment[key];
  return typeof v === 'number' && isFinite(v) ? v : 0;
}

export const StarComparisonView = () => {
  const { selectedApartmentIds, topRecommendations, starAttributes, setStarAttributes, openDetailDrawer } = useAppStore();
  
  // User-controlled limit for displayed apartments (default: 3)
  const [maxApartments, setMaxApartments] = useState(3);
  const [showLegend, setShowLegend] = useState(true);

  // Use selected apartments or top recommendations, limited by maxApartments
  const apartmentsToCompare =
    selectedApartmentIds.length > 0
      ? topRecommendations.filter((apt) => selectedApartmentIds.includes(apt.id)).slice(0, maxApartments)
      : topRecommendations.slice(0, maxApartments);

  const topRecommendationIds = topRecommendations.map((apt) => apt.id);

  // Active attributes (defaults from store)
  const attributes = useMemo(
    () => (starAttributes.length ? starAttributes : DEFAULT_STAR_ATTRIBUTES),
    [starAttributes]
  );

  const handleToggleAttribute = (attr: string) => {
    const current = starAttributes.length ? starAttributes : DEFAULT_STAR_ATTRIBUTES;
    const hasAttr = current.includes(attr);

    if (hasAttr) {
      const next = current.filter((a) => a !== attr);
      setStarAttributes(next);
    } else {
      const next = [...current, attr];
      // Respect the original 7-attribute limit from the store
      setStarAttributes(next.slice(0, 7));
    }
  };

  // Build list of dynamic attribute candidates from first available apartment
  const dynamicCandidates = useMemo(() => {
    const sample = topRecommendations[0] as Record<string, unknown> | undefined;
    if (!sample) return BASE_CANDIDATES;
    const exclude = new Set([
      'id',
      'name',
      'host_id',
      'host_name',
      'latitude',
      'longitude',
      'amenities',
      'picture_url',
    ]);
    const numericKeys = Object.keys(sample)
      .filter((k) => !exclude.has(k) && typeof sample[k] === 'number')
      .filter((k) => !BASE_CANDIDATES.includes(k));
    // Ensure amenities_count is present even if not in sample yet
    const merged = [...BASE_CANDIDATES, ...numericKeys];
    // Deduplicate preserving order
    return Array.from(new Set(merged));
  }, [topRecommendations]);

  // Build raw matrix with actual values for each attribute
  const rawMatrix = useMemo(
    () => attributes.map((attr) => apartmentsToCompare.map((apt) => deriveNumeric(apt, attr))),
    [attributes, apartmentsToCompare]
  );

  // Create parallel coordinates trace
  const traces: Data[] = useMemo(() => {
    if (apartmentsToCompare.length === 0 || attributes.length === 0) return [];

    // Map apartments to color indices for consistent coloring
    const colorIndices = apartmentsToCompare.map((apt, idx) => idx);
    const colorScale = apartmentsToCompare.map((apt, idx) => {
      const color = getColorForApartment(apt.id, topRecommendationIds);
      // Convert to normalized position [0,1] for colorscale
      const pos = apartmentsToCompare.length > 1 ? idx / (apartmentsToCompare.length - 1) : 0;
      return [pos, color];
    });

    // Build dimensions for parallel coordinates
    const dimensions = attributes.map((attr, attrIdx) => {
      const values = rawMatrix[attrIdx];
      const min = Math.min(...values);
      const max = Math.max(...values);
      
      return {
        label: attr,
        values: values,
        range: [min, max],
        tickformat: attr === 'price' ? '$.0f' : '.1f',
      };
    });

    // Single parcoords trace with all apartments
    return [{
      type: 'parcoords',
      line: {
        color: colorIndices,
        colorscale: colorScale,
        showscale: false,
      },
      dimensions: dimensions,
      // Store apartment names for hover
      customdata: apartmentsToCompare.map(apt => ({
        id: String(apt.id),
        name: apt.name || String(apt.id),
      })),
      hovertemplate: '<b>%{customdata.name}</b><extra></extra>',
    } as Data];
  }, [apartmentsToCompare, attributes, rawMatrix, topRecommendationIds]);

  // Ensure enough horizontal space for many attributes; enable horizontal scrolling
  const minPlotWidth = Math.max(attributes.length * 140, 600);

  const layout: Partial<Layout> = {
    margin: { t: 60, b: 40, l: 100, r: 100 },
    paper_bgcolor: 'white',
    plot_bgcolor: 'white',
    autosize: true,
  };

  // Attribute selection UI (parallel coordinates can handle more dimensions)
  const disabledAdd = attributes.length >= 10;
  if (apartmentsToCompare.length === 0) {
    return (
      <div className="star-comparison-view">
        <div className="comparison-header">
          <h3>Compare Attributes</h3>
        </div>
        <div className="empty-state">
          <p>Select apartments or rate some to see comparison</p>
        </div>
      </div>
    );
  }

  return (
    <div className="star-comparison-view">
      <div className="comparison-header">
        <div className="comparison-top">
          <div>
            <h3>Compare Attributes</h3>
            <p className="comparison-subtitle">Comparing {apartmentsToCompare.length} apartments</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <label htmlFor="max-apartments" style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                Show:
              </label>
              <select
                id="max-apartments"
                value={maxApartments}
                onChange={(e) => setMaxApartments(Number(e.target.value))}
                style={{
                  padding: '0.25rem',
                  fontSize: '0.8rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  background: 'white',
                  cursor: 'pointer',
                }}
              >
                <option value={3}>3 apartments</option>
                <option value={4}>4 apartments</option>
                <option value={5}>5 apartments</option>
              </select>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', color: '#6b7280', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={showLegend}
                onChange={(e) => setShowLegend(e.target.checked)}
                style={{ width: '14px', height: '14px' }}
              />
              Show legend
            </label>
          </div>
        </div>
        <div className='comparison-bottom'>
          <span className="comparison-subtitle">Attributes:</span>
          <div className="star-controls">
            <AttributeMultiSelect
              candidates={dynamicCandidates}
              selected={attributes}
              onToggle={handleToggleAttribute}
              disabledAdd={disabledAdd}
            />
          </div>
        </div>
        
      </div>
      <div className="chart-container">
        <div className="parcoords-scroll-container">
          <div style={{ minWidth: `${minPlotWidth}px`, height: '100%' }}>
            <Plot
              data={traces}
              layout={layout}
              config={{ displayModeBar: false, displaylogo: false }}
              style={{ width: '100%', height: '100%' }}
            />
          </div>
        </div>
        {showLegend && (
          <div className="parcoords-legend">
            {apartmentsToCompare.map((apt) => {
              const color = getColorForApartment(apt.id, topRecommendationIds);
              return (
                <div 
                  key={apt.id} 
                  className="legend-item"
                  onClick={() => openDetailDrawer(String(apt.id))}
                  style={{ cursor: 'pointer' }}
                  title="Click to view details"
                >
                  <div 
                    className="legend-color" 
                    style={{ backgroundColor: color }}
                  />
                  <span className="legend-label">{apt.name ? apt.name.substring(0, 40) : String(apt.id)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default StarComparisonView;

interface AttributeMultiSelectProps {
  candidates: string[];
  selected: string[];
  onToggle: (attr: string) => void;
  disabledAdd: boolean;
}

const AttributeMultiSelect = ({ candidates, selected, onToggle, disabledAdd }: AttributeMultiSelectProps) => {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filtered = useMemo(
    () => candidates.filter((c) => c.toLowerCase().includes(filter.toLowerCase())),
    [candidates, filter]
  );

  return (
    <div className="attr-multiselect" ref={containerRef}>
      <div className="selected-tags" onClick={() => setOpen((o) => !o)} role="button" aria-expanded={open}>
        {selected.length === 0 && <span className="placeholder">Select attributes…</span>}
        {selected.map((s) => (
          <span key={s} className="tag" title={ATTRIBUTE_DESCRIPTIONS[s] || s}>{s}</span>
        ))}
        <span className="toggle-button" aria-label="Toggle attribute menu">{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div className="dropdown-panel">
          <input
            type="text"
            className="attr-filter"
            placeholder="Filter…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <ul className="attr-list" role="listbox" aria-multiselectable="true">
            {filtered.map((attr) => {
              const isSelected = selected.includes(attr);
              const disableItem = !isSelected && disabledAdd;
              return (
                <li key={attr} className={disableItem ? 'disabled' : ''}>
                  <button
                    type="button"
                    onClick={() => !disableItem && onToggle(attr)}
                    className={isSelected ? 'selected' : ''}
                    aria-pressed={isSelected}
                    aria-label={`${isSelected ? 'Remove' : 'Add'} attribute ${attr}`}
                    title={ATTRIBUTE_DESCRIPTIONS[attr] || attr}
                  >
                    {isSelected ? '✓ ' : ''}{attr}
                  </button>
                </li>
              );
            })}
            {filtered.length === 0 && <li className="empty">No matches</li>}
          </ul>
          <div className="dropdown-footer">
            <div className="footer-left"><button type="button" onClick={() => selected.forEach(a=>onToggle(a))} disabled={selected.length===0}>Clear</button></div>
            <small>{selected.length}/10 selected</small>
          </div>
        </div>
      )}
    </div>
  );
};