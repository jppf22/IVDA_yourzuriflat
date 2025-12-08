/**
 * UMAP Scatter View (T6 - Relate apartment attributes)
 * Visualizes apartments in 2D space using UMAP dimensionality reduction with topic modeling
 * Topics provide semantic clustering for better non-expert interpretability
 */

import { useState, useMemo, useRef, useEffect } from 'react';
import Plot from 'react-plotly.js';
import { useAppStore } from '../store/useAppStore';
import { usePCA, useApartments, useRecommendationsSubset } from '../api/hooks';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ErrorMessage } from '../components/ErrorMessage';
import {
  getColorForApartment,
  OPACITY,
  SELECTION_COLOR,
} from '../utils/colors';
import type { Data, Layout } from 'plotly.js';
import type { PCAPoint, PCAResponse, Apartment, TopicInfo } from '../api/types';
import './UMAPScatterView.css';

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

// Topic color palette for better visual distinction
const TOPIC_COLORS = [
  '#1f77b4', // blue
  '#ff7f0e', // orange
  '#2ca02c', // green
  '#d62728', // red
  '#9467bd', // purple
  '#8c564b', // brown
  '#e377c2', // pink
  '#7f7f7f', // gray
  '#bcbd22', // olive
  '#17becf', // cyan
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
                ? 'UMAP'
                : 'Pick ≥2'})
            </small>
          </div>
        </div>
      )}
    </div>
  );
};

