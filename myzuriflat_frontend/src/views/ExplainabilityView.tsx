/**
 * Explainability View (T3 - Summarize model reasoning)
 * Bar chart showing feature contributions to predicted ratings
 */

import Plot from 'react-plotly.js';
import { useAppStore } from '../store/useAppStore';
import { useExplainability } from '../api/hooks';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ErrorMessage } from '../components/ErrorMessage';
import { CONTRIBUTION_COLORS } from '../utils/colors';
import type { Data, Layout } from 'plotly.js';
import './ExplainabilityView.css';

export const ExplainabilityView = () => {
  const { sessionId, selectedApartmentIds, topRecommendations } = useAppStore();

  // Use selected apartments or top 3 recommendations
  const apartmentIds =
    selectedApartmentIds.length > 0
      ? selectedApartmentIds.slice(0, 3)
      : topRecommendations.slice(0, 3).map((apt) => apt.id);

  const {
    data: explainabilityData,
    isLoading,
    isError,
    refetch,
  } = useExplainability(sessionId, apartmentIds);

  if (isLoading) {
    return (
      <div className="explainability-view">
        <LoadingSpinner message="Computing feature contributions..." />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="explainability-view">
        <ErrorMessage message="Failed to load explainability data" onRetry={() => refetch()} />
      </div>
    );
  }

  if (!explainabilityData || explainabilityData.explanations.length === 0) {
    return (
      <div className="explainability-view">
        <div className="empty-state">
          <p>Rate apartments to see model explanations</p>
        </div>
      </div>
    );
  }

  // Prepare bar chart data
  const traces: Data[] = explainabilityData.explanations.flatMap((explanation) => {
    const positive = explanation.contributions.filter((c) => c.contribution > 0);
    const negative = explanation.contributions.filter((c) => c.contribution < 0);

    const positiveTrace: Data = {
      type: 'bar',
      name: `${explanation.apartment.name.substring(0, 25)} (+)`,
      x: positive.map((c) => c.contribution),
      y: positive.map((c) => c.feature_name),
      orientation: 'h',
      marker: { color: CONTRIBUTION_COLORS.positive },
      text: positive.map((c) => `+${c.contribution.toFixed(2)}`),
      textposition: 'auto',
    };

    const negativeTrace: Data = {
      type: 'bar',
      name: `${explanation.apartment.name.substring(0, 25)} (-)`,
      x: negative.map((c) => c.contribution),
      y: negative.map((c) => c.feature_name),
      orientation: 'h',
      marker: { color: CONTRIBUTION_COLORS.negative },
      text: negative.map((c) => c.contribution.toFixed(2)),
      textposition: 'auto',
    };

    return [positiveTrace, negativeTrace];
  });

  const layout: Partial<Layout> = {
    barmode: 'relative',
    height: 500,
    margin: { t: 40, b: 60, l: 200, r: 40 },
    xaxis: { title: { text: 'Contribution to Predicted Score' }, zeroline: true },
    yaxis: { title: { text: 'Feature' } },
    showlegend: true,
  };

  return (
    <div className="explainability-view">
      <div className="explainability-header">
        <h3>Model Explanation</h3>
        <p className="explainability-subtitle">
          Feature contributions for {explainabilityData.explanations.length} apartment(s)
        </p>
      </div>
      <Plot
        data={traces}
        layout={layout}
        config={{ displayModeBar: true, displaylogo: false }}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
};

export default ExplainabilityView;
