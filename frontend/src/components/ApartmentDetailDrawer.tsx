/**
 * Apartment Detail Drawer
 * Shows full information for a selected apartment with rating controls
 * Supports T4 (calibration) and detail-on-demand interaction
 */

import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { MouseEvent } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useApartmentDetail } from '../api/hooks';
import { RatingControl } from './RatingControl';
import { LoadingSpinner } from './LoadingSpinner';
import { ErrorMessage } from './ErrorMessage';
import {
  formatPrice,
  formatDistance,
  formatDate,
  formatRoomType,
  formatNumber,
  parseAmenities,
  formatAmenities,
  formatNeighbourhood,
} from '../utils/formatting';
import './ApartmentDetailDrawer.css';

interface ApartmentDetailDrawerProps {
  onRate: (apartmentId: string, rating: number) => void;
  onRemoveRating: (apartmentId: string) => void;
  currentRatings: Record<string, number>;
}

export const ApartmentDetailDrawer = ({
  onRate,
  onRemoveRating,
  currentRatings,
}: ApartmentDetailDrawerProps) => {
  const { detailDrawerOpen, detailApartmentId, closeDetailDrawer } = useAppStore();
  const [imageError, setImageError] = useState(false);
  const [imgRetry, setImgRetry] = useState(0);

  const {
    data: apartment,
    isLoading,
    isError,
    refetch,
  } = useApartmentDetail(detailApartmentId || '');

  // Helper to append a cache-busting query param to the image URL on retry
  const backendBase: string = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_BACKEND_URL || 'http://localhost:8000';
  const proxiedImage = (url: string | undefined | null, retry: number): string | undefined => {
    if (!url) return undefined;
    const encoded = encodeURIComponent(url);
    return `${backendBase}/image-proxy?url=${encoded}&v=${retry}`;
  };

  if (!detailDrawerOpen || !detailApartmentId) {
    return null;
  }

  const handleClose = () => {
    closeDetailDrawer();
  };

  const handleBackdropClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  return createPortal(
    <>
      <div className="drawer-backdrop" onClick={handleBackdropClick} />
      <div className="apartment-detail-drawer">
        <div className="drawer-header">
          <h2>Apartment Details</h2>
          <button className="close-button" onClick={handleClose} aria-label="Close drawer">
            ✕
          </button>
        </div>

        <div className="drawer-content">
          {isLoading && <LoadingSpinner message="Loading apartment details..." />}

          {isError && (
            <ErrorMessage
              message="Failed to load apartment details"
              onRetry={() => refetch()}
            />
          )}

          {apartment && (
            <>
              {/* Listing hero image (falls back to placeholder if unavailable) */}
              {apartment.picture_url && !imageError ? (
                <div className="apartment-image-wrapper">
                  <img
                    key={`${detailApartmentId}-${imgRetry}`}
                    src={proxiedImage(apartment.picture_url, imgRetry)}
                    alt={apartment.name || 'Apartment photo'}
                    loading="lazy"
                    onError={() => setImageError(true)}
                  />
                </div>
              ) : (
                <div className="apartment-image-placeholder">
                  <span>📷</span>
                  <p>Image not available</p>
                  {apartment.picture_url ? (
                    <button
                      onClick={() => {
                        setImageError(false);
                        setImgRetry((r) => r + 1);
                      }}
                      aria-label="Retry loading image"
                      style={{
                        marginTop: '0.5rem',
                        padding: '0.4rem 0.75rem',
                        borderRadius: 6,
                        border: '1px solid #d1d5db',
                        background: '#ffffff',
                        cursor: 'pointer',
                      }}
                    >
                      Retry image
                    </button>
                  ) : null}
                </div>
              )}

              {/* Title and Basic Info */}
              <div className="apartment-header">
                <h3 className="apartment-name">{apartment.name}</h3>
                <div className="apartment-price">{formatPrice(apartment.price)}/night</div>
              </div>

              {/* Rating Control */}
              <div className="rating-section">
                <h4>Your Rating</h4>
                <RatingControl
                  apartmentId={String(apartment.id)}
                  currentRating={currentRatings[String(apartment.id)]}
                  onRate={(rating) => onRate(String(apartment.id), rating)}
                  onRemove={() => onRemoveRating(String(apartment.id))}
                  size="large"
                />
              </div>

              {/* Key Information Cards */}
              <div className="info-cards">
                <div className="info-card">
                  <div className="info-card-icon">🏠</div>
                  <div className="info-card-content">
                    <div className="info-card-label">Property</div>
                    <div className="info-card-value">{apartment.property_type}</div>
                    <div className="info-card-sublabel">{formatRoomType(apartment.room_type)}</div>
                  </div>
                </div>
                <div className="info-card">
                  <div className="info-card-icon">📍</div>
                  <div className="info-card-content">
                    <div className="info-card-label">Location</div>
                    <div className="info-card-value">{formatNeighbourhood(apartment.neighbourhood_cleansed || apartment.neighbourhood || '')}</div>
                    <div className="info-card-sublabel">{formatDistance((apartment.distance_from_city_center || apartment.distance_from_center || 0))} from center</div>
                  </div>
                </div>
                <div className="info-card">
                  <div className="info-card-icon">👥</div>
                  <div className="info-card-content">
                    <div className="info-card-label">Capacity</div>
                    <div className="info-card-value">{apartment.accommodates} guests</div>
                    <div className="info-card-sublabel">{apartment.bedrooms} bed · {apartment.beds} beds · {apartment.bathrooms} bath</div>
                  </div>
                </div>
                <div className="info-card">
                  <div className="info-card-icon">📅</div>
                  <div className="info-card-content">
                    <div className="info-card-label">Stay Duration</div>
                    <div className="info-card-value">{apartment.minimum_nights} - {apartment.maximum_nights} nights</div>
                    <div className="info-card-sublabel">Min - Max nights</div>
                  </div>
                </div>
              </div>

              {/* Review Information */}
              {apartment.review_scores_rating !== undefined && apartment.review_scores_rating > 0 && (
                <div className="reviews-section">
                  <h4 className="section-title">⭐ Reviews</h4>
                  <div className="overall-rating-card">
                    <div className="overall-rating-score">
                      <span className="rating-number">{apartment.review_scores_rating.toFixed(1)}</span>
                      <span className="rating-max"> / 5.0</span>
                    </div>
                    <div className="overall-rating-meta">
                      {apartment.number_of_reviews != null && (
                        <div>{formatNumber(apartment.number_of_reviews)} reviews</div>
                      )}
                      {apartment.reviews_per_month && apartment.reviews_per_month > 0 && (
                        <div>{apartment.reviews_per_month.toFixed(1)} reviews/month</div>
                      )}
                    </div>
                  </div>

                  {/* Review Score Breakdown */}
                  {((apartment.review_scores_accuracy !== undefined && apartment.review_scores_accuracy > 0) ||
                    (apartment.review_scores_cleanliness !== undefined && apartment.review_scores_cleanliness > 0) ||
                    (apartment.review_scores_checkin !== undefined && apartment.review_scores_checkin > 0) ||
                    (apartment.review_scores_communication !== undefined && apartment.review_scores_communication > 0) ||
                    (apartment.review_scores_location !== undefined && apartment.review_scores_location > 0) ||
                    (apartment.review_scores_value !== undefined && apartment.review_scores_value > 0)) && (
                    <div className="review-scores-grid">
                      {apartment.review_scores_accuracy !== undefined && apartment.review_scores_accuracy > 0 && (
                        <div className="review-score-item">
                          <span className="review-score-label">Accuracy</span>
                          <span className="review-score-bar">
                            <span className="review-score-fill" style={{ width: `${(apartment.review_scores_accuracy / 5) * 100}%` }}></span>
                          </span>
                          <span className="review-score-value">{apartment.review_scores_accuracy.toFixed(1)}</span>
                        </div>
                      )}
                      {apartment.review_scores_cleanliness !== undefined && apartment.review_scores_cleanliness > 0 && (
                        <div className="review-score-item">
                          <span className="review-score-label">Cleanliness</span>
                          <span className="review-score-bar">
                            <span className="review-score-fill" style={{ width: `${(apartment.review_scores_cleanliness / 5) * 100}%` }}></span>
                          </span>
                          <span className="review-score-value">{apartment.review_scores_cleanliness.toFixed(1)}</span>
                        </div>
                      )}
                      {apartment.review_scores_checkin !== undefined && apartment.review_scores_checkin > 0 && (
                        <div className="review-score-item">
                          <span className="review-score-label">Check-in</span>
                          <span className="review-score-bar">
                            <span className="review-score-fill" style={{ width: `${(apartment.review_scores_checkin / 5) * 100}%` }}></span>
                          </span>
                          <span className="review-score-value">{apartment.review_scores_checkin.toFixed(1)}</span>
                        </div>
                      )}
                      {apartment.review_scores_communication !== undefined && apartment.review_scores_communication > 0 && (
                        <div className="review-score-item">
                          <span className="review-score-label">Communication</span>
                          <span className="review-score-bar">
                            <span className="review-score-fill" style={{ width: `${(apartment.review_scores_communication / 5) * 100}%` }}></span>
                          </span>
                          <span className="review-score-value">{apartment.review_scores_communication.toFixed(1)}</span>
                        </div>
                      )}
                      {apartment.review_scores_location !== undefined && apartment.review_scores_location > 0 && (
                        <div className="review-score-item">
                          <span className="review-score-label">Location</span>
                          <span className="review-score-bar">
                            <span className="review-score-fill" style={{ width: `${(apartment.review_scores_location / 5) * 100}%` }}></span>
                          </span>
                          <span className="review-score-value">{apartment.review_scores_location.toFixed(1)}</span>
                        </div>
                      )}
                      {apartment.review_scores_value !== undefined && apartment.review_scores_value > 0 && (
                        <div className="review-score-item">
                          <span className="review-score-label">Value</span>
                          <span className="review-score-bar">
                            <span className="review-score-fill" style={{ width: `${(apartment.review_scores_value / 5) * 100}%` }}></span>
                          </span>
                          <span className="review-score-value">{apartment.review_scores_value.toFixed(1)}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Review Dates */}
                  {(apartment.first_review || apartment.last_review) && (
                    <div className="review-dates">
                      {apartment.first_review && (
                        <div className="review-date-item">
                          <span className="review-date-label">First Review:</span>
                          <span className="review-date-value">{formatDate(apartment.first_review)}</span>
                        </div>
                      )}
                      {apartment.last_review && (
                        <div className="review-date-item">
                          <span className="review-date-label">Last Review:</span>
                          <span className="review-date-value">{formatDate(apartment.last_review)}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Additional Details */}
              <div className="additional-details">
                <h4 className="section-title">📋 Additional Details</h4>
                <div className="details-grid">
                  <div className="detail-item">
                    <span className="detail-label">Neighbourhood Group</span>
                    <span className="detail-value">{formatNeighbourhood(apartment.neighbourhood_group_cleansed || apartment.neighbourhood_group || '')}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Host</span>
                    <span className="detail-value">{apartment.host_name || 'Unknown'} (ID: {apartment.host_id})</span>
                  </div>
                  {apartment.calculated_host_listings_count !== undefined && (
                    <div className="detail-item">
                      <span className="detail-label">Host Listings</span>
                      <span className="detail-value">{apartment.calculated_host_listings_count}</span>
                    </div>
                  )}
                  <div className="detail-item">
                    <span className="detail-label">Coordinates</span>
                    <span className="detail-value">{apartment.latitude.toFixed(6)}, {apartment.longitude.toFixed(6)}</span>
                  </div>
                </div>
              </div>

              {/* Amenities */}
              <div className="amenities-section">
                <h4 className="section-title">✨ Amenities</h4>
                <div className="amenities-list">
                  {formatAmenities(parseAmenities(apartment.amenities))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>,
    document.body
  );
};

export default ApartmentDetailDrawer;
