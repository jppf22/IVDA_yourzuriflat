/**
 * RangeSlider component with histogram visualization
 * Displays data distribution and allows dragging min/max handles
 */

import { useState, useEffect, useRef } from 'react';
import './RangeSlider.css';

interface RangeSliderProps {
  min: number;
  max: number;
  value: [number, number];
  onChange: (value: [number, number]) => void;
  histogram?: number[];
  label?: string;
  step?: number;
  singleMax?: boolean; // Only show max slider
  logScale?: boolean; // Use logarithmic scale
}

export const RangeSlider = ({
  min,
  max,
  value,
  onChange,
  histogram = [],
  label,
  step = 1,
  singleMax = false,
  logScale = false,
}: RangeSliderProps) => {
  const [isDragging, setIsDragging] = useState<'min' | 'max' | null>(null);
  const [localValue, setLocalValue] = useState(value);
  const sliderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // Helper functions for log scale conversion
  const toLogScale = (value: number): number => {
    if (!logScale || value <= 0) return value;
    return Math.log10(value + 1);
  };

  const fromLogScale = (logValue: number): number => {
    if (!logScale) return logValue;
    return Math.pow(10, logValue) - 1;
  };

  const minLog = toLogScale(min);
  const maxLog = toLogScale(max);

  const handleMouseDown = (handle: 'min' | 'max') => (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(handle);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging || !sliderRef.current) return;

    const rect = sliderRef.current.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    
    let rawValue: number;
    if (logScale) {
      // Use log scale for positioning
      const logValue = minLog + percent * (maxLog - minLog);
      rawValue = fromLogScale(logValue);
    } else {
      // Linear scale
      rawValue = min + percent * (max - min);
    }
    
    const steppedValue = Math.round(rawValue / step) * step;

    setLocalValue((prev) => {
      if (isDragging === 'min') {
        const newMin = Math.min(steppedValue, prev[1]);
        return [newMin, prev[1]];
      } else {
        const newMax = Math.max(steppedValue, prev[0]);
        return [prev[0], newMax];
      }
    });
  };

  const handleMouseUp = () => {
    if (isDragging) {
      onChange(localValue);
      setIsDragging(null);
    }
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, localValue]);

  // Calculate percentages for handle positions using log scale if enabled
  let minPercent: number;
  let maxPercent: number;
  
  if (logScale) {
    const minLogVal = toLogScale(localValue[0]);
    const maxLogVal = toLogScale(localValue[1]);
    minPercent = ((minLogVal - minLog) / (maxLog - minLog)) * 100;
    maxPercent = ((maxLogVal - minLog) / (maxLog - minLog)) * 100;
  } else {
    minPercent = ((localValue[0] - min) / (max - min)) * 100;
    maxPercent = ((localValue[1] - min) / (max - min)) * 100;
  }

  // Normalize histogram for display (max height = 100%)
  const maxHistValue = histogram.length > 0 ? Math.max(...histogram) : 1;
  const normalizedHist = histogram.map((h) => (h / maxHistValue) * 100);

  const formatValue = (val: number) => {
    if (step >= 1) return Math.round(val).toString();
    return val.toFixed(1);
  };

  return (
    <div className="range-slider-container">
      {label && <div className="range-slider-label">{label}</div>}
      
      <div className="range-slider-values">
        <span className="range-value">{singleMax ? 'Max: ' : ''}{formatValue(singleMax ? localValue[1] : localValue[0])}</span>
        {!singleMax && <span className="range-value">{formatValue(localValue[1])}</span>}
      </div>

      <div className="range-slider-wrapper" ref={sliderRef}>
        {/* Histogram bars */}
        <div className="histogram">
          {normalizedHist.map((height, i) => (
            <div
              key={i}
              className="histogram-bar"
              style={{ height: `${height}%` }}
            />
          ))}
        </div>

        {/* Selected range overlay */}
        <div
          className="range-track"
          style={{
            left: singleMax ? '0%' : `${minPercent}%`,
            width: singleMax ? `${maxPercent}%` : `${maxPercent - minPercent}%`,
          }}
        />

        {/* Min handle */}
        {!singleMax && (
          <div
            className="range-handle range-handle-min"
            style={{ left: `${minPercent}%` }}
            onMouseDown={handleMouseDown('min')}
          />
        )}

        {/* Max handle */}
        <div
          className="range-handle range-handle-max"
          style={{ left: `${maxPercent}%` }}
          onMouseDown={handleMouseDown('max')}
        />
      </div>
    </div>
  );
};

export default RangeSlider;
