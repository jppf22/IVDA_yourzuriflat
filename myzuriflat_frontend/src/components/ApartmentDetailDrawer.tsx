/**
 * Apartment Detail Drawer
 * Shows full information for a selected apartment with rating controls
 * Supports T4 (calibration) and detail-on-demand interaction
 */

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

  const {
    data: apartment,
    isLoading,
    isError,
    refetch,
  } = useApartmentDetail(detailApartmentId || '');

  if (!detailDrawerOpen || !detailApartmentId) {
    return null;
  }

  const handleClose = () => {
    closeDetailDrawer();
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
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
              {/* Image Placeholder */}
              <div className="apartment-image-placeholder">
                <span>📷</span>
                <p>Image not available</p>
              </div>

              {/* Title and Basic Info */}
              <div className="apartment-header">
                <h3 className="apartment-name">{apartment.name}</h3>
                <div className="apartment-price">{formatPrice(apartment.price)}/night</div>
              </div>

              {/* Rating Control */}
              <div className="rating-section">
                <h4>Your Rating</h4>
                <RatingControl
                  apartmentId={apartment.id}
                  currentRating={currentRatings[apartment.id]}
                  onRate={(rating) => onRate(apartment.id, rating)}
                  size="large"
                />
              </div>

              {/* Details Grid */}
              <div className="details-grid">
                <div className="detail-item">
                  <span className="detail-label">Room Type</span>
                  <span className="detail-value">{formatRoomType(apartment.room_type)}</span>
                </div>

                <div className="detail-item">
                  <span className="detail-label">Neighbourhood</span>
                  <span className="detail-value">{apartment.neighbourhood}</span>
                </div>

                <div className="detail-item">
                  <span className="detail-label">Distance from Center</span>
                  <span className="detail-value">
                    {formatDistance(apartment.distance_from_center)}
                  </span>
                </div>

                <div className="detail-item">
                  <span className="detail-label">Minimum Nights</span>
                  <span className="detail-value">{apartment.minimum_nights}</span>
                </div>

                <div className="detail-item">
                  <span className="detail-label">Availability</span>
                  <span className="detail-value">{apartment.availability_365} days/year</span>
                </div>

                <div className="detail-item">
                  <span className="detail-label">Number of Reviews</span>
                  <span className="detail-value">{formatNumber(apartment.number_of_reviews)}</span>
                </div>

                {apartment.reviews_per_month && apartment.reviews_per_month > 0 && (
                  <div className="detail-item">
                    <span className="detail-label">Reviews per Month</span>
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
                  <span className="detail-label">Host Name</span>
                  <span className="detail-value">{apartment.host_name}</span>
                </div>

                <div className="detail-item">
                  <span className="detail-label">Host Listings</span>
                  <span className="detail-value">
                    {apartment.calculated_host_listings_count}
                  </span>
                </div>

                <div className="detail-item">
                  <span className="detail-label">Latitude</span>
                  <span className="detail-value">{apartment.latitude.toFixed(6)}</span>
                </div>

                <div className="detail-item">
                  <span className="detail-label">Longitude</span>
                  <span className="detail-value">{apartment.longitude.toFixed(6)}</span>
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
