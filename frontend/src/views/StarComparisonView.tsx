/**
 * Star Comparison View (T2 - Compare apartments by attributes)
 * Parallel coordinates chart comparing up to 5 apartments on multiple attributes
 */

import Plot from 'react-plotly.js';
import { useAppStore } from '../store/useAppStore';
import { getColorForApartment } from '../utils/colors';
import type { Data, Layout } from 'plotly.js';
import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
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

const CHART_MARGINS = {
  top: 60,
  bottom: 40,
  left: 100,
  right: 100,
};

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

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function distancePointToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) {
    return Math.hypot(px - ax, py - ay);
  }
  const t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
  const clamped = clamp01(t);
  const cx = ax + clamped * dx;
  const cy = ay + clamped * dy;
  return Math.hypot(px - cx, py - cy);
}

function buildDiscreteColorscale(colors: string[], maxIndex: number): [number, string][] {
  if (colors.length === 0) {
    return [
      [0, '#9ca3af'],
      [1, '#9ca3af'],
    ];
  }

  if (colors.length === 1) {
    return [
      [0, colors[0]],
      [1, colors[0]],
    ];
  }

  const denominator = Math.max(maxIndex, 1);
  const scale: [number, string][] = [];

  colors.forEach((color, idx) => {
    const value = idx / denominator;
    scale.push([value, color]);
  });

  if (scale[scale.length - 1][0] !== 1) {
    scale.push([1, colors[colors.length - 1]]);
  }

  return scale;
}

