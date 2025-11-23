import os
from typing import List, Tuple

import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler


def haversine(lat1, lon1, lat2, lon2):
    # approximate haversine (km)
    R = 6371.0
    lat1, lon1, lat2, lon2 = map(np.radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = np.sin(dlat / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlon / 2) ** 2
    return R * 2 * np.arcsin(np.sqrt(a))


class DataStore:
    def __init__(self, path: str = None):
        base = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
        if path is None:
            path = os.path.join(base, "data", "listings.csv")
        self.raw = pd.read_csv(path, low_memory=False)
        self._preprocess()

    def _preprocess(self):
        df = self.raw.copy()
        # standard fixes used in AGENT.md
        # fill numeric review fields with 0
        review_cols = [c for c in ["review_scores_rating", "number_of_reviews"] if c in df.columns]
        for c in review_cols:
            df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0)

        # drop license if present
        if "license" in df.columns:
            df = df.drop(columns=["license"])

        # price: try to coerce to numeric (strip $/CHF signs)
        if "price" in df.columns:
            df["price"] = (
                df["price"].astype(str).str.replace("$", "", regex=False).str.replace(",", "", regex=False)
            )
            df["price"] = pd.to_numeric(df["price"], errors="coerce")
            df = df[df["price"].notna()]
            df = df[df["price"] > 0]

        # compute distance from Zurich city center (approx coords)
        center_lat, center_lon = 47.3768866, 8.541694
        if "latitude" in df.columns and "longitude" in df.columns:
            df["distance_from_center"] = haversine(
                df["latitude"].astype(float), df["longitude"].astype(float), center_lat, center_lon
            )
        else:
            df["distance_from_center"] = 0.0

        # select feature columns for ML
        features = []
        for c in ["price", "distance_from_center", "number_of_reviews", "review_scores_rating", "accommodates", "bedrooms", "beds"]:
            if c in df.columns:
                features.append(c)

        # fill missing numeric
        for c in features:
            df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0)

        # simple one-hot for room_type if present
        if "room_type" in df.columns:
            room_dummies = pd.get_dummies(df["room_type"].fillna(""), prefix="room")
            df = pd.concat([df.reset_index(drop=True), room_dummies.reset_index(drop=True)], axis=1)
            features += list(room_dummies.columns)

        # scaling
        scaler = StandardScaler()
        X = df[features].to_numpy(dtype=float) if features else np.zeros((len(df), 0))
        if X.shape[1] > 0:
            X_scaled = scaler.fit_transform(X)
        else:
            X_scaled = X

        # Ensure IDs are strings to avoid lookup issues with very large integers
        if "id" in df.columns:
            df["id"] = df["id"].astype(str)

        self.df = df.reset_index(drop=True)
        self.feature_names = features
        self.X = X_scaled
        self.scaler = scaler

    def get_apartment(self, apartment_id: int):
        # the CSV uses 'id' column
        if "id" in self.df.columns:
            # compare as strings so very large numeric IDs still match
            row = self.df[self.df["id"] == str(apartment_id)]
            if len(row) == 0:
                return None
            return row.iloc[0].to_dict()
        return None

    def list_apartments(self, offset=0, limit=50, filters: dict = None):
        df = self.df
        if filters:
            if "price_min" in filters:
                df = df[df["price"] >= filters["price_min"]]
            if "price_max" in filters:
                df = df[df["price"] <= filters["price_max"]]
            if "room_types" in filters and "room_type" in df.columns:
                df = df[df["room_type"].isin(filters["room_types"]) ]
        total = len(df)
        page = df.iloc[offset : offset + limit]
        return page.to_dict(orient="records"), total


# instantiate singleton on import
DATASTORE = DataStore()
