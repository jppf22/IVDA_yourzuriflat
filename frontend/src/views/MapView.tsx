/**
 * Map View (T5 - Explore apartments, T6 - Relate attributes)
 * Plotly scattermapbox with clustering, brushing, and recommendation heatmap
 * Supports expandable overlay mode (minimized/full screen)
 */

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Plot from 'react-plotly.js';
import { useAppStore } from '../store/useAppStore';
import { useApartments, useClusters, useRecommendations } from '../api/hooks';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ErrorMessage } from '../components/ErrorMessage';
import { getColorForApartment, getClusterColor, OPACITY } from '../utils/colors';
import { formatPrice, formatDistance, formatRoomType } from '../utils/formatting';
import type { Data, Layout } from 'plotly.js';
import './MapView.css';

export const MapView = () => {
  const {
    filters,
    topRecommendations,
    selectedApartmentIds,
    brushedApartmentIds,
    setBrushedApartmentIds,
    clearBrushed,
    openDetailDrawer,
    selectedClusterId,
    setSelectedClusterId,
    sessionId,
    ratingsCount,
    isMapExpanded,
    toggleMapExpanded,
    setMapExpanded,
  } = useAppStore();

  // Use internal derivation of filters; avoid passing raw filter object to preserve mapping logic
  const { data: apartmentsData, isLoading: apartmentsLoading, isError: apartmentsError, refetch: refetchApartments } = useApartments();
  const { data: clustersData, isLoading: clustersLoading, isError: clustersError, refetch: refetchClusters } = useClusters();
  const { data: recommendationsData } = useRecommendations(sessionId, 100, ratingsCount);

  const [zoomLevel, setZoomLevel] = useState(11);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lon: number }>({ lat: 47.3769, lon: 8.5417 });
  const [mapStyle, setMapStyle] = useState<string>('carto-positron'); // Default clean style
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showClusters, setShowClusters] = useState(true);
  const [dragMode, setDragMode] = useState<'pan' | 'select'>('pan'); // Default to pan for better navigation

  useEffect(() => {
    if (!isMapExpanded) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMapExpanded]);

  const topRecommendationIds = topRecommendations.map((apt) => String(apt.id));
  const isModelTrained = ratingsCount >= 5;

  if (apartmentsLoading || clustersLoading) {
    return (
      <div className="map-view">
        <LoadingSpinner message="Loading map..." />
      </div>
    );
  }

  if (apartmentsError || clustersError) {
    return (
      <div className="map-view">
        <ErrorMessage
          message="Failed to load map data"
          onRetry={() => {
            refetchApartments();
            refetchClusters();
          }}
        />
      </div>
    );
  }

  const apartments = apartmentsData?.apartments || [];

  // Zurich center coordinates
  const zurichCenter = { lat: 47.3769, lon: 8.5417 };

  // Prepare recommendation score map for heatmap
  const recommendationScores: Record<string, number> = {};
  if (recommendationsData?.recommendations) {
    recommendationsData.recommendations.forEach((rec) => {
      // rec has structure: { apartment: Apartment, predicted_score: number }
      const aptId = String(rec.apartment.id);
      const score = rec.predicted_score;
      recommendationScores[aptId] = score;
    });
  }

  // Prepare data for Plotly
  const traces: Data[] = [];

  // Add heatmap layer if enabled and model is trained
  if (showHeatmap && isModelTrained && recommendationsData?.recommendations) {
    const heatmapApartments = apartments.filter((apt) => recommendationScores[String(apt.id)] !== undefined);
    if (heatmapApartments.length > 0) {
      const heatmapTrace: Data = {
        type: 'densitymapbox',
        lat: heatmapApartments.map((apt) => apt.latitude),
        lon: heatmapApartments.map((apt) => apt.longitude),
        z: heatmapApartments.map((apt) => recommendationScores[String(apt.id)] * 100), // Scale for visibility
        radius: 20,
        colorscale: [
          [0, 'rgba(59, 130, 246, 0)'],
          [0.3, 'rgba(59, 130, 246, 0.3)'],
          [0.5, 'rgba(147, 51, 234, 0.5)'],
          [0.7, 'rgba(236, 72, 153, 0.6)'],
          [1, 'rgba(239, 68, 68, 0.8)'],
        ],
        showscale: false,
        hoverinfo: 'skip',
        name: 'Recommendation Heatmap',
      } as Data;
      traces.push(heatmapTrace);
    }
  }

  if (zoomLevel < 12 && clustersData && showClusters) {
    // Show cluster centroids at low zoom (only if clusters are enabled)
    const clusterTrace: Data = {
      type: 'scattermapbox',
      mode: 'markers',
      lat: clustersData.centroids.map((c) => c.latitude),
      lon: clustersData.centroids.map((c) => c.longitude),
      marker: {
        size: clustersData.centroids.map((c) => Math.min(c.size * 2 + 10, 40)),
        color: clustersData.centroids.map((c) => 
          selectedClusterId === c.cluster_id ? '#e74c3c' : getClusterColor(c.cluster_id)
        ),
        opacity: clustersData.centroids.map((c) => 
          selectedClusterId === null || selectedClusterId === c.cluster_id ? 0.7 : 0.3
        ),
        line: {
          color: clustersData.centroids.map((c) => 
            selectedClusterId === c.cluster_id ? '#c0392b' : 'white'
          ),
          width: clustersData.centroids.map((c) => 
            selectedClusterId === c.cluster_id ? 3 : 1
          ),
        },
      },
      text: clustersData.centroids.map((c) => 
        `<b>Cluster ${c.cluster_id}</b><br>${c.size} apartments<br><i>Click to filter</i>`
      ),
      hoverinfo: 'text',
      customdata: clustersData.centroids.map((c) => c.cluster_id),
      name: 'Clusters',
    };
    traces.push(clusterTrace);
  } else {
    // Show individual apartments at high zoom
    const apartmentTrace: Data = {
      type: 'scattermapbox',
      mode: 'markers',
      lat: apartments.map((apt) => apt.latitude),
      lon: apartments.map((apt) => apt.longitude),
      marker: {
        size: 10,
        color: apartments.map((apt) => {
          const idStr = String(apt.id);
          if (selectedApartmentIds.includes(idStr)) return '#f39c12';
          if (brushedApartmentIds.includes(idStr)) return '#3498db';
          return getColorForApartment(idStr, topRecommendationIds);
        }),
        opacity: apartments.map((apt) => {
          const idStr = String(apt.id);
          if (selectedApartmentIds.includes(idStr)) return OPACITY.selected;
          if (brushedApartmentIds.includes(idStr)) return OPACITY.brushed;
          if (topRecommendationIds.includes(idStr)) return OPACITY.normal;
          return OPACITY.dimmed;
        }),
      },
      text: apartments.map(
        (apt) =>
          `<b>${apt.name}</b><br>` +
          `${formatPrice(apt.price)}/night<br>` +
          `${apt.property_type}<br>` +
          `${formatRoomType(apt.room_type)}<br>` +
          `Accommodates: ${apt.accommodates}<br>` +
          `${formatDistance((apt.distance_from_city_center || apt.distance_from_center || 0))} from center`
      ),
      hoverinfo: 'text',
      customdata: apartments.map((apt) => String(apt.id)),
      name: 'Apartments',
    };
    traces.push(apartmentTrace);
  }

  const layout: Partial<Layout> = {
    mapbox: {
      style: mapStyle,
      center: mapCenter,
      zoom: zoomLevel,
    },
    height: isMapExpanded ? Math.max(window.innerHeight - 140, 400) : 300,
    margin: { t: 0, b: 0, l: 0, r: 0 },
    hovermode: 'closest',
    dragmode: dragMode,
    showlegend: false,
  };

  const handlePlotlyClick = (data: unknown) => {
    const eventData = data as { points?: Array<{ customdata?: string | number; curveNumber?: number }> };
    if (eventData.points && eventData.points.length > 0) {
      const point = eventData.points[0];
      
      // Check if this is a cluster click (curveNumber 0 at low zoom)
      if (point.curveNumber === 0 && zoomLevel < 12 && typeof point.customdata === 'number') {
        const clusterId = point.customdata;
        // Toggle cluster selection
        setSelectedClusterId(selectedClusterId === clusterId ? null : clusterId);
      } else {
        // This is an apartment click
        const apartmentId = point.customdata;
        if (apartmentId) {
          openDetailDrawer(String(apartmentId));
        }
      }
    }
  };

  const handlePlotlySelected = (data: unknown) => {
    const eventData = data as { points?: Array<{ customdata?: string }> };
    if (eventData && eventData.points) {
      const selectedIds = eventData.points.map((p) => p.customdata).filter(Boolean) as string[];
      setBrushedApartmentIds(selectedIds);
    }
  };

  const handlePlotlyRelayout = (data: unknown) => {
    const relayoutData = data as Record<string, unknown>;
    if (relayoutData['mapbox.zoom'] !== undefined) {
      setZoomLevel(relayoutData['mapbox.zoom'] as number);
    }
    if (relayoutData['mapbox.center'] && typeof relayoutData['mapbox.center'] === 'object') {
      const center = relayoutData['mapbox.center'] as { lat: number; lon: number };
      setMapCenter(center);
    }
    if (
      relayoutData['mapbox.center.lat'] !== undefined &&
      relayoutData['mapbox.center.lon'] !== undefined
    ) {
      setMapCenter({
        lat: relayoutData['mapbox.center.lat'] as number,
        lon: relayoutData['mapbox.center.lon'] as number,
      });
    }
  };

  const handleRecenter = () => {
    setZoomLevel(11);
    setMapCenter(zurichCenter);
  };

  const mapNode = (
    <div
      className={`map-view ${isMapExpanded ? 'map-expanded' : ''}`}
      onClick={(event) => {
        if (isMapExpanded && event.target === event.currentTarget) {
          setMapExpanded(false);
        }
      }}
    >
      <div className="map-header">
        <div className="map-title-section">
          <h3>Apartment Map</h3>
          {isMapExpanded && (
            <button className="map-collapse-button" onClick={toggleMapExpanded} title="Minimize map">
              <span>✕</span>
            </button>
          )}
          {!isMapExpanded && (
            <button className="map-expand-button-small" onClick={toggleMapExpanded} title="Expand map">
              <span>⛶</span>
            </button>
          )}
        </div>
        <div className="map-controls">
          {selectedClusterId !== null && (
            <div className="cluster-filter-badge">
              <span className="filter-icon">🗂️</span>
              <span className="filter-text">Cluster {selectedClusterId}</span>
              <button 
                className="clear-cluster-button"
                onClick={() => setSelectedClusterId(null)}
                title="Clear cluster filter"
              >
                ✕
              </button>
            </div>
          )}

          {brushedApartmentIds.length > 0 && (
            <button
              className="reset-selection-button"
              onClick={clearBrushed}
              title="Clear brushed selection"
            >
              <span className="reset-icon">🔄</span>
              <span>Clear Selection ({brushedApartmentIds.length})</span>
            </button>
          )}

          <button
            className={`mode-toggle-button ${dragMode === 'select' ? 'active' : ''}`}
            onClick={() => setDragMode(dragMode === 'pan' ? 'select' : 'pan')}
            title={dragMode === 'pan' ? 'Switch to selection mode' : 'Switch to pan mode'}
          >
            <span className="mode-icon">{dragMode === 'pan' ? '🖱️' : '🔲'}</span>
            <span className="mode-text">{dragMode === 'pan' ? 'Pan' : 'Select'}</span>
          </button>

          {isModelTrained && (
            <label className="heatmap-toggle">
              <input
                type="checkbox"
                checked={showHeatmap}
                onChange={(e) => setShowHeatmap(e.target.checked)}
              />
              <span className="heatmap-label">Show Recommendations Heatmap</span>
            </label>
          )}

          {zoomLevel < 12 && (
            <label className="heatmap-toggle">
              <input
                type="checkbox"
                checked={showClusters}
                onChange={(e) => setShowClusters(e.target.checked)}
              />
              <span className="heatmap-label">Show Clusters</span>
            </label>
          )}
          
          <label htmlFor="map-style-select" className="map-style-label">
            Map Style:
          </label>
          <select 
            id="map-style-select"
            className="map-style-selector"
            value={mapStyle}
            onChange={(e) => setMapStyle(e.target.value)}
          >
            <option value="carto-positron">Light (Recommended)</option>
            <option value="carto-darkmatter">Dark</option>
            <option value="open-street-map">OpenStreetMap</option>
            <option value="white-bg">Minimal White</option>
            <option value="stamen-terrain">Terrain</option>
            <option value="stamen-toner">Black & White</option>
            <option value="stamen-watercolor">Watercolor</option>
          </select>
          
          <div className="zoom-controls">
            <label htmlFor="zoom-slider" className="zoom-label">
              Zoom:
            </label>
            <button 
              className="zoom-button"
              onClick={() => setZoomLevel(Math.max(9, zoomLevel - 0.5))}
              title="Zoom out"
            >
              −
            </button>
            <input
              id="zoom-slider"
              type="range"
              min="9"
              max="16"
              step="0.5"
              value={zoomLevel}
              onChange={(e) => setZoomLevel(parseFloat(e.target.value))}
              className="zoom-slider"
            />
            <button 
              className="zoom-button"
              onClick={() => setZoomLevel(Math.min(16, zoomLevel + 0.5))}
              title="Zoom in"
            >
              +
            </button>
            <span className="zoom-indicator">{zoomLevel.toFixed(1)}</span>
          </div>

          <button className="recenter-button" onClick={handleRecenter} title="Reset to Zurich center">
            <span>📍</span>
            <span>Recenter</span>
          </button>
        </div>
      </div>
      <Plot
        data={traces}
        layout={layout}
        config={{ 
          displayModeBar: true, 
          displaylogo: false,
          scrollZoom: true,
          modeBarButtonsToAdd: [],
          modeBarButtonsToRemove: ['select2d', 'lasso2d'],
        }}
        onClick={handlePlotlyClick}
        onSelected={handlePlotlySelected}
        onRelayout={handlePlotlyRelayout}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );

  if (isMapExpanded) {
    return createPortal(mapNode, document.body);
  }

  return mapNode;
};

export default MapView;
