/**
 * Rating control component - star rating interface
 * Supports T4 (calibration) by collecting user ratings
 */

import { useState } from 'react';
import './RatingControl.css';

interface RatingControlProps {
  apartmentId: string;
  currentRating?: number;
  maxRating?: number;
  onRate: (rating: number) => void;
  disabled?: boolean;
  size?: 'small' | 'medium' | 'large';
}

export const RatingControl = ({
  apartmentId,
  currentRating,
  maxRating = 5,
  onRate,
  disabled = false,
  size = 'medium',
}: RatingControlProps) => {
  const [hoverRating, setHoverRating] = useState<number | null>(null);

  const handleClick = (rating: number) => {
    if (!disabled) {
      onRate(rating);
    }
  };

  const handleMouseEnter = (rating: number) => {
    if (!disabled) {
      setHoverRating(rating);
    }
  };

  const handleMouseLeave = () => {
    setHoverRating(null);
  };

  const displayRating = hoverRating ?? currentRating ?? 0;

  return (
    <div className={`rating-control ${size} ${disabled ? 'disabled' : ''}`}>
      <div className="stars">
        {Array.from({ length: maxRating }, (_, index) => {
          const rating = index + 1;
          const isFilled = rating <= displayRating;

          return (
            <span
              key={`${apartmentId}-star-${rating}`}
              className={`star ${isFilled ? 'filled' : 'empty'}`}
              onClick={() => handleClick(rating)}
              onMouseEnter={() => handleMouseEnter(rating)}
              onMouseLeave={handleMouseLeave}
              role="button"
              tabIndex={disabled ? -1 : 0}
              aria-label={`Rate ${rating} out of ${maxRating}`}
            >
              {isFilled ? '★' : '☆'}
            </span>
          );
        })}
      </div>
      {currentRating !== undefined && currentRating > 0 && (
        <span className="rating-value">
          {currentRating}/{maxRating}
        </span>
      )}
    </div>
  );
};

export default RatingControl;
