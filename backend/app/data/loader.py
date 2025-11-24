import os
from typing import List, Tuple, Optional

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import StandardScaler, OneHotEncoder

class DataStore:
    def __init__(self, path: str = None):
        base = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
        if path is None:
            path = os.path.join(base, "data", "listings_clean.json")
        self.base_dir = base
        self.raw = pd.read_json(path, lines=True)
        self._preprocess()

    def _preprocess(self):
        df = self.raw.copy()

        # Attach/augment image URLs and review data from the original export (listings.csv)
        source_csv_path = os.path.join(self.base_dir, "data", "listings.csv")
        if os.path.exists(source_csv_path):
            try:
                # Load picture_url and review fields from original CSV
                review_cols = [
                    "id", "picture_url", 
                    "number_of_reviews", "last_review", "first_review",
                    "review_scores_rating", "review_scores_accuracy", 
                    "review_scores_cleanliness", "review_scores_checkin",
                    "review_scores_communication", "review_scores_location", 
                    "review_scores_value", "reviews_per_month"
                ]
                # Only use columns that exist in the CSV
                source_data = pd.read_csv(source_csv_path, usecols=lambda col: col in review_cols)
                source_data["id"] = source_data["id"].astype(str)
                
                # Ensure id in df is string for stable join
                if "id" in df.columns:
                    df["id"] = df["id"].astype(str)
                
                # Merge with suffix to preserve any existing data
                df = df.merge(source_data, on="id", how="left", suffixes=("", "_csv"))
                
                # Helper to test for valid-looking URLs
                def _valid_url(series: pd.Series) -> pd.Series:
                    s = series.astype(str)
                    return s.str.startswith(("http://", "https://"), na=False) & s.str.strip().ne("")
                
                # Coalesce picture_url: prefer existing non-empty picture_url, else CSV value
                if "picture_url" in df.columns and "picture_url_csv" in df.columns:
                    existing = df["picture_url"]
                    from_csv = df["picture_url_csv"]
                    df["picture_url"] = np.where(_valid_url(existing), existing,
                                                  np.where(_valid_url(from_csv), from_csv, np.nan))
                    df.drop(columns=["picture_url_csv"], inplace=True)
                elif "picture_url_csv" in df.columns:
                    from_csv = df["picture_url_csv"]
                    df["picture_url"] = np.where(_valid_url(from_csv), from_csv, np.nan)
                    df.drop(columns=["picture_url_csv"], inplace=True)
                elif "picture_url" not in df.columns:
                    df["picture_url"] = np.nan
                
                # Handle review fields - keep CSV values, add if missing
                review_fields = [
                    "number_of_reviews", "last_review", "first_review",
                    "review_scores_rating", "review_scores_accuracy", 
                    "review_scores_cleanliness", "review_scores_checkin",
                    "review_scores_communication", "review_scores_location", 
                    "review_scores_value", "reviews_per_month"
                ]
                for field in review_fields:
                    csv_field = f"{field}_csv"
                    if csv_field in df.columns:
                        if field in df.columns:
                            # Prefer CSV values over existing (CSV is source of truth)
                            df[field] = df[csv_field]
                        else:
                            # Add from CSV
                            df[field] = df[csv_field]
                        df.drop(columns=[csv_field], inplace=True)
                    elif field not in df.columns:
                        # Ensure column exists even if not in CSV
                        df[field] = np.nan
                        
            except Exception as e:
                # On any failure, ensure picture_url and review columns exist
                print(f"Warning: Could not load source CSV data: {e}")
                if "picture_url" not in df.columns:
                    df["picture_url"] = np.nan
                review_fields = [
                    "number_of_reviews", "last_review", "first_review",
                    "review_scores_rating", "review_scores_accuracy", 
                    "review_scores_cleanliness", "review_scores_checkin",
                    "review_scores_communication", "review_scores_location", 
                    "review_scores_value", "reviews_per_month"
                ]
                for field in review_fields:
                    if field not in df.columns:
                        df[field] = np.nan
        else:
            # listings.csv missing; ensure columns exist
            if "picture_url" not in df.columns:
                df["picture_url"] = np.nan
            review_fields = [
                "number_of_reviews", "last_review", "first_review",
                "review_scores_rating", "review_scores_accuracy", 
                "review_scores_cleanliness", "review_scores_checkin",
                "review_scores_communication", "review_scores_location", 
                "review_scores_value", "reviews_per_month"
            ]
            for field in review_fields:
                if field not in df.columns:
                    df[field] = np.nan

        if "id" in df.columns:
            df["id"] = df["id"].astype(str)

        # Provide alias columns expected by frontend/UI specification
        # Map cleaned neighbourhood/group values to *_cleansed naming for clarity
        if "neighbourhood" in df.columns and "neighbourhood_cleansed" not in df.columns:
            df["neighbourhood_cleansed"] = df["neighbourhood"]
        if "neighbourhood_group" in df.columns and "neighbourhood_group_cleansed" not in df.columns:
            df["neighbourhood_group_cleansed"] = df["neighbourhood_group"]

        # Ensure amenities stays a raw string for parsing client-side if it's not already list
        if "amenities" in df.columns:
            df["amenities"] = df["amenities"].astype(str)

        # select feature columns for ML - exclude review fields (informational only)
        drop_cols = ['id', 'name', 'host_id', 'host_name', 'picture_url']
        # Add review fields to drop list - these are informational only, not for recommendations
        review_fields_to_exclude = [
            'number_of_reviews', 'last_review', 'first_review',
            'review_scores_rating', 'review_scores_accuracy', 
            'review_scores_cleanliness', 'review_scores_checkin',
            'review_scores_communication', 'review_scores_location', 
            'review_scores_value', 'reviews_per_month'
        ]
        drop_cols.extend(review_fields_to_exclude)
        drop_cols = [c for c in drop_cols if c in df.columns]
        df_model = df.drop(columns=drop_cols)

        num_cols = ["price", "distance_from_city_center", "latitude", "longitude", "minimum_nights", "maximum_nights",
                "accommodates", "bathrooms", "bedrooms", "beds", "availability_365"]
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
            # Densify if sparse to simplify downstream math (cosine similarity & contributions)
            if hasattr(X, 'toarray'):
                X = X.toarray()
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
        self.numeric_columns = num_cols  # expose numeric columns for client-side selection

    def get_apartment(self, apartment_id):
        # listings identified by 'id' column
        # Accept both int and str to handle JS precision issues
        if "id" in self.df.columns:
            # compare as strings so very large numeric IDs still match
            row = self.df[self.df["id"] == str(apartment_id)]
            if len(row) == 0:
                return None
            # Convert to dict and ensure ID is string
            result = row.iloc[0].to_dict()
            if 'id' in result:
                result['id'] = str(result['id'])
            return result
        return None

    def filter_df(self, filters: dict | None, apartment_ids: list[str] | None = None) -> pd.DataFrame:
        """Return a filtered DataFrame (no pagination) according to shared filter semantics.

        If `apartment_ids` provided, acts as a hard subset prior to applying other filters.
        """
        df = self.df
        # Hard subset first (IDs stored as str)
        if apartment_ids:
            id_set = set(str(x) for x in apartment_ids)
            if 'id' in df.columns:
                df = df[df['id'].isin(id_set)]
        if not filters:
            return df
        # Numeric price shortcuts
        if "price_min" in filters and "price" in df.columns and filters["price_min"] is not None:
            df = df[df["price"] >= filters["price_min"]]
        if "price_max" in filters and "price" in df.columns and filters["price_max"] is not None:
            df = df[df["price"] <= filters["price_max"]]
        # Generic numeric range filtering based on *_min / *_max suffix
        for key, value in list(filters.items()):
            if value is None:
                continue
            if key.endswith('_min'):
                base = key[:-4]
                if base in df.columns and np.issubdtype(df[base].dtype, np.number):
                    df = df[df[base] >= value]
            elif key.endswith('_max'):
                base = key[:-4]
                # distance_from_city_center_max handled separately below
                if base in df.columns and np.issubdtype(df[base].dtype, np.number):
                    df = df[df[base] <= value]
        # Special single-sided max for distance_from_city_center_max
        if 'distance_from_city_center_max' in filters and 'distance_from_city_center' in df.columns:
            val = filters['distance_from_city_center_max']
            if val is not None:
                df = df[df['distance_from_city_center'] <= val]
        # Categorical multi-select filters
        if 'room_types' in filters and 'room_type' in df.columns and filters['room_types']:
            df = df[df['room_type'].isin(filters['room_types'])]
        if 'property_types' in filters and 'property_type' in df.columns and filters['property_types']:
            df = df[df['property_type'].isin(filters['property_types'])]
        if 'neighbourhoods' in filters and filters['neighbourhoods']:
            col = 'neighbourhood_cleansed' if 'neighbourhood_cleansed' in df.columns else 'neighbourhood'
            if col in df.columns:
                df = df[df[col].isin(filters['neighbourhoods'])]
        if 'neighbourhood_groups' in filters and filters['neighbourhood_groups']:
            colg = 'neighbourhood_group_cleansed' if 'neighbourhood_group_cleansed' in df.columns else 'neighbourhood_group'
            if colg in df.columns:
                df = df[df[colg].isin(filters['neighbourhood_groups'])]
        return df

    def sort_df(self, df: pd.DataFrame, sort_by: Optional[str], sort_order: Optional[str]) -> pd.DataFrame:
        if not sort_by:
            return df
        ascending = True if (sort_order or 'asc').lower() == 'asc' else False
        sort_column = sort_by
        # Provide alias fallbacks for commonly requested fields
        alias_map = {
            'distance_from_city_center': 'distance_from_city_center',
            'distance_from_center': 'distance_from_center',
        }
        if sort_column not in df.columns:
            if sort_column == 'distance_from_city_center' and 'distance_from_center' in df.columns:
                sort_column = 'distance_from_center'
            elif sort_column == 'distance_from_center' and 'distance_from_city_center' in df.columns:
                sort_column = 'distance_from_city_center'
            else:
                sort_column = alias_map.get(sort_column, sort_column)
        if sort_column not in df.columns:
            return df
        try:
            return df.sort_values(by=sort_column, ascending=ascending, na_position='last', kind='mergesort')
        except Exception:
            return df

    def list_apartments(self, offset=0, limit=50, filters: dict = None, sort_by: Optional[str] = None, sort_order: Optional[str] = None):
        df = self.filter_df(filters)
        df = self.sort_df(df, sort_by, sort_order)
        total = len(df)
        page = df.iloc[offset : offset + limit]
        # Convert to records and ensure IDs are strings
        records = page.to_dict(orient="records")
        for record in records:
            if 'id' in record:
                record['id'] = str(record['id'])
        return records, total


# instantiate singleton on import
DATASTORE = DataStore()
