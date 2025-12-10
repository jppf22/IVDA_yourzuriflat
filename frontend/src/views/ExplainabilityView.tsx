/**
 * Explainability View (T3 - Summarize model reasoning)
 * Bar chart showing feature contributions to predicted ratings
 * Includes before/after model comparison toggle
 */

import React from 'react';
import Plot from 'react-plotly.js';
import type { AxiosError } from 'axios';
import { useAppStore } from '../store/useAppStore';
import { useExplainability, useSnapshots } from '../api/hooks';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ErrorMessage } from '../components/ErrorMessage';
import type { Data, Layout } from 'plotly.js';
import './ExplainabilityView.css';

export const ExplainabilityView = () => {
  const { sessionId, ratingsCount } = useAppStore();

  // State for before/after comparison (model evolution)
  const [showComparison, setShowComparison] = React.useState(false);
  const [selectedSnapshot, setSelectedSnapshot] = React.useState<number | null>(null);
  const [showAllFeatures, setShowAllFeatures] = React.useState(false);
  const [visibleGroup, setVisibleGroup] = React.useState<'both' | 'positive' | 'negative'>('both');

  // Check if model is ready (5+ ratings)
  const isModelReady = ratingsCount >= 5;
  
  // Fetch snapshots for comparison
  const { data: snapshotsData } = useSnapshots(sessionId, isModelReady && showComparison);

  // Fetch explainability based on user vector (coefficients only)
  const { data: explainabilityData, isLoading, isError, error, refetch } = useExplainability(
    sessionId,
    undefined,
    isModelReady
  );

  const modelNotTrained = Boolean(
    (error as AxiosError<{ detail?: string }> | undefined)?.response?.status === 400
  );

  // Show calibration message if model not ready
  if (!isModelReady) {
    return (
      <div className="explainability-view">
        <div className="empty-state">
          <h3>🎯 Model Calibration Needed</h3>
          <p>Rate at least 5 apartments to train the model and see feature explanations.</p>
          <p className="progress-text">Current ratings: {ratingsCount}/5</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="explainability-view">
        <LoadingSpinner message="Computing your preference profile..." />
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

  if (!explainabilityData || !explainabilityData.coefficients || !explainabilityData.coefficients.feature_names?.length) {
    return (
      <div className="explainability-view">
        <div className="empty-state">
          <p>Rate apartments to see your learned preference profile.</p>
        </div>
      </div>
    );
  }
  // Build user preference profile from coefficients
  const featureNames = explainabilityData.coefficients.feature_names;
  const coeffs = explainabilityData.coefficients.coef;

  const allPairs = featureNames.map((name, idx) => ({
    feature_name: name,
    weight: coeffs[idx] ?? 0,
  }));

  // Focus on most important preferences by absolute weight
  const significant = allPairs
    .filter((p) => Math.abs(p.weight) > 0.001)
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));

  // By default show top 10 by absolute weight (regardless of sign)
  const displayedPairs = showAllFeatures ? significant : significant.slice(0, 10);

  const positive = displayedPairs.filter((p) => p.weight > 0);
  const negative = displayedPairs.filter((p) => p.weight < 0);

  const positiveTrace: Data = {
    type: 'bar',
    name: 'Preferred features',
    x: positive.map((p) => Math.abs(p.weight)),
    y: positive.map((p) => p.feature_name.slice(5).replace(/_/g, " ")),
    orientation: 'h',
    marker: {
      color: '#2b8a3e',
      opacity: 0.9,
    },
    //text: positive.map((p) => `+${p.weight.toFixed(3)}`),
    textposition: 'auto',
    hovertemplate: '<b>%{y}</b><br>Weight: +%{x:.3f}<extra></extra>',
    showlegend: false,
  };

  const negativeTrace: Data = {
    type: 'bar',
    name: 'Less preferred features',
    x: negative.map((p) => Math.abs(p.weight)),
    y: negative.map((p) => p.feature_name.slice(5).replace(/_/g, " ")),
    orientation: 'h',
    marker: {
      color: '#e03131',
      opacity: 0.8,
    },
    //text: negative.map((p) => p.weight.toFixed(3)),
    textposition: 'auto',
    hovertemplate: '<b>%{y}</b><br>Weight: -%{x:.3f}<extra></extra>',
    showlegend: false,
  };
  // Control which feature groups are visible using a custom caption,
  // mimicking Plotly's legend isolate behavior (no hooks here to
  // keep hook ordering stable across early returns above).
  const traces: Data[] =
    visibleGroup === 'positive'
      ? [positiveTrace]
      : visibleGroup === 'negative'
      ? [negativeTrace]
      : [positiveTrace, negativeTrace];

  const allWeights = coeffs.length ? coeffs : [0];
  const minWeight = Math.min(...allWeights, 0);
  const maxWeight = Math.max(...allWeights, 0);
  const maxAbs = Math.max(Math.abs(minWeight), Math.abs(maxWeight));
  const xAxisRange: [number, number] = [0, maxAbs * 1.1];

  const featureCount = displayedPairs.length || featureNames.length;
  const dynamicHeight = Math.max(400, Math.min(900, featureCount * 30 + 150));

  const layout: Partial<Layout> = {
    barmode: 'relative',
    height: dynamicHeight,
    margin: { t: 40, b: 60, l: 280, r: 120 },
    xaxis: {
      title: { text: 'Preference Weight (user vector)' },
      zeroline: true,
      range: xAxisRange,
      tickformat: '.2f',
      automargin: true,
    },
    yaxis: {
      title: {
        text: 'Feature',
        standoff: 20,
      },
      automargin: true,
    },
    showlegend: false,
  };

  // Determine if comparison is available
  const hasSnapshots = snapshotsData && snapshotsData.available_thresholds.length > 0;
  const canCompare = ratingsCount > 5 && hasSnapshots;

  const handleToggleGroup = (group: 'positive' | 'negative') => {
    setVisibleGroup((prev) => {
      if (prev === 'both') return group; // isolate clicked group
      if (prev === group) return 'both'; // show both again
      // if the other group was isolated, switch isolation to this one
      return group;
    });
  };

  return (
    <div className="explainability-view">
      <div className="explainability-header">
        <h3>Your Preferences</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '8px', flexWrap: 'wrap' }}>
          <p className="explainability-subtitle" style={{ margin: 0 }}>
            Learned feature weights after {ratingsCount} ratings
          </p>

          {significant.length > 10 && (
            <button
              type="button"
              onClick={() => setShowAllFeatures((prev) => !prev)}
              style={{
                padding: '4px 10px',
                borderRadius: '4px',
                border: '1px solid #ced4da',
                backgroundColor: showAllFeatures ? '#e7f3ff' : 'white',
                cursor: 'pointer',
                fontSize: '0.85em',
              }}
            >
              {showAllFeatures ? 'Show top 10 only' : `Show all (${significant.length})`}
            </button>
          )}

          {/* Custom legend-style caption with toggle behavior */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85em' }}>
            <span style={{ color: '#6b7280' }}>Legend:</span>
            <button
              type="button"
              onClick={() => handleToggleGroup('positive')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '2px 8px',
                borderRadius: '4px',
                border: visibleGroup === 'positive' || visibleGroup === 'both' ? '1px solid #2b8a3e' : '1px solid #ced4da',
                backgroundColor: visibleGroup === 'positive' ? '#e6f4ea' : 'white',
                cursor: 'pointer',
              }}
            >
              <span style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: '#2b8a3e' }} />
              <span>Preferred</span>
            </button>
            <button
              type="button"
              onClick={() => handleToggleGroup('negative')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '2px 8px',
                borderRadius: '4px',
                border: visibleGroup === 'negative' || visibleGroup === 'both' ? '1px solid #e03131' : '1px solid #ced4da',
                backgroundColor: visibleGroup === 'negative' ? '#fde2e2' : 'white',
                cursor: 'pointer',
              }}
            >
              <span style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: '#e03131' }} />
              <span>Less preferred</span>
            </button>
          </div>

          {canCompare && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={showComparison}
                  onChange={(e) => {
                    setShowComparison(e.target.checked);
                    if (!e.target.checked) setSelectedSnapshot(null);
                  }}
                />
                <span style={{ fontSize: '0.9em', fontWeight: 500 }}>
                  📊 Show Model Evolution
                </span>
              </label>
            </div>
          )}
        </div>
      </div>
      
      {showComparison && hasSnapshots && (
        <div style={{ 
          padding: '12px', 
          backgroundColor: '#f8f9fa', 
          borderRadius: '6px', 
          marginBottom: '12px',
          border: '1px solid #dee2e6'
        }}>
          <div style={{ marginBottom: '8px', fontWeight: 600, color: '#495057' }}>
            🕒 Compare with Earlier Model State:
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              onClick={() => setSelectedSnapshot(null)}
              style={{
                padding: '6px 12px',
                borderRadius: '4px',
                border: selectedSnapshot === null ? '2px solid #007bff' : '1px solid #ced4da',
                backgroundColor: selectedSnapshot === null ? '#e7f3ff' : 'white',
                cursor: 'pointer',
                fontWeight: selectedSnapshot === null ? 600 : 400,
                fontSize: '0.85em'
              }}
            >
              Current ({ratingsCount} ratings)
            </button>
            {snapshotsData.snapshots.map((snapshot) => (
              <button
                key={snapshot.threshold}
                onClick={() => setSelectedSnapshot(snapshot.threshold)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '4px',
                  border: selectedSnapshot === snapshot.threshold ? '2px solid #007bff' : '1px solid #ced4da',
                  backgroundColor: selectedSnapshot === snapshot.threshold ? '#e7f3ff' : 'white',
                  cursor: 'pointer',
                  fontWeight: selectedSnapshot === snapshot.threshold ? 600 : 400,
                  fontSize: '0.85em'
                }}
              >
                After {snapshot.ratings_count} rating{snapshot.ratings_count > 1 ? 's' : ''}
              </button>
            ))}
          </div>
          {selectedSnapshot !== null && (
            <div style={{ 
              marginTop: '12px', 
              padding: '10px', 
              backgroundColor: '#fff3cd', 
              borderRadius: '4px',
              fontSize: '0.85em',
              color: '#856404'
            }}>
              <strong>ℹ️ Snapshot View:</strong> Showing top recommendations as they were after {selectedSnapshot} rating{selectedSnapshot > 1 ? 's' : ''}. 
              Compare with current model to see how your preferences evolved.
            </div>
          )}
        </div>
      )}
      
      {selectedSnapshot !== null && hasSnapshots ? (
        <SnapshotComparisonView 
          sessionId={sessionId}
          currentRatingsCount={ratingsCount}
          snapshotThreshold={selectedSnapshot}
          snapshotsData={snapshotsData}
        />
      ) : (
        <div className="explainability-content">
          <div className="chart-container">
            <Plot
              data={traces}
              layout={layout}
              config={{ displayModeBar: true, displaylogo: false }}
              style={{ width: '100%', height: '100%' }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

// Snapshot comparison component
const SnapshotComparisonView = ({ 
  sessionId, 
  currentRatingsCount,
  snapshotThreshold,
  snapshotsData 
}: { 
  sessionId: string;
  currentRatingsCount: number;
  snapshotThreshold: number;
  snapshotsData: any;
}) => {
  const [snapshotApartments, setSnapshotApartments] = React.useState<Record<string, Apartment | null>>({});
  const [currentApartments, setCurrentApartments] = React.useState<Record<string, Apartment | null>>({});
  
  const snapshot = snapshotsData.snapshots.find((s: any) => s.threshold === snapshotThreshold);
  const { topRecommendations } = useAppStore();
  
  // Fetch apartment details for snapshot
  React.useEffect(() => {
    if (!snapshot) return;
    
    const fetchApartments = async () => {
      const snapshotIds = snapshot.top_recommendations.slice(0, 5).map((r: any) => r.apartment_id);
      const currentIds = topRecommendations.slice(0, 5).map((apt) => String(apt.id));
      
      try {
        const snapshotPairs = await Promise.all(
          snapshotIds.map(async (id: string) => {
            try {
              const apt = await apiClient.get<Apartment>(`/apartments/${id}`);
              return [id, apt] as const;
            } catch {
              return [id, null] as const;
            }
          })
        );
        
        const currentPairs = await Promise.all(
          currentIds.map(async (id: string) => {
            try {
              const apt = await apiClient.get<Apartment>(`/apartments/${id}`);
              return [id, apt] as const;
            } catch {
              return [id, null] as const;
            }
          })
        );
        
        setSnapshotApartments(Object.fromEntries(snapshotPairs));
        setCurrentApartments(Object.fromEntries(currentPairs));
      } catch (err) {
        console.error('Error fetching apartments:', err);
      }
    };
    
    fetchApartments();
  }, [snapshot, topRecommendations]);
  
  if (!snapshot) return <div>Snapshot not found</div>;
  
  const snapshotTop5 = snapshot.top_recommendations.slice(0, 5);
  const currentTop5 = topRecommendations.slice(0, 5);
  
  return (
    <div style={{ padding: '16px' }}>
      <h4 style={{ marginTop: 0, marginBottom: '16px', color: '#495057' }}>
        Top 5 Recommendations Comparison
      </h4>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        {/* Snapshot column */}
        <div style={{ 
          border: '2px solid #ffc107', 
          borderRadius: '8px', 
          padding: '12px',
          backgroundColor: '#fffbf0'
        }}>
          <h5 style={{ marginTop: 0, color: '#856404' }}>
            📸 After {snapshotThreshold} Rating{snapshotThreshold > 1 ? 's' : ''}
          </h5>
          <ol style={{ paddingLeft: '20px', margin: 0 }}>
            {snapshotTop5.map((rec: any, idx: number) => {
              const apt = snapshotApartments[rec.apartment_id];
              return (
                <li key={rec.apartment_id} style={{ marginBottom: '8px', fontSize: '0.9em' }}>
                  {apt ? apt.name.substring(0, 40) : `ID: ${rec.apartment_id}`}
                  <div style={{ fontSize: '0.85em', color: '#6c757d' }}>
                    Score: {rec.score.toFixed(3)}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
        
        {/* Current column */}
        <div style={{ 
          border: '2px solid #28a745', 
          borderRadius: '8px', 
          padding: '12px',
          backgroundColor: '#f0fff4'
        }}>
          <h5 style={{ marginTop: 0, color: '#155724' }}>
            🎯 Current ({currentRatingsCount} Ratings)
          </h5>
          <ol style={{ paddingLeft: '20px', margin: 0 }}>
            {currentTop5.map((apt, idx) => (
              <li key={apt.id} style={{ marginBottom: '8px', fontSize: '0.9em' }}>
                {apt.name.substring(0, 40)}
                <div style={{ fontSize: '0.85em', color: '#6c757d' }}>
                  {/* Score not available in topRecommendations, just show name */}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
      <div style={{ 
        marginTop: '16px', 
        padding: '12px', 
        backgroundColor: '#e7f3ff', 
        borderRadius: '6px',
        fontSize: '0.9em',
        color: '#004085'
      }}>
        <strong>💡 Insight:</strong> As you rate more apartments, the model learns your preferences and refines recommendations. 
        Compare the lists to see how your taste profile evolved!
      </div>
    </div>
  );
};

export default ExplainabilityView;