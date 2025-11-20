/**
 * PCA Scatter View (T6 - Relate apartment attributes)
 * Visualizes apartments in 2D space using raw attributes or PCA components
 */

import { useState } from 'react';
import Plot from 'react-plotly.js';
import { useAppStore } from '../store/useAppStore';
import { usePCA } from '../api/hooks';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ErrorMessage } from '../components/ErrorMessage';
import { getColorForApartment, OPACITY } from '../utils/colors';
import { formatAttributeName } from '../utils/formatting';
import type { Data, Layout } from 'plotly.js';
import './PCAScatterView.css';

const AVAILABLE_ATTRIBUTES = [
  'price',
  'distance_from_center',
  'minimum_nights',
  'number_of_reviews',
  'availability_365',
  'calculated_host_listings_count',
];

export const PCAScatterView = () => {
  const {
    pcaMode,
    setPcaMode,
    pcaAttributes,
    setPcaAttributes,
    filterOutliers,
    setFilterOutliers,
    topRecommendations,
    selectedApartmentIds,
    brushedApartmentIds,
    setBrushedApartmentIds,
    openDetailDrawer,
  } = useAppStore();

  const [xAttribute, setXAttribute] = useState(pcaAttributes[0] || 'price');
  const [yAttribute, setYAttribute] = useState(pcaAttributes[1] || 'distance_from_center');

  // Update store when attributes change
  const handleAttributeChange = (x: string, y: string) => {
    setXAttribute(x);
    setYAttribute(y);
    setPcaAttributes([x, y]);
  };

  const {
    data: pcaData,
    isLoading,
    isError,
    refetch,
  } = usePCA(pcaAttributes, pcaMode, filterOutliers);

  const topRecommendationIds = topRecommendations.map((apt) => apt.id);

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
        <ErrorMessage message="Failed to load scatter plot data" onRetry={() => refetch()} />
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

  const { points, x_label, y_label } = pcaData;

  // Prepare Plotly trace
  const trace: Data = {
    type: 'scatter',
    mode: 'markers',
    x: points.map((p) => p.x),
    y: points.map((p) => p.y),
    marker: {
      size: 8,
      color: points.map((p) => {
        if (selectedApartmentIds.includes(p.apartment_id)) return '#f39c12';
        if (brushedApartmentIds.includes(p.apartment_id)) return '#3498db';
        return getColorForApartment(p.apartment_id, topRecommendationIds);
      }),
      opacity: points.map((p) => {
        if (selectedApartmentIds.includes(p.apartment_id)) return OPACITY.selected;
        if (brushedApartmentIds.includes(p.apartment_id)) return OPACITY.brushed;
        if (topRecommendationIds.includes(p.apartment_id)) return OPACITY.normal;
        return OPACITY.dimmed;
      }),
    },
    text: points.map((p) => p.apartment.name),
    hoverinfo: 'text',
    customdata: points.map((p) => p.apartment_id),
  };

  const layout: Partial<Layout> = {
    xaxis: { title: { text: x_label } },
    yaxis: { title: { text: y_label } },
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

  return (
    <div className="pca-scatter-view">
      <div className="scatter-header">
        <h3>Attribute Scatter Plot</h3>
        <div className="scatter-controls">
          {/* Mode Toggle */}
          <div className="control-group">
            <label>Mode:</label>
            <select value={pcaMode} onChange={(e) => setPcaMode(e.target.value as 'pca' | 'raw')}>
              <option value="raw">Raw Attributes</option>
              <option value="pca">PCA Components</option>
            </select>
          </div>

          {/* Attribute Selection (only for raw mode) */}
          {pcaMode === 'raw' && (
            <>
              <div className="control-group">
                <label>X-Axis:</label>
                <select
                  value={xAttribute}
                  onChange={(e) => handleAttributeChange(e.target.value, yAttribute)}
                >
                  {AVAILABLE_ATTRIBUTES.map((attr) => (
                    <option key={attr} value={attr}>
                      {formatAttributeName(attr)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="control-group">
                <label>Y-Axis:</label>
                <select
                  value={yAttribute}
                  onChange={(e) => handleAttributeChange(xAttribute, e.target.value)}
                >
                  {AVAILABLE_ATTRIBUTES.map((attr) => (
                    <option key={attr} value={attr}>
                      {formatAttributeName(attr)}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* Outlier Filter */}
          <div className="control-group">
            <label>
              <input
                type="checkbox"
                checked={filterOutliers}
                onChange={(e) => setFilterOutliers(e.target.checked)}
              />
              Filter Outliers
            </label>
          </div>
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
