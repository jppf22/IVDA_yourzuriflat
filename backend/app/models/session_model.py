from typing import Dict, Any, List, Optional

import numpy as np
from sklearn.linear_model import Ridge

from app.data.loader import DATASTORE


class SessionModel:
    def __init__(self):
        # sessions: session_id -> {apartment_id: rating}
        self.sessions: Dict[str, Dict[int, float]] = {}
        self.models: Dict[str, Ridge] = {}

    def add_rating(self, session_id: str, apartment_id: int, rating: float) -> None:
        self.sessions.setdefault(session_id, {})[int(apartment_id)] = float(rating)
        # retrain eagerly
        self.train(session_id)

    def train(self, session_id: str) -> None:
        ratings = self.sessions.get(session_id, {})
        if len(ratings) < 2:
            # not enough data to train a model
            if session_id in self.models:
                del self.models[session_id]
            return

        # build training arrays
        ids = list(ratings.keys())
        y = np.array([ratings[i] for i in ids], dtype=float)
        # find rows in DATASTORE matching ids
        df = DATASTORE.df
        id_index = {int(r): idx for idx, r in enumerate(df["id"].astype(int).tolist())}
        rows = [id_index.get(int(i)) for i in ids]
        # filter missing rows
        mask = [r is not None for r in rows]
        if sum(mask) < 2:
            if session_id in self.models:
                del self.models[session_id]
            return
        X = DATASTORE.X
        X_train = X[[r for r in rows if r is not None], :]
        if X_train.shape[1] == 0:
            return
        model = Ridge(alpha=1.0)
        model.fit(X_train, y)
        self.models[session_id] = model

    def predict_scores(self, session_id: str) -> Optional[np.ndarray]:
        model = self.models.get(session_id)
        if model is None:
            return None
        X = DATASTORE.X
        return model.predict(X)

    def coefficients(self, session_id: str) -> Optional[Dict[str, Any]]:
        model = self.models.get(session_id)
        if model is None:
            return None
        return {
            "coef": model.coef_.tolist(),
            "intercept": float(model.intercept_),
            "feature_names": DATASTORE.feature_names,
        }

    def contributions_for(self, session_id: str, apartment_ids: List[int]):
        coeffs = self.coefficients(session_id)
        if coeffs is None:
            return None
        model = self.models[session_id]
        X = DATASTORE.X
        id_index = {int(r): idx for idx, r in enumerate(DATASTORE.df["id"].astype(int).tolist())}
        results = []
        for aid in apartment_ids:
            idx = id_index.get(int(aid))
            if idx is None:
                continue
            x = X[idx, :]
            contributions = (model.coef_ * x).tolist()
            predicted = float(model.predict(x.reshape(1, -1))[0])
            results.append({"apartment_id": int(aid), "predicted_score": predicted, "contributions": contributions})
        return results


SESSION_MODEL = SessionModel()