export const UMAPScatterView = () => {
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
    sessionId,
    ratingsCount,
  } = useAppStore();
  const attributes = pcaAttributes.length
    ? pcaAttributes
    : ['price', 'distance_from_city_center'];

  const [colorMode, setColorMode] = useState<'topic' | 'recommendation'>('topic');
  const [plotHeight, setPlotHeight] = useState(800);
  const containerRef = useRef<HTMLDivElement>(null);

  // Check recommendations within brushed selection
  const { data: subsetRecommendations } = useRecommendationsSubset(
    sessionId,
    brushedApartmentIds,
    ratingsCount
  );
  const isModelTrained = ratingsCount >= 5;

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

  // For PCA/UMAP we need at least 2 attributes. Provide fallback attributes so hook stays stable.
  const effectiveForPCA = attributes.length >= 2 ? attributes : ['price','distance_from_city_center'];
  const { data: pcaData, isLoading, isError, refetch } = usePCA(
    effectiveForPCA,
    filterOutliers
  );
  
  // Dynamically calculate plot height based on data range
  useEffect(() => {
    if (pcaData && pcaData.points && pcaData.points.length > 0) {
      const yValues = pcaData.points.map(p => p.y);
      const minY = Math.min(...yValues);
      const maxY = Math.max(...yValues);
      const range = maxY - minY;
      
      // Calculate height based on y-axis range with minimum and maximum bounds
      // Use a scaling factor to make the plot taller for larger ranges
      const scaleFactor = 40; // pixels per unit of y-range
      const calculatedHeight = Math.max(600, Math.min(1400, range * scaleFactor + 300));
      setPlotHeight(Math.round(calculatedHeight));
    }
  }, [pcaData]);
  
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
  const topRecommendationIds = topRecommendations.map(apt => String(apt.id));

  // Preserve recommendation palette while highlighting selection/brushing via marker stroke
  const deriveMarkerStyle = (apartmentId: string, topicId?: number | null) => {
    const id = String(apartmentId);
    
    let baseColor: string;
    if (colorMode === 'topic' && topicId !== null && topicId !== undefined) {
      baseColor = TOPIC_COLORS[topicId % TOPIC_COLORS.length];
    } else {
      baseColor = getColorForApartment(id, topRecommendationIds);
    }
    
    const isSelected = selectedApartmentIds.includes(id);
    const isBrushed = brushedApartmentIds.includes(id);
    const isTopRecommendation = topRecommendationIds.includes(id);

    const color = baseColor;
    const opacity = isSelected
      ? OPACITY.selected
      : isBrushed
      ? OPACITY.brushed
      : isTopRecommendation
      ? OPACITY.normal
      : OPACITY.dimmed;
    const lineColor = isSelected ? SELECTION_COLOR : 'rgba(0,0,0,0)';
    const lineWidth = isSelected ? 3 : 0;

    return { color, opacity, lineColor, lineWidth };
  };

  // 0 attributes selected: instruction state
  if (attributes.length === 0) {
    return (
      <div className="pca-scatter-view">
        <div className="scatter-header">
          <h3>Discover Similar Apartments</h3>
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
          <p>Select at least one attribute (1 = distribution, 2 = raw scatter, more than 2 = UMAP with topics).</p>
        </div>
      </div>
    );
  }

  // Single attribute distribution mode
  if (attributes.length === 1 && singleAttr) {
    const pointStyles = distPoints.map(p => deriveMarkerStyle(p.id));
    const trace: Data = {
      type: 'scatter',
      mode: 'markers',
      x: distPoints.map(p=>p.x),
      y: distPoints.map(p=>p.y),
      marker: {
        size: 9,
        color: pointStyles.map(style => style.color),
        opacity: pointStyles.map(style => style.opacity),
        line: {
          color: pointStyles.map(style => style.lineColor),
          width: pointStyles.map(style => style.lineWidth),
        },
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
        <LoadingSpinner message="Computing UMAP projection with topic modeling..." />
      </div>
    );
  }
  if (isError) {
    return (
      <div className="pca-scatter-view">
        <ErrorMessage
          message="Failed to load UMAP data"
          onRetry={() => refetch()}
        />
      </div>
    );
  }
  if (!pcaData || pcaData.points.length === 0) {
    return (
      <div className="pca-scatter-view">
        <div className="empty-state">
          <p>No data available for UMAP projection</p>
        </div>
      </div>
    );
  }

  const { points, x_label, y_label, mode, topics } = pcaData as PCAResponse;
  const hasTopics = topics && topics.length > 0 && mode === 'umap';

  const scatterStyles = points.map((p: PCAPoint) =>
    deriveMarkerStyle(p.apartment_id, p.topic_id)
  );

  // Helper to build base/top traces from a given point subset and styles
  const buildTracesForPoints = (
    pointSubset: PCAPoint[],
    styleSubset: { color: string; opacity: number; lineColor: string; lineWidth: number }[]
  ) => {
    const baseXs: number[] = [];
    const baseYs: number[] = [];
    const baseColors: string[] = [];
    const baseOpacities: number[] = [];
    const baseLineColors: string[] = [];
    const baseLineWidths: number[] = [];
    const baseTexts: string[] = [];
    const baseIds: string[] = [];

    const topXs: number[] = [];
    const topYs: number[] = [];
    const topColors: string[] = [];
    const topOpacities: number[] = [];
    const topLineColors: string[] = [];
    const topLineWidths: number[] = [];
    const topTexts: string[] = [];
    const topIds: string[] = [];

    const topIdSet = new Set(topRecommendationIds);

    pointSubset.forEach((p: PCAPoint, idx: number) => {
      const style = styleSubset[idx];
      const a = p.apartment;
      const topicInfo = p.topic_label ? `<br><b>Topic:</b> ${p.topic_label}` : '';
      const text = `<b>${a.name}</b><br>${a.property_type}<br>${a.room_type}<br>CHF ${a.price}/night<br>Accom: ${a.accommodates}${topicInfo}`;
      const id = String(p.apartment_id);
      const isTop = topIdSet.has(id);

      if (isTop) {
        topXs.push(p.x);
        topYs.push(p.y);
        topColors.push(style.color);
        topOpacities.push(1);
        topLineColors.push(style.lineColor);
        topLineWidths.push(style.lineWidth > 0 ? style.lineWidth : 2);
        topTexts.push(text);
        topIds.push(id);
      } else {
        baseXs.push(p.x);
        baseYs.push(p.y);
        baseColors.push(style.color);
        baseOpacities.push(style.opacity);
        baseLineColors.push(style.lineColor);
        baseLineWidths.push(style.lineWidth);
        baseTexts.push(text);
        baseIds.push(id);
      }
    });

    const baseTrace: Data = {
      type: 'scatter',
      mode: 'markers',
      x: baseXs,
      y: baseYs,
      marker: {
        size: 8,
        color: baseColors,
        opacity: baseOpacities,
        line: {
          color: baseLineColors,
          width: baseLineWidths,
        },
      },
      text: baseTexts,
      hoverinfo: 'text',
      customdata: baseIds,
    };

    const topTrace: Data = {
      type: 'scatter',
      mode: 'markers',
      x: topXs,
      y: topYs,
      marker: {
        size: 11,
        color: topColors,
        opacity: topOpacities,
        line: {
          color: topLineColors,
          width: topLineWidths,
        },
      },
      text: topTexts,
      hoverinfo: 'text',
      customdata: topIds,
    };

    return { baseTrace, topTrace };
  };

  const hasSelection = brushedApartmentIds.length > 0;
  const brushedIdSet = new Set(brushedApartmentIds.map(id => String(id)));

  // Global traces (all points) with brushed IDs highlighted in the right-hand view
  const globalBaseXs: number[] = [];
  const globalBaseYs: number[] = [];
  const globalBaseColors: string[] = [];
  const globalBaseOpacities: number[] = [];
  const globalBaseLineColors: string[] = [];
  const globalBaseLineWidths: number[] = [];
  const globalBaseTexts: string[] = [];
  const globalBaseIds: string[] = [];

  const globalTopXs: number[] = [];
  const globalTopYs: number[] = [];
  const globalTopColors: string[] = [];
  const globalTopOpacities: number[] = [];
  const globalTopLineColors: string[] = [];
  const globalTopLineWidths: number[] = [];
  const globalTopTexts: string[] = [];
  const globalTopIds: string[] = [];

  const topIdSetForGlobal = new Set(topRecommendationIds);

  points.forEach((p: PCAPoint, idx: number) => {
    const style = scatterStyles[idx];
    const a = p.apartment;
    const topicInfo = p.topic_label ? `<br><b>Topic:</b> ${p.topic_label}` : '';
    const text = `<b>${a.name}</b><br>${a.property_type}<br>${a.room_type}<br>CHF ${a.price}/night<br>Accom: ${a.accommodates}${topicInfo}`;
    const id = String(p.apartment_id);
    const isTop = topIdSetForGlobal.has(id);
    const isInBrush = brushedIdSet.has(id);

    if (isTop) {
      globalTopXs.push(p.x);
      globalTopYs.push(p.y);
      globalTopColors.push(style.color);
      globalTopOpacities.push(1);
      // Highlight brushed top-5 consistently with other brushed points
      globalTopLineColors.push(isInBrush && hasSelection ? '#000000' : style.lineColor);
      globalTopLineWidths.push(isInBrush && hasSelection ? 2 : style.lineWidth > 0 ? style.lineWidth : 2);
      globalTopTexts.push(text);
      globalTopIds.push(id);
    } else {
      globalBaseXs.push(p.x);
      globalBaseYs.push(p.y);
      globalBaseColors.push(style.color);
      // Strongly dim non-brushed points, give brushed ones a clear black outline
      globalBaseOpacities.push(isInBrush || !hasSelection ? style.opacity : 0.1);
      globalBaseLineColors.push(isInBrush ? '#000000' : 'rgba(0,0,0,0)');
      globalBaseLineWidths.push(isInBrush ? 2 : 0);
      globalBaseTexts.push(text);
      globalBaseIds.push(id);
    }
  });

  const globalBaseTrace: Data = {
    type: 'scatter',
    mode: 'markers',
    x: globalBaseXs,
    y: globalBaseYs,
    marker: {
      size: 8,
      color: globalBaseColors,
      opacity: globalBaseOpacities,
      line: {
        color: globalBaseLineColors,
        width: globalBaseLineWidths,
      },
    },
    text: globalBaseTexts,
    hoverinfo: 'text',
    customdata: globalBaseIds,
  };

  const globalTopTrace: Data = {
    type: 'scatter',
    mode: 'markers',
    x: globalTopXs,
    y: globalTopYs,
    marker: {
      size: 11,
      color: globalTopColors,
      opacity: globalTopOpacities,
      line: {
        color: globalTopLineColors,
        width: globalTopLineWidths,
      },
    },
    text: globalTopTexts,
    hoverinfo: 'text',
    customdata: globalTopIds,
  };

  // Focused selection traces (subset only)
  const selectedPoints = hasSelection
    ? points.filter(p => brushedIdSet.has(String(p.apartment_id)))
    : [];
  const selectedStyles = hasSelection
    ? selectedPoints.map(p => deriveMarkerStyle(p.apartment_id, p.topic_id))
    : [];
  const { baseTrace: selectionBaseTrace, topTrace: selectionTopTrace } = hasSelection
    ? buildTracesForPoints(selectedPoints, selectedStyles)
    : { baseTrace: globalBaseTrace, topTrace: globalTopTrace };
  
  const baseLayout: Partial<Layout> = {
    // When more than 2 attributes are selected and we're in UMAP mode,
    // axes are abstract projection dimensions, so hide titles, ticks, and lines.
    xaxis: attributes.length > 2 && mode === 'umap'
      ? { title: { text: '' }, showticklabels: false, ticks: '', showline: false, zeroline: false }
      : { title: { text: x_label || 'UMAP 1' } },
    yaxis: attributes.length > 2 && mode === 'umap'
      ? { title: { text: '' }, showticklabels: false, ticks: '', showline: false, zeroline: false }
      : { title: { text: y_label || 'UMAP 2' } },
    height: plotHeight,
    margin: { t: 50, b: 80, l: 80, r: 40 },
    hovermode: 'closest',
    dragmode: 'select',
    showlegend: false,
    autosize: true,
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
    if (!eventData || !eventData.points) return;

    const selectedIds = eventData.points
      .map(p => p.customdata)
      .filter(Boolean) as string[];

    // Only update brush when at least one point is selected;
    // this avoids collapsing split-view on accidental empty drags.
    if (selectedIds.length > 0) {
      setBrushedApartmentIds(selectedIds);
    }
  };

  return (
    <div className="pca-scatter-view" ref={containerRef}>
      <div className="scatter-header">
        <h3>Discover Similar Apartments</h3>
        {mode === 'umap' && attributes.length > 2 && (
          <div className="pca-info" style={{ 
            fontSize: '0.9em', 
            color: '#666', 
            marginTop: '4px',
            marginBottom: '8px'
          }}>
            <strong>Analyzing {attributes.length} attributes:</strong> {attributes.join(', ')}
            <div style={{ marginTop: '4px' }}>
              <span style={{ fontWeight: 'bold', color: '#2c3e50' }}>
                📊 UMAP projection with topic modeling
              </span>
              <span style={{ marginLeft: '8px', fontSize: '0.85em', color: '#7f8c8d', fontStyle: 'italic' }}>
                (Non-linear mapping preserving local structure - similar apartments cluster together)
              </span>
            </div>
          </div>
        )}
        {mode === 'raw' && attributes.length === 2 && (
          <div className="pca-info" style={{ 
            fontSize: '0.9em', 
            color: '#666', 
            marginTop: '4px',
            marginBottom: '8px'
          }}>
            <strong>Direct comparison:</strong> {attributes[0]} vs {attributes[1]}
          </div>
        )}
        <div className="scatter-controls">
          <AttributeMultiSelect
            candidates={dynamicCandidates}
            selected={attributes}
            onChange={next => setPcaAttributes(next)}
          />
          {hasTopics && (
            <div className="control-group">
              <label>
                Color by:
                <select 
                  value={colorMode} 
                  onChange={(e) => setColorMode(e.target.value as 'topic' | 'recommendation')}
                  style={{ marginLeft: '8px' }}
                >
                  <option value="topic">Topic</option>
                  <option value="recommendation">Recommendation</option>
                </select>
              </label>
            </div>
          )}
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
          {brushedApartmentIds.length > 0 && isModelTrained && subsetRecommendations && subsetRecommendations.total_in_subset > 0 && (
            <div className="recommendations-badge" title={`${subsetRecommendations.total_in_subset} top recommendations in selected area`}>
              <span className="badge-icon">⭐</span>
              <span className="badge-text">{subsetRecommendations.total_in_subset} recommended</span>
            </div>
          )}
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
      
      {/* Topic Legend */}
      {hasTopics && colorMode === 'topic' && topics && (
        <div style={{ 
          padding: '12px', 
          background: '#f8f9fa', 
          borderRadius: '4px', 
          marginBottom: '12px',
          fontSize: '0.9em'
        }}>
          <strong>Topics Discovered:</strong>
          <div style={{ 
            display: 'flex', 
            flexWrap: 'wrap', 
            gap: '12px', 
            marginTop: '8px' 
          }}>
            {topics.map((topic: TopicInfo) => (
              <div 
                key={topic.topic_id} 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '6px' 
                }}
              >
                <div 
                  style={{ 
                    width: '16px', 
                    height: '16px', 
                    borderRadius: '50%', 
                    background: TOPIC_COLORS[topic.topic_id % TOPIC_COLORS.length],
                    border: '1px solid #ddd'
                  }} 
                />
                <span style={{ fontWeight: '500' }}>{topic.label}</span>
                <span style={{ color: '#888', fontSize: '0.85em' }}>
                  ({topic.keywords.slice(0, 3).join(', ')})
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {hasSelection ? (
        <div style={{ display: 'flex', gap: '16px', alignItems: 'stretch' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h4 style={{ marginBottom: '4px' }}>Focused Selection</h4>
            <Plot
              data={[selectionBaseTrace, selectionTopTrace]}
              layout={{ ...baseLayout }}
              config={{ displayModeBar: true, displaylogo: false }}
              onClick={handlePlotlyClick}
              onSelected={handlePlotlySelected}
              style={{ width: '100%', height: '100%' }}
            />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h4 style={{ marginBottom: '4px' }}>Global Overview</h4>
            <Plot
              data={[globalBaseTrace, globalTopTrace]}
              layout={{ ...baseLayout }}
              config={{ displayModeBar: true, displaylogo: false }}
              onClick={handlePlotlyClick}
              onSelected={handlePlotlySelected}
              style={{ width: '100%', height: '100%' }}
            />
          </div>
        </div>
      ) : (
        <Plot
          data={[globalBaseTrace, globalTopTrace]}
          layout={baseLayout}
          config={{ displayModeBar: true, displaylogo: false }}
          onClick={handlePlotlyClick}
          onSelected={handlePlotlySelected}
          style={{ width: '100%', height: '100%' }}
        />
      )}
    </div>
  );
};

export default UMAPScatterView;
