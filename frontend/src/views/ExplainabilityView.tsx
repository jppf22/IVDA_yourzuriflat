/**
 * Explainability View (T3 - Summarize model reasoning)
 * Bar chart showing feature contributions to predicted ratings
 * Includes before/after model comparison toggle
 */

import React from 'react';
import Plot from 'react-plotly.js';
import type { AxiosError } from 'axios';
import type { Apartment } from '../api/types';
import { useAppStore } from '../store/useAppStore';
import { useExplainability, useSnapshots } from '../api/hooks';
import apiClient from '../api/client';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ErrorMessage } from '../components/ErrorMessage';
import { CONTRIBUTION_COLORS, TOP_COLORS, getTopColor } from '../utils/colors';
import type { Data, Layout } from 'plotly.js';
import './ExplainabilityView.css';

export const ExplainabilityView = () => {
  const { sessionId, selectedApartmentIds, topRecommendations, ratingsCount } = useAppStore();

  // State for before/after comparison
  const [showComparison, setShowComparison] = React.useState(false);
  const [selectedSnapshot, setSelectedSnapshot] = React.useState<number | null>(null);
  
  // State for number of apartments to display
  const [maxApartments, setMaxApartments] = React.useState(3);

  // Check if model is ready (5+ ratings)
  const isModelReady = ratingsCount >= 5;
  
  // Fetch snapshots for comparison
  const { data: snapshotsData } = useSnapshots(sessionId, isModelReady && showComparison);

  // Use selected apartments or top N recommendations based on maxApartments
  // Return undefined if no apartments available or model not ready
  const apartmentIds: string[] | undefined = React.useMemo(() => {
    if (!isModelReady) return undefined;
    
    if (selectedApartmentIds.length > 0) {
      return selectedApartmentIds.slice(0, maxApartments);
    }
    
    const topIds = topRecommendations.slice(0, maxApartments).map((apt) => String(apt.id));
    return topIds.length > 0 ? topIds : undefined;
  }, [selectedApartmentIds, topRecommendations, isModelReady, maxApartments]);

  const { data: explainabilityData, isLoading, isError, error, refetch } = useExplainability(
    sessionId,
    apartmentIds,
    isModelReady
  );

  const modelNotTrained = Boolean(
    (error as AxiosError<{ detail?: string }> | undefined)?.response?.status === 400
  );

  const [apartmentMap, setApartmentMap] = React.useState<Record<string, Apartment | null>>({});

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
              // Ensure ID is a string and properly formatted
              const idStr = String(id);
              const apt = await apiClient.get<Apartment>(`/apartments/${idStr}`);
              return [id, apt] as const;
            } catch (err) {
              console.error(`Failed to fetch apartment ${id}:`, err);
              return [id, null] as const;
            }
          })
        );
        if (!mounted) return;
        const map: Record<string, Apartment | null> = {};
        for (const [id, apt] of pairs) {
          map[String(id)] = apt;
        }
        setApartmentMap(map);
      } catch (err) {
        console.error('Error fetching apartments:', err);
      }
    };
    fetchApts();
    return () => {
      mounted = false;
    };
  }, [explainabilityData]);

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
  const topRecommendationIds = topRecommendations.map((apt) => apt.id);
  
  const traces: Data[] = explainabilityData.contributions.flatMap((entry, aptIndex) => {
    const apt = apartmentMap[String(entry.apartment_id)];
    const aptLabel = apt && apt.name ? `${apt.name.substring(0, 25)}` : `id:${entry.apartment_id}`;
    
    // Get color for this apartment based on its rank in recommendations
    const apartmentColor = getTopColor(topRecommendationIds.indexOf(entry.apartment_id));
    
    // Get all contributions with feature names
    const allPairs = featureNames.map((fname, idx) => ({ 
      feature_name: fname, 
      contribution: entry.contributions[idx] || 0 
    }));
    
    // Sort by absolute contribution and take top 12
    const sortedPairs = allPairs
      .filter(p => Math.abs(p.contribution) > 0.001) // Filter out near-zero contributions
      .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
      .slice(0, 12);
    
    // Split into positive and negative
    const positive = sortedPairs.filter((c) => c.contribution > 0);
    const negative = sortedPairs.filter((c) => c.contribution < 0);

    const positiveTrace: Data = {
      type: 'bar',
      name: `${aptLabel}`,
      x: positive.map((c) => c.contribution),
      y: positive.map((c) => c.feature_name),
      orientation: 'h',
      marker: { 
        color: apartmentColor,
        opacity: 0.85,
        line: { 
          color: apartmentColor, 
          width: 2 
        },
        pattern: {
          shape: '',  // Solid fill for positive
        }
      },
      text: positive.map((c) => `+${c.contribution.toFixed(3)}`),
      textposition: 'auto',
      hovertemplate: `<b>${aptLabel}</b><br>%{y}<br>Contribution: +%{x:.3f}<br><extra></extra>`,
      legendgroup: `apt${aptIndex}`,
      showlegend: true,
    };

    const negativeTrace: Data = {
      type: 'bar',
      name: `${aptLabel} (negative)`,
      x: negative.map((c) => c.contribution),
      y: negative.map((c) => c.feature_name),
      orientation: 'h',
      marker: { 
        color: apartmentColor,
        opacity: 0.45,  // Lower opacity for negative contributions
        line: { 
          color: apartmentColor, 
          width: 2,
        },
        pattern: {
          shape: '/',  // Diagonal lines for negative
          size: 4,
          solidity: 0.3,
        }
      },
      text: negative.map((c) => c.contribution.toFixed(3)),
      textposition: 'auto',
      hovertemplate: `<b>${aptLabel}</b><br>%{y}<br>Contribution: %{x:.3f}<br><extra></extra>`,
      legendgroup: `apt${aptIndex}`,
      showlegend: false,  // Don't show negative in legend to reduce clutter
    };

    return [positiveTrace, negativeTrace];
  });

  // Calculate x-axis range based on actual contribution values
  const allContributions = traces.flatMap((trace) => (trace.x as number[]) || []);
  const minContrib = Math.min(...allContributions, 0);
  const maxContrib = Math.max(...allContributions, 0);
  const xRange = Math.max(Math.abs(minContrib), Math.abs(maxContrib));
  const xAxisRange: [number, number] = [-xRange * 1.1, xRange * 1.1];

  // Count unique features to calculate dynamic height
  const uniqueFeatures = new Set(traces.flatMap((trace) => (trace.y as string[]) || []));
  const featureCount = uniqueFeatures.size;
  // Dynamic height: 40px per feature + base margins (min 400px, max 900px)
  const dynamicHeight = Math.max(400, Math.min(900, featureCount * 40 + 150));

  const layout: Partial<Layout> = {
    barmode: 'relative',
    height: dynamicHeight,
    margin: { t: 40, b: 60, l: 280, r: 120 },  // Increased right margin for long bars with labels
    xaxis: { 
      title: { text: 'Contribution to Predicted Score' }, 
      zeroline: true,
      range: xAxisRange,
      tickformat: '.2f',
      automargin: true  // Auto-adjust margin for axis labels
    },
    yaxis: { 
      title: { 
        text: 'Feature',
        standoff: 20
      },
      automargin: true  // Auto-adjust margin for long labels
    },
    showlegend: true,
  };

  // Determine if comparison is available
  const hasSnapshots = snapshotsData && snapshotsData.available_thresholds.length > 0;
  const canCompare = ratingsCount > 5 && hasSnapshots;

  return (
    <div className="explainability-view">
      <div className="explainability-header">
        <h3>Your Preferences</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '8px', flexWrap: 'wrap' }}>
          <p className="explainability-subtitle" style={{ margin: 0 }}>
            Feature contributions for {explainabilityData.contributions.length} apartment(s)
          </p>
          
          {/* Apartment count selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontSize: '0.9em', fontWeight: 500, color: '#495057' }}>
              Show:
            </label>
            <select
              value={maxApartments}
              onChange={(e) => setMaxApartments(Number(e.target.value))}
              style={{
                padding: '4px 8px',
                borderRadius: '4px',
                border: '1px solid #ced4da',
                backgroundColor: 'white',
                fontSize: '0.9em',
                cursor: 'pointer',
              }}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n} apartment{n > 1 ? 's' : ''}
                </option>
              ))}
            </select>
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
          <div style={{ 
            padding: '12px', 
            backgroundColor: '#e7f3ff', 
            borderRadius: '6px', 
            marginBottom: '12px',
            border: '1px solid #bee5eb',
            fontSize: '0.9em'
          }}>
            <strong>📊 How to Read This Chart:</strong>
            <ul style={{ marginTop: '6px', marginBottom: '0', paddingLeft: '20px' }}>
              <li><strong>Solid bars</strong> = Features that <em>increase</em> the recommendation score (aligned with your preferences)</li>
              <li><strong>Patterned bars (diagonal lines)</strong> = Features that <em>decrease</em> the score (misaligned with your preferences)</li>
              <li>Each apartment uses its <strong>recommendation rank color</strong> (same as other views)</li>
              <li>Longer bars = stronger influence on the recommendation</li>
            </ul>
          </div>
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
