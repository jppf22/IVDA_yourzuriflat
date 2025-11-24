/**
 * Apartment Detail Drawer
 * Shows full information for a selected apartment with rating controls
 * Supports T4 (calibration) and detail-on-demand interaction
 */

import { useState } from 'react';
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
  currentRatings: Record<string, number>;
}

export const ApartmentDetailDrawer = ({
  onRate,
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

  return (
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
                  size="large"
                />
              </div>

              {/* Details Grid */}
              <div className="details-grid">
                <div className="detail-item">
                  <span className="detail-label">Property Type</span>
                  <span className="detail-value">{apartment.property_type}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Room Type</span>
                  <span className="detail-value">{formatRoomType(apartment.room_type)}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Neighbourhood Group</span>
                  <span className="detail-value">{formatNeighbourhood(apartment.neighbourhood_group_cleansed || apartment.neighbourhood_group || '')}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Neighbourhood</span>
                  <span className="detail-value">{formatNeighbourhood(apartment.neighbourhood_cleansed || apartment.neighbourhood || '')}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Distance from Center</span>
                  <span className="detail-value">
                    {formatDistance((apartment.distance_from_city_center || apartment.distance_from_center || 0))}
                  </span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Accommodates</span>
                  <span className="detail-value">{apartment.accommodates}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Bathrooms</span>
                  <span className="detail-value">{apartment.bathrooms}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Bedrooms</span>
                  <span className="detail-value">{apartment.bedrooms}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Beds</span>
                  <span className="detail-value">{apartment.beds}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Min Nights</span>
                  <span className="detail-value">{apartment.minimum_nights}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Max Nights</span>
                  <span className="detail-value">{apartment.maximum_nights}</span>
                </div>
                {apartment.number_of_reviews !== undefined && (
                  <div className="detail-item">
                    <span className="detail-label"># Reviews</span>
                    <span className="detail-value">{formatNumber(apartment.number_of_reviews)}</span>
                  </div>
                )}
                {apartment.reviews_per_month && apartment.reviews_per_month > 0 && (
                  <div className="detail-item">
                    <span className="detail-label">Reviews / Month</span>
                    <span className="detail-value">{apartment.reviews_per_month.toFixed(2)}</span>
                  </div>
                )}
                {apartment.last_review && (
                  <div className="detail-item">
                    <span className="detail-label">Last Review</span>
                    <span className="detail-value">{formatDate(apartment.last_review)}</span>
                  </div>
                )}
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
                  <span className="detail-label">Latitude</span>
                  <span className="detail-value">{apartment.latitude.toFixed(6)}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Longitude</span>
                  <span className="detail-value">{apartment.longitude.toFixed(6)}</span>
                </div>
                <div className="detail-item amenities-span" style={{ gridColumn: 'span 2' }}>
                  <span className="detail-label">Amenities</span>
                  <span className="detail-value">
                    {formatAmenities(parseAmenities(apartment.amenities))}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
};

export default ApartmentDetailDrawer;