export const StarComparisonView = () => {
  const { selectedApartmentIds, topRecommendations, starAttributes, setStarAttributes, openDetailDrawer } = useAppStore();
  
  // User-controlled limit for displayed apartments (default: 3)
  const [maxApartments, setMaxApartments] = useState(3);
  const [showLegend, setShowLegend] = useState(true);
  const [activeApartmentIds, setActiveApartmentIds] = useState<string[]>([]);
  const [hoveredApartmentId, setHoveredApartmentId] = useState<string | null>(null);
  const chartAreaRef = useRef<HTMLDivElement | null>(null);

  // Use selected apartments or top recommendations, limited by maxApartments
  const apartmentsToCompare =
    selectedApartmentIds.length > 0
      ? topRecommendations.filter((apt) => selectedApartmentIds.includes(apt.id)).slice(0, maxApartments)
      : topRecommendations.slice(0, maxApartments);

  // Keep activeApartmentIds in sync with the current comparison set
  useEffect(() => {
    if (apartmentsToCompare.length === 0) {
      setActiveApartmentIds([]);
      return;
    }
    const currentIds = apartmentsToCompare.map((apt) => String(apt.id));
    setActiveApartmentIds((prev) => {
      const filtered = prev.filter((id) => currentIds.includes(id));
      return filtered.length > 0 ? filtered : currentIds;
    });
  }, [apartmentsToCompare]);

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

  const visibleEntries = useMemo(() => {
    const activeSet = new Set(
      activeApartmentIds.length > 0
        ? activeApartmentIds.map(String)
        : apartmentsToCompare.map((apt) => String(apt.id))
    );

    return apartmentsToCompare
      .map((apt, aptIdx) => ({ apt, aptIdx }))
      .filter(({ apt }) => activeSet.has(String(apt.id)));
  }, [apartmentsToCompare, activeApartmentIds]);

  const visibleMetadata = useMemo(
    () =>
      visibleEntries.map(({ apt }) => ({
        id: String(apt.id),
        name: apt.name || String(apt.id),
        color: getColorForApartment(apt.id, topRecommendationIds),
      })),
    [visibleEntries, topRecommendationIds]
  );

  const dimensionRanges = useMemo(() => {
    return attributes.map((attr, attrIdx) => {
      const column = rawMatrix[attrIdx];
      const finiteValues = column.filter((v) => Number.isFinite(v));
      let min = finiteValues.length ? Math.min(...finiteValues) : 0;
      let max = finiteValues.length ? Math.max(...finiteValues) : 1;
      if (min === max) {
        min -= 1;
        max += 1;
      }
      return { min, max };
    });
  }, [attributes, rawMatrix]);

  const baseTrace: Data | null = useMemo(() => {
    if (visibleEntries.length === 0 || attributes.length === 0) {
      return null;
    }

    const dimensions = attributes.map((attr, attrIdx) => {
      const { min, max } = dimensionRanges[attrIdx];
      const values = visibleEntries.map(({ aptIdx }) => rawMatrix[attrIdx][aptIdx]);
      return {
        label: attr,
        range: [min, max],
        values,
        tickformat: attr === 'price' ? '$.0f' : '.1f',
      };
    });

    const colorValues = visibleEntries.map((_, idx) => idx);
    const cmax = Math.max(colorValues.length - 1, 1);
    const colorscale = buildDiscreteColorscale(
      visibleMetadata.map((meta) => meta.color),
      cmax
    );

    const customdata = visibleMetadata.map((meta) => [meta.id, meta.name]);

    return {
      type: 'parcoords',
      domain: { x: [0, 1], y: [0, 1] },
      line: {
        color: colorValues.length ? colorValues : [0],
        colorscale,
        cmin: 0,
        cmax,
        showscale: false,
        width: 4,
      },
      dimensions,
      customdata,
      hovertemplate: '<b>%{customdata[1]}</b><extra></extra>',
    } as Data;
  }, [visibleEntries, attributes, dimensionRanges, rawMatrix, visibleMetadata]);

  const highlightTrace: Data | null = useMemo(() => {
    if (!hoveredApartmentId || attributes.length === 0) {
      return null;
    }

    const target = visibleEntries.find(({ apt }) => String(apt.id) === hoveredApartmentId);
    if (!target) return null;

    const dimensions = attributes.map((attr, attrIdx) => {
      const { min, max } = dimensionRanges[attrIdx];
      const value = rawMatrix[attrIdx][target.aptIdx];
      return {
        label: attr,
        range: [min, max],
        values: [value],
        tickformat: attr === 'price' ? '$.0f' : '.1f',
      };
    });

    return {
      type: 'parcoords',
      domain: { x: [0, 1], y: [0, 1] },
      line: {
        color: getColorForApartment(target.apt.id, topRecommendationIds),
        width: 8,
      },
      dimensions,
      hoverinfo: 'skip',
      showlegend: false,
    } as Data;
  }, [hoveredApartmentId, visibleEntries, attributes, dimensionRanges, rawMatrix, topRecommendationIds]);

  const plotData = useMemo(() => {
    const data: Data[] = [];
    if (baseTrace) data.push(baseTrace);
    if (highlightTrace) data.push(highlightTrace);
    return data;
  }, [baseTrace, highlightTrace]);

  // Ensure enough horizontal space for many attributes; enable horizontal scrolling
  const minPlotWidth = Math.max(attributes.length * 140, 600);

  const layout: Partial<Layout> = {
    margin: {
      t: CHART_MARGINS.top,
      b: CHART_MARGINS.bottom,
      l: CHART_MARGINS.left,
      r: CHART_MARGINS.right,
    },
    paper_bgcolor: 'white',
    plot_bgcolor: 'white',
    autosize: true,
  };

  const pickApartmentAtPointer = useCallback(
    (clientX: number, clientY: number) => {
      const container = chartAreaRef.current;
      if (!container) return null;
      if (attributes.length === 0 || visibleEntries.length === 0) return null;

      const rect = container.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      if (width <= 0 || height <= 0) return null;

      const x = clientX - rect.left;
      const y = clientY - rect.top;

      const innerWidth = width - CHART_MARGINS.left - CHART_MARGINS.right;
      const innerHeight = height - CHART_MARGINS.top - CHART_MARGINS.bottom;
      if (innerWidth <= 0 || innerHeight <= 0) return null;

      if (
        x < CHART_MARGINS.left - 8 ||
        x > width - CHART_MARGINS.right + 8 ||
        y < CHART_MARGINS.top - 8 ||
        y > height - CHART_MARGINS.bottom + 8
      ) {
        return null;
      }

      const axisCount = attributes.length;
      const axisPositions = attributes.map((_, idx) => {
        if (axisCount === 1) {
          return CHART_MARGINS.left + innerWidth / 2;
        }
        const ratio = idx / (axisCount - 1);
        return CHART_MARGINS.left + innerWidth * ratio;
      });

      const hitThreshold = 26;
      let closestId: string | null = null;
      let closestDistance = hitThreshold;

      visibleEntries.forEach(({ aptIdx }, entryIdx) => {
        const metadata = visibleMetadata[entryIdx];
        if (!metadata) return;
        let prevPoint: { x: number; y: number } | null = null;

        axisPositions.forEach((axisX, attrIdx) => {
          const { min, max } = dimensionRanges[attrIdx];
          const value = rawMatrix[attrIdx][aptIdx];
          const span = max - min;
          const normalized = span === 0 ? 0.5 : (value - min) / span;
          const pointY =
            CHART_MARGINS.top + innerHeight * (1 - clamp01(normalized));
          const point = { x: axisX, y: pointY };

          if (prevPoint) {
            const dist = distancePointToSegment(
              x,
              y,
              prevPoint.x,
              prevPoint.y,
              point.x,
              point.y
            );
            if (dist < closestDistance) {
              closestDistance = dist;
              closestId = metadata.id;
            }
          } else {
            const dist = Math.hypot(x - point.x, y - point.y);
            if (dist < closestDistance) {
              closestDistance = dist;
              closestId = metadata.id;
            }
          }

          prevPoint = point;
        });
      });

      return closestId;
    },
    [attributes, visibleEntries, visibleMetadata, dimensionRanges, rawMatrix]
  );

  const handleMouseMove = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const id = pickApartmentAtPointer(event.clientX, event.clientY);
      setHoveredApartmentId((prev) => (prev === id ? prev : id));
    },
    [pickApartmentAtPointer]
  );

  const handleMouseLeave = useCallback(() => {
    setHoveredApartmentId(null);
  }, []);

  const handleMouseClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const id = pickApartmentAtPointer(event.clientX, event.clientY);
      if (id) openDetailDrawer(id);
    },
    [pickApartmentAtPointer, openDetailDrawer]
  );

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
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setMaxApartments(next);
                  // Reset legend-based filtering whenever the count changes
                  setActiveApartmentIds([]);
                }}
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
          <div
            ref={chartAreaRef}
            style={{
              minWidth: `${minPlotWidth}px`,
              height: '100%',
              position: 'relative',
              cursor: hoveredApartmentId ? 'pointer' : 'default',
            }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onClick={handleMouseClick}
          >
            <Plot
              data={plotData}
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
              const isActive = activeApartmentIds.length === 0
                ? true
                : activeApartmentIds.includes(String(apt.id));
              return (
                <div 
                  key={apt.id} 
                  className={`legend-item${isActive ? '' : ' inactive'}`}
                  onClick={() => {
                    const id = String(apt.id);
                    setActiveApartmentIds((prev) => {
                      // If no active selection yet, start with this one only
                      if (prev.length === 0) return [id];
                      if (prev.includes(id)) {
                        const next = prev.filter((x) => x !== id);
                        // Ensure at least one apartment remains visible
                        return next.length > 0 ? next : [id];
                      }
                      return [...prev, id];
                    });
                  }}
                  style={{ cursor: 'pointer' }}
                  title={isActive ? 'Hide this apartment trace' : 'Show this apartment trace'}
                >
                  <div 
                    className="legend-color" 
                    style={{ backgroundColor: color, opacity: isActive ? 1 : 0.3 }}
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