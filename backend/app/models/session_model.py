from typing import Dict, Any, List, Optional, Union

import numpy as np
from sklearn.metrics.pairwise import cosine_similarity

from app.data.loader import DATASTORE


class SessionModel:
    def __init__(self, like_threshold: float = 4.0, dislike_threshold: float = 1.0):
        # sessions: session_id -> {apartment_id(str): rating(float)}
        self.sessions: Dict[str, Dict[str, float]] = {}
        # ratings >= like_threshold are treated as "likes" when building the user vector
        self.like_threshold = like_threshold
        self.dislike_threshold = dislike_threshold

    def _build_id_index(self) -> Dict[str, int]:
        """Map apartment id (string) to row index in DATASTORE.X."""
        df = DATASTORE.df
        return {str(r): idx for idx, r in enumerate(df["id"].astype(str).tolist())}

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
        for apt_id, rating in ratings.items():
            if rating >= self.like_threshold:
                row_idx = id_index.get(str(apt_id))
                if row_idx is not None:
                    liked_indices.append(int(row_idx))
        return liked_indices

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
        for apt_id, rating in ratings.items():
            if rating <= self.dislike_threshold:
                row_idx = id_index.get(str(apt_id))
                if row_idx is not None:
                    disliked_indices.append(int(row_idx))
        return disliked_indices

    def _build_user_vector(self, session_id: str) -> Optional[np.ndarray]:
        """
        Build a user preference vector as the centroid of liked item vectors
        subtract a scale of the centroid of disliked item vectors.
        Returns None if we cannot build a meaningful vector (e.g., no likes).
        """
        liked_indices = self._get_liked_indices(session_id)
        disliked_indices = self._get_disliked_indices(session_id)

        if (len(liked_indices) == 0) and (len(disliked_indices) == 0):
            return None

        X = DATASTORE.X
        if X.shape[1] == 0:
            return None

        liked_vecs = X[liked_indices, :] if liked_indices else None
        disliked_vecs = X[disliked_indices, :] if disliked_indices else None

        # Ensure dense array
        if liked_vecs is not None and hasattr(liked_vecs, 'toarray'):
            liked_vecs = liked_vecs.toarray()
        if disliked_vecs is not None and hasattr(disliked_vecs, 'toarray'):
            disliked_vecs = disliked_vecs.toarray()

        liked_cen = liked_vecs.mean(axis=0) if liked_vecs is not None else None
        disliked_cen = disliked_vecs.mean(axis=0) if disliked_vecs is not None else None

        ALPHA = 1.0
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
        """Store rating for this session (apartment_id normalized to string)."""
        self.sessions.setdefault(session_id, {})[str(apartment_id)] = float(rating)

    def remove_rating(self, session_id: str, apartment_id: Union[int, str]) -> bool:
        """Remove rating for this session. Returns True if rating existed and was removed."""
        if session_id not in self.sessions:
            return False
        apt_id_str = str(apartment_id)
        if apt_id_str in self.sessions[session_id]:
            del self.sessions[session_id][apt_id_str]
            return True
        return False

    def get_ratings(self, session_id: str) -> Dict[str, float]:
        """Get all ratings for a session."""
        return self.sessions.get(session_id, {})

    def predict_scores(self, session_id: str) -> Optional[np.ndarray]:
        """
        Compute cosine similarity scores for all apartments for this session.

        Returns
        -------
        scores : np.ndarray of shape (n_apartments,)
            Cosine similarity scores, or None if we don't have enough data.
        """
        user_vec = self._build_user_vector(session_id)
        if user_vec is None:
            return None

        X = DATASTORE.X
        if X.shape[1] == 0:
            return None
        # Convert sparse matrices to dense if necessary
        if hasattr(X, 'toarray'):
            X_dense = X.toarray()
        else:
            X_dense = X
        scores = cosine_similarity(X_dense, user_vec.reshape(1, -1)).ravel()
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
