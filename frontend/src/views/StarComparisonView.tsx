/**
 * Star Comparison View (T2 - Compare apartments by attributes)
 * Radar chart comparing up to 5 apartments on normalized attributes
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

// Human readable tooltip descriptions
const ATTRIBUTE_DESCRIPTIONS: Record<string, string> = {
  price: 'Listing price (lower is better; log scaled).',
  accommodates: 'Max number of guests the listing can host.',
  bedrooms: 'Separate bedrooms (privacy).',
  bathrooms: 'Bathrooms (comfort).',
  beds: 'Total beds (sleep flexibility).',
  minimum_nights: 'Minimum nights required (lower is better).',
  amenities_count: 'Count of amenities (capped at 30).',
  distance_from_city_center: 'Distance to city center (lower is better; inverted).',
};

// Derive a numeric value for each attribute, handling parsing/inversion
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

// Scale a column to [0,1] (optionally invert)
function scale(values: number[], invert = false): number[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values.map((v) => {
    const norm = (v - min) / range;
    return invert ? 1 - norm : norm;
  });
}

export const StarComparisonView = () => {
  const { selectedApartmentIds, topRecommendations, starAttributes, toggleStarAttribute, resetStarAttributes, setStarAttributes, openDetailDrawer } = useAppStore();

  // Use selected apartments or top recommendations
  const apartmentsToCompare =
    selectedApartmentIds.length > 0
      ? topRecommendations.filter((apt) => selectedApartmentIds.includes(apt.id)).slice(0, 5)
      : topRecommendations.slice(0, 5);

  const topRecommendationIds = topRecommendations.map((apt) => apt.id);

  // Active attributes (defaults from store)
  const attributes = useMemo(
    () => (starAttributes.length ? starAttributes : ['minimum_nights','accommodates','price','distance_from_city_center']),
    [starAttributes]
  );

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

  // Build raw matrix for scaling
  const rawMatrix = useMemo(
    () => attributes.map((attr) => apartmentsToCompare.map((apt) => deriveNumeric(apt, attr))),
    [attributes, apartmentsToCompare]
  );

  // Apply per-attribute scaling rules
  const scaledMatrix = useMemo(
    () =>
      rawMatrix.map((col, idx) => {
        const attr = attributes[idx];
        if (attr === 'price') {
          const logged = col.map((v) => Math.log(v > 0 ? v : 1));
          return scale(logged);
        }
        if (attr === 'minimum_nights') return scale(col, true);
        if (/^distance/i.test(attr)) return scale(col, true); // invert distance metrics
        if (attr === 'amenities_count') {
          const capped = col.map((v) => Math.min(v, 30));
          return scale(capped);
        }
        return scale(col);
      }),
    [rawMatrix, attributes]
  );

  // Create dynamic radar traces from scaled matrix
  const traces: Data[] = apartmentsToCompare.map((apt, aptIdx) => {
    const color = getColorForApartment(apt.id, topRecommendationIds);
    const vals = scaledMatrix.map((col) => col[aptIdx]);
    return {
      type: 'scatterpolar',
      r: [...vals, vals[0]],
      theta: [...attributes, attributes[0]],
      name: apt.name ? apt.name.substring(0, 30) : String(apt.id),
      fill: 'toself',
      line: { color },
      fillcolor: color,
      opacity: 0.35,
      // attach apartment id so click can open detail
      customdata: Array(vals.length + 1).fill(String(apt.id)),
      hovertemplate: `<b>${apt.name ? apt.name.replace(/`/g,'') : apt.id}</b><br>` +
        attributes.map((attr, i) => `${attr}: ${vals[i].toFixed(2)}`).join('<br>') +
        '<extra></extra>',
    } as Data;
  });

  const layout: Partial<Layout> = {
    polar: {
      radialaxis: {
        visible: true,
        range: [0, 1],
      },
    },
    height: 500,
    showlegend: true,
    legend: {
      orientation: 'v',
      x: 1.05,
      y: 1,
    },
  };

  // Attribute selection UI
  const disabledAdd = attributes.length >= 7;
  if (apartmentsToCompare.length === 0) {
    return (
      <div className="star-comparison-view">
        <div className="comparison-header">
          <h3>Apartment Comparison</h3>
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
        <h3>Apartment Comparison</h3>
        <p className="comparison-subtitle">Comparing {apartmentsToCompare.length} apartments</p>
      </div>
      <div className="star-controls">
        <div className="star-controls-header">
          <strong>Attributes (max 7)</strong>
          <div className="preset-buttons" style={{gap:'0.5rem'}}>
            <button
              type="button"
              onClick={() => setStarAttributes([])}
              aria-label="Clear all attributes"
            >Clear All</button>
            <button
              type="button"
              onClick={() => resetStarAttributes()}
              aria-label="Restore default attributes"
            >Defaults</button>
          </div>
        </div>
        <AttributeMultiSelect
          candidates={dynamicCandidates}
          selected={attributes}
          onToggle={toggleStarAttribute}
          disabledAdd={disabledAdd}
        />
      </div>
      <Plot
        data={traces}
        layout={layout}
        config={{ displayModeBar: false, displaylogo: false }}
        style={{ width: '100%', height: '100%' }}
        onClick={(ev: Readonly<{
          points: Array<{
            curveNumber: number;
          }>;
        }>) => {
          const point = ev.points?.[0];
          if (!point) return;
          const traceIndex = point.curveNumber;
          const apt = apartmentsToCompare[traceIndex];
            if (apt) openDetailDrawer(String(apt.id));
        }}
      />
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
            <small>{selected.length}/7 selected</small>
          </div>
        </div>
      )}
    </div>
  );
};
