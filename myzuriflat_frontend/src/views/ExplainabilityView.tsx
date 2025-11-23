/**
 * Explainability View (T3 - Summarize model reasoning)
 * Bar chart showing feature contributions to predicted ratings
 */

import React from 'react';
import Plot from 'react-plotly.js';
import type { AxiosError } from 'axios';
import type { Apartment } from '../api/types';
import { useAppStore } from '../store/useAppStore';
import { useExplainability } from '../api/hooks';
import apiClient from '../api/client';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ErrorMessage } from '../components/ErrorMessage';
import { CONTRIBUTION_COLORS } from '../utils/colors';
import type { Data, Layout } from 'plotly.js';
import './ExplainabilityView.css';

export const ExplainabilityView = () => {
  const { sessionId, selectedApartmentIds, topRecommendations } = useAppStore();

  // Use selected apartments or top 3 recommendations
  const apartmentIds:
    | string[]
    | undefined =
    selectedApartmentIds.length > 0
      ? selectedApartmentIds.slice(0, 3)
      : topRecommendations.slice(0, 3).map((apt) => String(apt.id));

  const { data: explainabilityData, isLoading, isError, error, refetch } = useExplainability(
    sessionId,
    apartmentIds
  );

  const modelNotTrained = Boolean(
    (error as AxiosError<{ detail?: string }> | undefined)?.response?.status === 400
  );

  const [apartmentMap, setApartmentMap] = React.useState<Record<number, Apartment | null>>({});

  // fetch apartment metadata for labels (name) for each apartment id returned
  React.useEffect(() => {
    let mounted = true;
    const fetchApts = async () => {
      if (!explainabilityData || !explainabilityData.contributions) return;
      const ids = explainabilityData.contributions.map((c) => c.apartment_id);
      try {
        const pairs = await Promise.all(
          ids.map(async (id) => {
            try {
              const apt = await apiClient.get<Apartment>(`/apartments/${id}`);
              return [id, apt] as const;
            } catch {
              return [id, null] as const;
            }
          })
        );
        if (!mounted) return;
        const map: Record<number, Apartment | null> = {};
        for (const [id, apt] of pairs) {
          map[id as number] = apt;
        }
        setApartmentMap(map);
      } catch {
        // ignore
      }
    };
    fetchApts();
    return () => {
      mounted = false;
    };
  }, [explainabilityData]);

  if (isLoading) {
    return (
      <div className="explainability-view">
        <LoadingSpinner message="Computing feature contributions..." />
      </div>
    );
  }

  if (modelNotTrained) {
    return (
      <div className="explainability-view">
        <div className="empty-state">
          <p>Model not trained yet. Rate more apartments to unlock explanations.</p>
        </div>
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

  if (!explainabilityData || !explainabilityData.contributions || explainabilityData.contributions.length === 0) {
    return (
      <div className="explainability-view">
        <div className="empty-state">
          <p>Rate apartments to see model explanations</p>
        </div>
      </div>
    );
  }

  // Prepare bar chart data from numeric contributions and feature names
  const featureNames = explainabilityData.coefficients.feature_names;
  const traces: Data[] = explainabilityData.contributions.flatMap((entry) => {
    const apt = apartmentMap[entry.apartment_id];
    const aptLabel = apt && apt.name ? `${apt.name.substring(0, 25)}` : `id:${entry.apartment_id}`;
    const pairs = featureNames.map((fname, idx) => ({ feature_name: fname, contribution: entry.contributions[idx] || 0 }));
    const positive = pairs.filter((c) => c.contribution > 0);
    const negative = pairs.filter((c) => c.contribution < 0);

    const positiveTrace: Data = {
      type: 'bar',
      name: `${aptLabel} (+)`,
      x: positive.map((c) => c.contribution),
      y: positive.map((c) => c.feature_name),
      orientation: 'h',
      marker: { color: CONTRIBUTION_COLORS.positive },
      text: positive.map((c) => `+${c.contribution.toFixed(2)}`),
      textposition: 'auto',
    };

    const negativeTrace: Data = {
      type: 'bar',
      name: `${aptLabel} (-)`,
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
          Feature contributions for {explainabilityData.contributions.length} apartment(s)
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
