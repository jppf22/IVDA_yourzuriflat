/**
 * PCA Scatter View (T6 - Relate apartment attributes)
 * Visualizes apartments in 2D space using raw attributes (2 attrs) or PCA ( >2 attrs )
 */

import { useState, useMemo, useRef, useEffect } from 'react';
import Plot from 'react-plotly.js';
import { useAppStore } from '../store/useAppStore';
import { usePCA, useApartments } from '../api/hooks';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ErrorMessage } from '../components/ErrorMessage';
import { getColorForApartment, OPACITY } from '../utils/colors';
import type { Data, Layout } from 'plotly.js';
import type { PCAPoint, PCAResponse, Apartment } from '../api/types';
import './PCAScatterView.css';

// Fallback attribute candidates; will be extended dynamically from top recommendations
const BASE_CANDIDATES = [
  'price',
  'distance_from_city_center',
  'minimum_nights',
  'accommodates',
  'bedrooms',
  'bathrooms',
  'beds',
  'availability_365',
  'number_of_reviews',
];

interface AttributeMultiSelectProps {
  candidates: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}

const AttributeMultiSelect = ({ candidates, selected, onChange }: AttributeMultiSelectProps) => {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  const filtered = useMemo(
    () => candidates.filter(c => c.toLowerCase().includes(filter.toLowerCase())),
    [candidates, filter]
  );
  return (
    <div className="attr-multiselect" ref={containerRef} style={{ minWidth: '240px' }}>
      <div
        className="selected-tags"
        role="button"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        {selected.length === 0 && (
          <span className="placeholder">Select attributes…</span>
        )}
        {selected.map(s => (
          <span key={s} className="tag" title={s}>
            {s}
          </span>
        ))}
        <span className="toggle-button">{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div className="dropdown-panel">
          <input
            className="attr-filter"
            placeholder="Filter…"
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
          <ul className="attr-list" role="listbox" aria-multiselectable="true">
            {filtered.map(attr => {
              const isSelected = selected.includes(attr);
              return (
                <li key={attr}>
                  <button
                    type="button"
                    className={isSelected ? 'selected' : ''}
                    onClick={() => {
                      if (isSelected) onChange(selected.filter(a => a !== attr));
                      else onChange([...selected, attr]);
                    }}
                  >
                    {isSelected ? '✓ ' : ''}
                    {attr}
                  </button>
                </li>
              );
            })}
            {filtered.length === 0 && (
              <li className="empty">No matches</li>
            )}
          </ul>
          <div
            className="dropdown-footer"
            style={{ display: 'flex', justifyContent: 'space-between' }}
          >
            <button
              type="button"
              onClick={() => onChange([])}
              disabled={selected.length === 0}
            >
              Clear
            </button>
            <small>
              {selected.length} selected ({selected.length === 2
                ? 'Raw scatter'
                : selected.length > 2
                ? 'PCA'
                : 'Pick ≥2'})
            </small>
          </div>
        </div>
      )}
    </div>
  );
};

