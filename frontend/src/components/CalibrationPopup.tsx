/**
 * CalibrationPopup component
 * Cold-start overlay that shows 5 diverse apartments for initial rating
 * User must rate ONE apartment to close popup and start using the system
 */

import { useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useApartmentDetail } from '../api/hooks';
import { useRateMutation } from '../api/hooks';
import { RatingControl } from './RatingControl';
import { formatPrice } from '../utils/formatting';
import './CalibrationPopup.css';

// Five most diverse apartments from farthest-point PCA analysis
// Covers extreme price ranges, room types, and property types
const DIVERSE_APARTMENT_IDS = [
  '1335415072851654786',  // Detached house - $153, entire home, 5 bedrooms
  '41918871',              // Popup Hotel - $122, private room in hotel
  '1394246341800020789',  // 3BR Apartment - $160, entire home with balcony
  '1159313067199212228',  // Luxury lakefront - $6662, entire home (luxury!)
  '14781925'              // Quiet room - $85, private room in rental unit
];

interface ApartmentCardProps {
  apartmentId: string;
  rating: number | null;
  onRate: (apartmentId: string, rating: number) => void;
  disabled: boolean;
}

const ApartmentCard = ({ apartmentId, rating, onRate, disabled }: ApartmentCardProps) => {
  const { data: apartment, isLoading, error } = useApartmentDetail(apartmentId);

  if (isLoading) {
    return (
      <div className="calibration-apartment-card">
        <div className="loading-message" style={{ padding: '2rem', textAlign: 'center' }}>
          Loading...
        </div>
      </div>
    );
  }

  if (error || !apartment) {
    return (
      <div className="calibration-apartment-card">
        <div className="error-message" style={{ padding: '1rem' }}>
          Failed to load apartment
        </div>
      </div>
    );
  }

  // Parse amenities
  let amenitiesList: string[] = [];
  if (apartment.amenities) {
    try {
      if (typeof apartment.amenities === 'string') {
        amenitiesList = JSON.parse(apartment.amenities);
      } else if (Array.isArray(apartment.amenities)) {
        amenitiesList = apartment.amenities;
      }
    } catch {
      amenitiesList = [];
    }
  }

  const topAmenities = amenitiesList.slice(0, 3);

  return (
    <div className={`calibration-apartment-card ${rating ? 'has-rating' : ''}`}>
      <h3>{apartment.name}</h3>

      <div className="apartment-details">
        <div className="detail-row">
          <span className="label">Price:</span>
          <span className="value highlight">{formatPrice(apartment.price)}/night</span>
        </div>

        <div className="detail-row">
          <span className="label">Type:</span>
          <span className="value">{apartment.room_type}</span>
        </div>

        <div className="detail-row">
          <span className="label">Capacity:</span>
          <span className="value">
            {apartment.accommodates} guests, {apartment.bedrooms || 0} BR
          </span>
        </div>

        {topAmenities.length > 0 && (
          <div className="detail-row">
            <span className="label">Amenities:</span>
            <div className="amenities-preview">
              {topAmenities.map((amenity, idx) => (
                <span key={idx} className="amenity-tag">
                  {amenity}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="rating-section">
        <h4>Rate this apartment</h4>
        <div className="rating-wrapper">
          <RatingControl
            apartmentId={apartment.id}
            currentRating={rating || undefined}
            onRate={(newRating) => onRate(apartmentId, newRating)}
            size="medium"
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  );
};

export const CalibrationPopup = () => {
  const { 
    sessionId, 
    ratingsCount,
    userRatings,
    setUserRating,
    setCalibrationComplete,
  } = useAppStore();

  // Track ratings for all 5 apartments (apartmentId -> rating)
  const [apartmentRatings, setApartmentRatings] = useState<Record<string, number>>({});
  
  // Rating mutation
  const submitRatingMutation = useRateMutation();

  // Only show popup if user has 0 ratings
  const shouldShow = ratingsCount === 0;

  useEffect(() => {
    // Prevent body scroll when popup is open
    if (shouldShow) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [shouldShow]);

  const handleRate = (apartmentId: string, rating: number) => {
    setApartmentRatings(prev => ({
      ...prev,
      [apartmentId]: rating
    }));
  };

  const handleSubmit = async () => {
    // Find which apartments have ratings > 0
    const ratedApartments = Object.entries(apartmentRatings).filter(([, rating]) => rating > 0);

    if (ratedApartments.length === 0) {
      return;
    }

    // Guard against double-counting if calibration is revisited:
    // skip apartments that are already in userRatings with the same value
    const distinctNewRatings = ratedApartments.filter(([apartmentId, rating]) => {
      const existing = userRatings[apartmentId];
      return existing === undefined || existing !== rating;
    });

    if (distinctNewRatings.length === 0) {
      return;
    }

    // Update local store for all newly rated apartments (updates ratingsCount automatically)
    distinctNewRatings.forEach(([apartmentId, rating]) => {
      setUserRating(apartmentId, rating);
    });

    try {
      // Submit all new ratings to backend in parallel
      await Promise.all(
        distinctNewRatings.map(([apartmentId, rating]) =>
          submitRatingMutation.mutateAsync({
            session_id: sessionId,
            apartment_id: apartmentId,
            rating,
          })
        )
      );
      // Mark calibration as complete explicitly so popup closes immediately
      setCalibrationComplete(true);
    } catch (err) {
      console.error('Failed to submit one or more calibration ratings:', err);
      // Local store is already updated, so ratings stay in the UI even if backend fails
      setCalibrationComplete(true);
    }
  };

  if (!shouldShow) {
    return null;
  }

  const hasAnyRating = Object.values(apartmentRatings).some(r => r > 0);

  return (
    <div className="calibration-overlay" onClick={(e) => e.stopPropagation()}>
      <div className="calibration-popup" onClick={(e) => e.stopPropagation()}>
        <h2>🎯 Welcome to YourZuriFlat!</h2>
        <p className="subtitle">
          To get started, please rate <strong>at least ONE</strong> of these diverse apartments. 
          This helps our recommendation system understand your preferences!
        </p>

        <div className="apartments-grid">
          {DIVERSE_APARTMENT_IDS.map((apartmentId) => (
            <ApartmentCard
              key={apartmentId}
              apartmentId={apartmentId}
              rating={apartmentRatings[apartmentId] || null}
              onRate={handleRate}
              disabled={submitRatingMutation.isPending}
            />
          ))}
        </div>

        {hasAnyRating && (
          <div className="submit-instructions">
            <p>✓ Great! Click "Continue" to start exploring apartments</p>
          </div>
        )}

        <div className="calibration-actions">
          <button 
            className="btn-submit" 
            onClick={handleSubmit}
            disabled={!hasAnyRating || submitRatingMutation.isPending}
          >
            {submitRatingMutation.isPending ? 'Submitting...' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CalibrationPopup;
