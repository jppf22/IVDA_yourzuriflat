/**
 * Map View (T5 - Explore apartments, T6 - Relate attributes)
 * Plotly scattermapbox with clustering and brushing
 */

import { useState } from 'react';
import Plot from 'react-plotly.js';
import { useAppStore } from '../store/useAppStore';
import { useApartments, useClusters } from '../api/hooks';
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
    openDetailDrawer,
  } = useAppStore();

  const { data: apartmentsData, isLoading: apartmentsLoading, isError: apartmentsError, refetch: refetchApartments } = useApartments(filters);
  const { data: clustersData, isLoading: clustersLoading, isError: clustersError, refetch: refetchClusters } = useClusters();

  const [zoomLevel, setZoomLevel] = useState(11);

  const topRecommendationIds = topRecommendations.map((apt) => apt.id);

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

  // Prepare data for Plotly
  const traces: Data[] = [];

  if (zoomLevel < 12 && clustersData) {
    // Show cluster centroids at low zoom
    const clusterTrace: Data = {
      type: 'scattermapbox',
      mode: 'markers',
      lat: clustersData.centroids.map((c) => c.latitude),
      lon: clustersData.centroids.map((c) => c.longitude),
      marker: {
        size: clustersData.centroids.map((c) => Math.min(c.size * 2 + 10, 40)),
        color: clustersData.centroids.map((c) => getClusterColor(c.cluster_id)),
        opacity: 0.6,
      },
      text: clustersData.centroids.map((c) => `Cluster ${c.cluster_id}<br>${c.size} apartments`),
      hoverinfo: 'text',
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
          if (selectedApartmentIds.includes(apt.id)) return '#f39c12';
          if (brushedApartmentIds.includes(apt.id)) return '#3498db';
          return getColorForApartment(apt.id, topRecommendationIds);
        }),
        opacity: apartments.map((apt) => {
          if (selectedApartmentIds.includes(apt.id)) return OPACITY.selected;
          if (brushedApartmentIds.includes(apt.id)) return OPACITY.brushed;
          if (topRecommendationIds.includes(apt.id)) return OPACITY.normal;
          return OPACITY.dimmed;
        }),
      },
      text: apartments.map(
        (apt) =>
          `<b>${apt.name}</b><br>` +
          `${formatPrice(apt.price)}/night<br>` +
          `${formatRoomType(apt.room_type)}<br>` +
          `${formatDistance(apt.distance_from_center)} from center<br>` +
          `Reviews: ${apt.number_of_reviews}`
      ),
      hoverinfo: 'text',
      customdata: apartments.map((apt) => apt.id),
      name: 'Apartments',
    };
    traces.push(apartmentTrace);
  }

  const layout: Partial<Layout> = {
    mapbox: {
      style: 'open-street-map',
      center: zurichCenter,
      zoom: zoomLevel,
    },
    height: 500,
    margin: { t: 0, b: 0, l: 0, r: 0 },
    hovermode: 'closest',
    dragmode: 'select',
    showlegend: false,
  };

  const handlePlotlyClick = (data: unknown) => {
    const eventData = data as { points?: Array<{ customdata?: string }> };
    if (eventData.points && eventData.points.length > 0) {
      const point = eventData.points[0];
      const apartmentId = point.customdata;
      if (apartmentId) {
        openDetailDrawer(apartmentId);
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
  };

  return (
    <div className="map-view">
      <div className="map-header">
        <h3>Apartment Map</h3>
        <div className="map-controls">
          <span className="zoom-indicator">Zoom: {zoomLevel.toFixed(1)}</span>
        </div>
      </div>
      <Plot
        data={traces}
        layout={layout}
        config={{ displayModeBar: true, displaylogo: false }}
        onClick={handlePlotlyClick}
        onSelected={handlePlotlySelected}
        onRelayout={handlePlotlyRelayout}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
};

export default MapView;