export const PCAScatterView = () => {
  const {
    pcaAttributes,
    setPcaAttributes,
    filterOutliers,
    setFilterOutliers,
    topRecommendations,
    selectedApartmentIds,
    brushedApartmentIds,
    setBrushedApartmentIds,
    openDetailDrawer,
    // filters (unused here; useApartments derives from store internally)
  } = useAppStore();
  const attributes = pcaAttributes.length
    ? pcaAttributes
    : ['price', 'distance_from_city_center'];

  // Dynamic candidate list derived from first recommendation
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
      .filter(k => !exclude.has(k) && typeof sample[k] === 'number')
      .filter(k => !BASE_CANDIDATES.includes(k));
    return Array.from(new Set([...BASE_CANDIDATES, ...numericKeys]));
  }, [topRecommendations]);

  // For PCA we need at least 2 attributes. Provide fallback attributes so hook stays stable.
  const effectiveForPCA = attributes.length >= 2 ? attributes : ['price','distance_from_city_center'];
  const { data: pcaData, isLoading, isError, refetch } = usePCA(
    effectiveForPCA,
    filterOutliers
  );
  // Fetch filtered apartments (includes selection subset if active) for single-attribute distribution
  const { data: apartmentsData } = useApartments();
  const singleAttr = attributes.length === 1 ? attributes[0] : undefined;
  const apartments = apartmentsData?.apartments || [];
  const hashToJitter = (id: string) => {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return (h % 1000) / 1000 * 0.1;
  };
  const getVal = (apt: Record<string, unknown>): number => {
    if (!singleAttr) return 0;
    let v: unknown = apt?.[singleAttr];
    if (singleAttr === 'price') {
      if (typeof v === 'string') v = v.replace(/[^0-9.]/g, '');
      const parsed = parseFloat(String(v));
      v = parsed;
    }
    return typeof v === 'number' && isFinite(v) ? v : 0;
  };
  const distPoints: Array<{id:string;x:number;y:number;apt:Apartment}> = singleAttr
    ? apartments.map(a => ({
        id: String(a.id),
        x: getVal(a as unknown as Record<string, unknown>),
        y: hashToJitter(String(a.id)),
        apt: a as Apartment,
      }))
    : [];
  const topRecommendationIds = topRecommendations.map(apt => apt.id);

  // 0 attributes selected: instruction state
  if (attributes.length === 0) {
    return (
      <div className="pca-scatter-view">
        <div className="scatter-header">
          <h3>Attribute Scatter / PCA</h3>
          <div className="scatter-controls">
            <AttributeMultiSelect
              candidates={dynamicCandidates}
              selected={attributes}
              onChange={next => setPcaAttributes(next)}
            />
            <button
              type="button"
              className="reset-selection-btn"
              onClick={() => setBrushedApartmentIds([])}
              disabled={brushedApartmentIds.length === 0}
            >
              Reset Selection{brushedApartmentIds.length>0?` (${brushedApartmentIds.length})`:''}
            </button>
          </div>
        </div>
        <div className="empty-state">
          <p>Select at least one attribute (1 = distribution, 2 = raw scatter, more than 2 = PCA).</p>
        </div>
      </div>
    );
  }

  // Single attribute distribution mode
  if (attributes.length === 1 && singleAttr) {
    const trace: Data = {
      type: 'scatter',
      mode: 'markers',
      x: distPoints.map(p=>p.x),
      y: distPoints.map(p=>p.y),
      marker: {
        size: 9,
        color: distPoints.map(p => {
          if (selectedApartmentIds.includes(p.id)) return '#f39c12';
          if (brushedApartmentIds.includes(p.id)) return '#3498db';
          return getColorForApartment(p.id, topRecommendationIds);
        }),
        opacity: distPoints.map(p => {
          if (selectedApartmentIds.includes(p.id)) return OPACITY.selected;
          if (brushedApartmentIds.includes(p.id)) return OPACITY.brushed;
          if (topRecommendationIds.includes(p.id)) return OPACITY.normal;
          return OPACITY.dimmed;
        }),
      },
      text: distPoints.map(p => {
        const a = p.apt as Apartment;
        const val = getVal(a as unknown as Record<string, unknown>);
        return `<b>${a.name}</b><br>${singleAttr}: ${val}<br>${a.property_type}<br>${a.room_type}`;
      }),
      hoverinfo: 'text',
      customdata: distPoints.map(p=>p.id),
    };
    const layout: Partial<Layout> = {
      xaxis: { title: { text: singleAttr } },
      yaxis: { title: { text: '' }, showticklabels: false },
      height: 500,
      margin: { t: 40, b: 60, l: 60, r: 40 },
      hovermode: 'closest',
      dragmode: 'select',
    };
    const handleClick = (data: unknown) => {
      const evt = data as { points?: Array<{ customdata?: string }> };
      if (evt.points && evt.points.length>0) {
        const id = evt.points[0].customdata;
        if (id) openDetailDrawer(id);
      }
    };
    const handleSelect = (data: unknown) => {
      const evt = data as { points?: Array<{ customdata?: string }> };
      if (evt.points) {
        const ids = evt.points.map(p=>p.customdata).filter(Boolean) as string[];
        setBrushedApartmentIds(ids);
      }
    };
    return (
      <div className="pca-scatter-view">
        <div className="scatter-header">
          <h3>Attribute Distribution ({singleAttr})</h3>
          <div className="scatter-controls">
            <AttributeMultiSelect
              candidates={dynamicCandidates}
              selected={attributes}
              onChange={next => setPcaAttributes(next)}
            />
            <button
              type="button"
              className="reset-selection-btn"
              onClick={() => setBrushedApartmentIds([])}
              disabled={brushedApartmentIds.length === 0}
            >
              Reset Selection{brushedApartmentIds.length>0?` (${brushedApartmentIds.length})`:''}
            </button>
          </div>
        </div>
        <Plot
          data={[trace]}
          layout={layout}
          config={{ displayModeBar: true, displaylogo: false }}
          onClick={handleClick}
          onSelected={handleSelect}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="pca-scatter-view">
        <LoadingSpinner message="Computing scatter plot..." />
      </div>
    );
  }
  if (isError) {
    return (
      <div className="pca-scatter-view">
        <ErrorMessage
          message="Failed to load scatter plot data"
          onRetry={() => refetch()}
        />
      </div>
    );
  }
  if (!pcaData || pcaData.points.length === 0) {
    return (
      <div className="pca-scatter-view">
        <div className="empty-state">
          <p>No data available for scatter plot</p>
        </div>
      </div>
    );
  }

  const { points, x_label, y_label, mode } = pcaData as PCAResponse;
  const trace: Data = {
    type: 'scatter',
    mode: 'markers',
    x: points.map((p: PCAPoint) => p.x),
    y: points.map((p: PCAPoint) => p.y),
    marker: {
      size: 8,
      color: points.map((p: PCAPoint) => {
        if (selectedApartmentIds.includes(p.apartment_id)) return '#f39c12';
        if (brushedApartmentIds.includes(p.apartment_id)) return '#3498db';
        return getColorForApartment(p.apartment_id, topRecommendationIds);
      }),
      opacity: points.map((p: PCAPoint) => {
        if (selectedApartmentIds.includes(p.apartment_id)) return OPACITY.selected;
        if (brushedApartmentIds.includes(p.apartment_id)) return OPACITY.brushed;
        if (topRecommendationIds.includes(p.apartment_id)) return OPACITY.normal;
        return OPACITY.dimmed;
      }),
    },
    text: points.map((p: PCAPoint) => {
      const a = p.apartment;
      return `<b>${a.name}</b><br>${a.property_type}<br>${a.room_type}<br>CHF ${a.price}/night<br>Accom: ${a.accommodates}`;
    }),
    hoverinfo: 'text',
    customdata: points.map((p: PCAPoint) => p.apartment_id),
  };
  const layout: Partial<Layout> = {
    xaxis: mode === 'raw' ? { title: { text: x_label } } : { title: { text: '' } },
    yaxis: mode === 'raw' ? { title: { text: y_label } } : { title: { text: '' } },
    height: 500,
    margin: { t: 40, b: 60, l: 60, r: 40 },
    hovermode: 'closest',
    dragmode: 'select',
    showlegend: false,
  };

  const handlePlotlyClick = (data: unknown) => {
    const eventData = data as { points?: Array<{ customdata?: string }> };
    if (eventData.points && eventData.points.length > 0) {
      const apartmentId = eventData.points[0].customdata;
      if (apartmentId) openDetailDrawer(apartmentId);
    }
  };
  const handlePlotlySelected = (data: unknown) => {
    const eventData = data as { points?: Array<{ customdata?: string }> };
    if (eventData && eventData.points) {
      const selectedIds = eventData.points
        .map(p => p.customdata)
        .filter(Boolean) as string[];
      setBrushedApartmentIds(selectedIds);
    }
  };

  return (
    <div className="pca-scatter-view">
      <div className="scatter-header">
        <h3>Attribute Scatter / PCA</h3>
        <div className="scatter-controls">
          <AttributeMultiSelect
            candidates={dynamicCandidates}
            selected={attributes}
            onChange={next => setPcaAttributes(next)}
          />
          <div className="control-group">
            <label>
              <input
                type="checkbox"
                checked={filterOutliers}
                onChange={e => setFilterOutliers(e.target.checked)}
              />
              Filter Outliers
            </label>
          </div>
          <button
            type="button"
            className="reset-selection-btn"
            onClick={() => setBrushedApartmentIds([])}
            disabled={brushedApartmentIds.length === 0}
            title={
              brushedApartmentIds.length === 0
                ? 'No selection to reset'
                : 'Reset current selection subset'
            }
          >
            Reset Selection
            {brushedApartmentIds.length > 0
              ? ` (${brushedApartmentIds.length})`
              : ''}
          </button>
        </div>
      </div>
      <Plot
        data={[trace]}
        layout={layout}
        config={{ displayModeBar: true, displaylogo: false }}
        onClick={handlePlotlyClick}
        onSelected={handlePlotlySelected}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
};

export default PCAScatterView;
