from typing import Dict, Any, List, Optional

import numpy as np
from sklearn.metrics.pairwise import cosine_similarity

from app.data.loader import DATASTORE


class SessionModel:
    def __init__(self, like_threshold: float = 4.0):
        # sessions: session_id -> {apartment_id: rating}
        self.sessions: Dict[str, Dict[int, float]] = {}
        # ratings >= like_threshold are treated as "likes" when building the user vector
        self.like_threshold = like_threshold

    def _build_id_index(self) -> Dict[int, int]:
        """
        Build a mapping from apartment_id (DATASTORE.df['id']) to row index
        in DATASTORE.df / DATASTORE.X.
        """
        df = DATASTORE.df
        return {int(r): idx for idx, r in enumerate(df["id"].astype(int).tolist())}

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
                row_idx = id_index.get(int(apt_id))
                if row_idx is not None:
                    liked_indices.append(int(row_idx))
        return liked_indices

    def _build_user_vector(self, session_id: str) -> Optional[np.ndarray]:
        """
        Build a user preference vector as the centroid of liked item vectors.
        Returns None if we cannot build a meaningful vector (e.g., no likes).
        """
        liked_indices = self._get_liked_indices(session_id)
        if len(liked_indices) == 0:
            return None

        X = DATASTORE.X

        if X.shape[1] == 0:
            return None

        liked_vecs = X[liked_indices, :]
        user_vec = liked_vecs.mean(axis=0)
        user_vec = np.asarray(user_vec).ravel()

        # Normalize for cosine similarity
        norm = np.linalg.norm(user_vec)
        if norm == 0:
            return None
        user_vec = user_vec / norm
        return user_vec

    def add_rating(self, session_id: str, apartment_id: int, rating: float) -> None:
        """
        Store rating for this session. We no longer retrain a regression model;
        recommendations are computed on-the-fly via cosine similarity.
        """
        self.sessions.setdefault(session_id, {})[int(apartment_id)] = float(rating)

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

        scores = cosine_similarity(X, user_vec.reshape(1, -1)).ravel()
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

    def contributions_for(self, session_id: str, apartment_ids: List[int]):
        """
        Compute per-feature contributions as coef_j * x_j for the requested
        apartments, using the user preference vector as coefficients.
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
            idx = id_index.get(int(aid))
            if idx is None:
                continue
            x = X[idx, :]
            # contribution of each feature
            contributions = (coef * x).tolist()
            # a simple predicted score = dot(coef, x) + intercept
            predicted = float(np.dot(coef, x) + intercept)
            results.append(
                {
                    "apartment_id": int(aid),
                    "predicted_score": predicted,
                    "contributions": contributions,
                }
            )
        return results


SESSION_MODEL = SessionModel()
