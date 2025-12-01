from typing import Dict, Any, List, Optional, Union

import numpy as np
from sklearn.metrics.pairwise import cosine_similarity

from app.data.loader import DATASTORE


class SessionModel:
    def __init__(self, like_threshold: float = 4.0, dislike_threshold: float = 1.0):
        # sessions: session_id -> {apartment_id(str): {rating: float, timestamp: int}}
        self.sessions: Dict[str, Dict[str, Dict[str, Any]]] = {}
        # ratings >= like_threshold are treated as "likes" when building the user vector
        self.like_threshold = like_threshold
        self.dislike_threshold = dislike_threshold
        # Feature weighting: emphasize location, amenities, and key apartment attributes
        self._feature_weights: Optional[np.ndarray] = None
        self._rating_counter = 0  # Simple counter for recency tracking

    def _build_id_index(self) -> Dict[str, int]:
        """Map apartment id (string) to row index in DATASTORE.X."""
        df = DATASTORE.df
        return {str(r): idx for idx, r in enumerate(df["id"].astype(str).tolist())}
    
    def _compute_feature_weights(self) -> np.ndarray:
        """Compute feature importance weights based on feature names.
        
        Emphasizes:
        - Location features (distance, lat, lon): 2.0x
        - Amenity features (WiFi, Kitchen, etc.): 1.5x
        - Key apartment attributes (beds, bathrooms, accommodates): 1.3x
        - Other features: 1.0x (baseline)
        """
        if self._feature_weights is not None:
            return self._feature_weights
            
        feature_names = DATASTORE.feature_names
        weights = np.ones(len(feature_names))
        
        for i, name in enumerate(feature_names):
            name_lower = name.lower()
            # Location features get highest weight
            if any(loc in name_lower for loc in ['distance_from_city_center', 'latitude', 'longitude']):
                weights[i] = 2.0
            # Amenities get moderate boost
            elif 'amenity_' in name_lower:
                weights[i] = 1.5
            # Key apartment attributes
            elif any(key in name_lower for key in ['beds', 'bathrooms', 'bedrooms', 'accommodates', 'room_type']):
                weights[i] = 1.3
        
        # Normalize weights to maintain overall scale
        weights = weights / np.mean(weights)
        self._feature_weights = weights
        return weights

    def _get_liked_indices(self, session_id: str) -> List[int]:
        """
        For a given session, return the row indices in DATASTORE.X of all
        apartments that are rated >= like_threshold.
        """
        ratings = self.sessions.get(session_id, {})
        if not ratings:
            return []

        id_index = self._build_id_index()
        liked_indices: List[int] = []
        for apt_id, rating_data in ratings.items():
            rating_val = rating_data['rating'] if isinstance(rating_data, dict) else rating_data
            if rating_val >= self.like_threshold:
                row_idx = id_index.get(str(apt_id))
                if row_idx is not None:
                    liked_indices.append(int(row_idx))
        return liked_indices
    
    def _get_liked_with_weights(self, session_id: str) -> tuple[List[int], List[float]]:
        """
        Return liked apartment indices with recency-based weights.
        More recent ratings get slightly higher weight (up to 1.2x).
        """
        ratings = self.sessions.get(session_id, {})
        if not ratings:
            return [], []

        id_index = self._build_id_index()
        liked_indices: List[int] = []
        recency_weights: List[float] = []
        
        # Extract timestamps and ratings
        liked_items = []
        for apt_id, rating_data in ratings.items():
            if isinstance(rating_data, dict):
                rating_val = rating_data['rating']
                timestamp = rating_data.get('timestamp', 0)
            else:
                rating_val = rating_data
                timestamp = 0
                
            if rating_val >= self.like_threshold:
                row_idx = id_index.get(str(apt_id))
                if row_idx is not None:
                    liked_items.append((row_idx, timestamp, rating_val))
        
        if not liked_items:
            return [], []
        
        # Sort by timestamp to compute recency weights
        liked_items.sort(key=lambda x: x[1])
        
        for i, (idx, _, rating_val) in enumerate(liked_items):
            liked_indices.append(idx)
            # Recency weight: newer ratings get up to 1.2x boost
            recency_factor = 1.0 + 0.2 * (i / max(1, len(liked_items) - 1))
            # Also incorporate rating strength (5-star vs 4-star)
            rating_factor = (rating_val - self.like_threshold + 1.0) / 2.0
            recency_weights.append(recency_factor * rating_factor)
        
        return liked_indices, recency_weights

    def _get_disliked_indices(self, session_id: str) -> List[int]:
        """
        For a given session, return the row indices in DATASTORE.X of all
        apartments that are rated <= dislike_threshold.
        """
        ratings = self.sessions.get(session_id, {})
        if not ratings:
            return []

        id_index = self._build_id_index()
        disliked_indices: List[int] = []
        for apt_id, rating_data in ratings.items():
            rating_val = rating_data['rating'] if isinstance(rating_data, dict) else rating_data
            if rating_val <= self.dislike_threshold:
                row_idx = id_index.get(str(apt_id))
                if row_idx is not None:
                    disliked_indices.append(int(row_idx))
        return disliked_indices

    def _build_user_vector(self, session_id: str) -> Optional[np.ndarray]:
        """
        Build an enhanced user preference vector using:
        1. Weighted centroid of liked items (with recency boost)
        2. Feature importance weighting (location, amenities, key attributes)
        3. Subtraction of disliked item centroid (with dampening)
        
        Returns None if we cannot build a meaningful vector (e.g., no likes).
        """
        liked_indices, recency_weights = self._get_liked_with_weights(session_id)
        disliked_indices = self._get_disliked_indices(session_id)

        if (len(liked_indices) == 0) and (len(disliked_indices) == 0):
            return None

        X = DATASTORE.X
        if X.shape[1] == 0:
            return None

        # Get feature weights
        feature_weights = self._compute_feature_weights()

        # Apply feature weighting to the feature matrix
        X_weighted = X * feature_weights.reshape(1, -1)

        liked_vecs = X_weighted[liked_indices, :] if liked_indices else None
        disliked_vecs = X_weighted[disliked_indices, :] if disliked_indices else None

        # Ensure dense array
        if liked_vecs is not None and hasattr(liked_vecs, 'toarray'):
            liked_vecs = liked_vecs.toarray()
        if disliked_vecs is not None and hasattr(disliked_vecs, 'toarray'):
            disliked_vecs = disliked_vecs.toarray()

        # Compute weighted centroid for liked items (incorporating recency)
        if liked_vecs is not None:
            if recency_weights:
                weights_array = np.array(recency_weights).reshape(-1, 1)
                liked_cen = np.average(liked_vecs, axis=0, weights=weights_array.ravel())
            else:
                liked_cen = liked_vecs.mean(axis=0)
        else:
            liked_cen = None
            
        disliked_cen = disliked_vecs.mean(axis=0) if disliked_vecs is not None else None

        # Dampening factor for dislikes (reduced from 1.0 to 0.5)
        # This prevents overly aggressive filtering while still learning from dislikes
        ALPHA = 0.5
        if liked_cen is not None and disliked_cen is not None:
            user_vec = liked_cen - ALPHA * disliked_cen
        elif liked_cen is not None:
            user_vec = liked_cen
        else:
            user_vec = -disliked_cen

        user_vec = np.asarray(user_vec).ravel()
        norm = np.linalg.norm(user_vec)
        if norm == 0:
            return None
        return user_vec / norm

    def add_rating(self, session_id: str, apartment_id: Union[int, str], rating: float) -> None:
        """Store rating for this session with timestamp (apartment_id normalized to string)."""
        self._rating_counter += 1
        self.sessions.setdefault(session_id, {})[str(apartment_id)] = {
            'rating': float(rating),
            'timestamp': self._rating_counter
        }

    def remove_rating(self, session_id: str, apartment_id: Union[int, str]) -> bool:
        """Remove rating for this session. Returns True if rating existed and was removed."""
        if session_id not in self.sessions:
            return False
        apt_id_str = str(apartment_id)
        if apt_id_str in self.sessions[session_id]:
            del self.sessions[session_id][apt_id_str]
            return True
        return False

    def clear_ratings(self, session_id: str) -> int:
        """Remove all ratings for a session and return how many entries were cleared."""
        ratings = self.sessions.get(session_id)
        if not ratings:
            # Ensure session exists to avoid KeyError for downstream callers
            self.sessions.setdefault(session_id, {})
            return 0
        removed_count = len(ratings)
        self.sessions[session_id] = {}
        return removed_count

    def get_ratings(self, session_id: str) -> Dict[str, float]:
        """Get all ratings for a session (returns simplified dict for backwards compatibility)."""
        ratings = self.sessions.get(session_id, {})
        # Convert to simple rating dict for API compatibility
        return {apt_id: (data['rating'] if isinstance(data, dict) else data) 
                for apt_id, data in ratings.items()}

    def predict_scores(self, session_id: str, apply_diversity_penalty: bool = True) -> Optional[np.ndarray]:
        """
        Compute enhanced similarity scores for all apartments for this session.
        
        Applies:
        1. Feature-weighted cosine similarity
        2. Optional diversity penalty (reduces scores for apartments very similar to already-rated ones)

        Parameters
        ----------
        session_id : str
            Session identifier
        apply_diversity_penalty : bool
            Whether to apply diversity penalty (default True)

        Returns
        -------
        scores : np.ndarray of shape (n_apartments,)
            Enhanced similarity scores, or None if we don't have enough data.
        """
        user_vec = self._build_user_vector(session_id)
        if user_vec is None:
            return None

        X = DATASTORE.X
        if X.shape[1] == 0:
            return None
            
        # Apply feature weighting to the feature matrix
        feature_weights = self._compute_feature_weights()
        X_weighted = X * feature_weights.reshape(1, -1)
        
        # Convert sparse matrices to dense if necessary
        if hasattr(X_weighted, 'toarray'):
            X_dense = X_weighted.toarray()
        else:
            X_dense = X_weighted
            
        # Compute cosine similarity
        scores = cosine_similarity(X_dense, user_vec.reshape(1, -1)).ravel()
        
        # Apply diversity penalty to encourage varied recommendations
        if apply_diversity_penalty:
            liked_indices, _ = self._get_liked_with_weights(session_id)
            if len(liked_indices) > 0:
                # Compute similarity between all apartments and liked apartments
                liked_vecs = X_dense[liked_indices, :]
                # For each apartment, find max similarity to any liked apartment
                similarity_to_liked = cosine_similarity(X_dense, liked_vecs).max(axis=1)
                # Apply penalty: reduce score if too similar to already-liked apartments
                # Penalty factor ranges from 0.7 to 1.0 based on similarity
                diversity_penalty = 1.0 - 0.3 * similarity_to_liked
                scores = scores * diversity_penalty
        
        return scores

    def coefficients(self, session_id: str) -> Optional[Dict[str, Any]]:
        """
        For compatibility with the /explainability endpoint, we expose the
        user preference vector as "coefficients". This is not a regression
        model, but it still provides an interpretable weight per feature.
        """
        user_vec = self._build_user_vector(session_id)
        if user_vec is None:
            return None

        return {
            "coef": user_vec.tolist(),
            "intercept": 0.0,
            "feature_names": DATASTORE.feature_names,
        }

    def contributions_for(self, session_id: str, apartment_ids: List[Union[int, str]]):
        """
        Compute per-feature contributions as coef_j * x_j for the requested
        apartments, using the user preference vector as coefficients.
        
        Args:
            apartment_ids: List of apartment IDs (int or str) - will be normalized to strings
        """
        coeffs = self.coefficients(session_id)
        if coeffs is None:
            return None

        coef = np.array(coeffs["coef"], dtype=float)
        intercept = float(coeffs["intercept"])
        X = DATASTORE.X
        id_index = self._build_id_index()

        results = []
        for aid in apartment_ids:
            # Normalize to string for lookup
            aid_str = str(aid)
            idx = id_index.get(aid_str)
            if idx is None:
                continue
            x_row = X[idx, :]
            if hasattr(x_row, 'toarray'):
                x_row = x_row.toarray()
            x_vec = np.asarray(x_row).ravel()
            contributions = (coef * x_vec).tolist()
            predicted = float(np.dot(coef, x_vec) + intercept)
            # Always return string ID to preserve precision
            results.append({
                "apartment_id": aid_str,
                "predicted_score": predicted,
                "contributions": contributions,
            })
        return results


SESSION_MODEL = SessionModel()
