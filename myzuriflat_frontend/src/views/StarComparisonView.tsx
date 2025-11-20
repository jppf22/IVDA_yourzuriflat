/**
 * Star Comparison View (T2 - Compare apartments by attributes)
 * Radar chart comparing up to 5 apartments on normalized attributes
 */

import Plot from 'react-plotly.js';
import { useAppStore } from '../store/useAppStore';
import { getColorForApartment } from '../utils/colors';
import { formatAttributeName } from '../utils/formatting';
import type { Data, Layout } from 'plotly.js';
import './StarComparisonView.css';

export const StarComparisonView = () => {
  const { selectedApartmentIds, topRecommendations } = useAppStore();

  // Use selected apartments or top recommendations
  const apartmentsToCompare =
    selectedApartmentIds.length > 0
      ? topRecommendations.filter((apt) => selectedApartmentIds.includes(apt.id)).slice(0, 5)
      : topRecommendations.slice(0, 5);

  const topRecommendationIds = topRecommendations.map((apt) => apt.id);

  if (apartmentsToCompare.length === 0) {
    return (
      <div className="star-comparison-view">
        <div className="empty-state">
          <p>Select apartments or rate some to see comparison</p>
        </div>
      </div>
    );
  }

  // Attributes to compare (normalized 0-1)
  const attributes = [
    'price',
    'distance_from_center',
    'number_of_reviews',
    'availability_365',
    'minimum_nights',
  ];

  // Create radar chart traces
  const traces: Data[] = apartmentsToCompare.map((apt) => {
    const color = getColorForApartment(apt.id, topRecommendationIds);

    // Normalize values (simplified - should use actual min/max from dataset)
    const values = [
      1 - Math.min(apt.price / 1000, 1), // Inverse price (lower is better)
      1 - Math.min(apt.distance_from_center / 10, 1), // Inverse distance
      Math.min(apt.number_of_reviews / 100, 1),
      Math.min(apt.availability_365 / 365, 1),
      1 - Math.min(apt.minimum_nights / 30, 1), // Inverse min nights
    ];

    return {
      type: 'scatterpolar',
      r: [...values, values[0]], // Close the radar
      theta: [...attributes.map(formatAttributeName), formatAttributeName(attributes[0])],
      fill: 'toself',
      name: apt.name.substring(0, 30),
      line: { color },
      fillcolor: color,
      opacity: 0.3,
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

  return (
    <div className="star-comparison-view">
      <div className="comparison-header">
        <h3>Apartment Comparison</h3>
        <p className="comparison-subtitle">Comparing {apartmentsToCompare.length} apartments</p>
      </div>
      <Plot
        data={traces}
        layout={layout}
        config={{ displayModeBar: false, displaylogo: false }}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
};

export default StarComparisonView;
