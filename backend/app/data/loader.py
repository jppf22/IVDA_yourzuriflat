import os
from typing import List, Tuple

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import StandardScaler, OneHotEncoder

class DataStore:
    def __init__(self, path: str = None):
        base = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
        if path is None:
            path = os.path.join(base, "data", "listings_clean.json")
        self.raw = pd.read_json(path, lines=True)
        self._preprocess()

    def _preprocess(self):
        df = self.raw.copy()

        if "id" in df.columns:
            df["id"] = df["id"].astype(str)

        # select feature columns for ML
        drop_cols = ['id', 'name', 'host_id', 'host_name']
        drop_cols = [c for c in drop_cols if c in df.columns]
        df_model = df.drop(columns=drop_cols)

        num_cols = ["price", "distance_from_city_center", "latitude", "longitude", "minimum_nights", "maximum_nights",
                    "accommodates", "bathrooms", "bedrooms", "beds"]
        num_cols = [c for c in num_cols if c in df_model.columns]

        cat_cols = ['property_type', 'room_type', 'neighbourhood', 'neighbourhood_group']
        cat_cols = [c for c in cat_cols if c in df_model.columns]

        preprocess = ColumnTransformer([
            ("num", StandardScaler(), num_cols),
            ("cat", OneHotEncoder(), cat_cols)
        ])

        if len(num_cols) == 0 and len(cat_cols) == 0:
            X = np.zeros((len(df_model), 0))
            feature_names = []
        else:
            X = preprocess.fit_transform(df_model)
            # get feature names for explainability
            try:
                feature_names = preprocess.get_feature_names_out().tolist()
            except AttributeError:
                # older sklearn fallback
                feature_names = num_cols + list(preprocess.named_transformers_["cat"].get_feature_names_out(cat_cols))

        if hasattr(X, "toarray"):  # handles sparse matrices
            X = X.toarray()
        else:
            X = np.asarray(X, dtype=float)

        self.df = df.reset_index(drop=True)
        self.X = X
        self.feature_names = feature_names
        self.preprocess = preprocess

    def get_apartment(self, apartment_id: int):
        # listings identified by 'id' column
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
