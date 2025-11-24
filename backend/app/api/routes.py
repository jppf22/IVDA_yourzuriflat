from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel
import math
import numpy as np


def _sanitize_for_json(obj):
    """Recursively convert numpy types to native Python and replace NaN/Inf with None."""
    if isinstance(obj, dict):
        return {k: _sanitize_for_json(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize_for_json(v) for v in obj]
    # numpy scalars
    if isinstance(obj, (np.floating, np.integer)):
        try:
            return obj.item()
        except Exception:
            return float(obj)
    if isinstance(obj, np.ndarray):
        return _sanitize_for_json(obj.tolist())
    # native floats: guard NaN/Inf
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj
    return obj

from app.data.loader import DATASTORE
from app.models.session_model import SESSION_MODEL

from sklearn.decomposition import PCA
from sklearn.cluster import KMeans

router = APIRouter()


class ApartmentsResponse(BaseModel):
    apartments: List[dict]
    total: int
    page: int = 1
    limit: int = 50


class FilterOptionsResponse(BaseModel):
    room_types: List[str] = []
    property_types: List[str] = []
    neighbourhoods: List[str] = []
    neighbourhood_groups: List[str] = []


class RatingRequest(BaseModel):
    session_id: str
    apartment_id: str  # accept string ids from frontend
    rating: float


@router.get("/apartments", response_model=ApartmentsResponse)
def get_apartments(
    price_min: Optional[float] = Query(None),
    price_max: Optional[float] = Query(None),
    accommodates_min: Optional[float] = Query(None),
    accommodates_max: Optional[float] = Query(None),
    bedrooms_min: Optional[float] = Query(None),
    bedrooms_max: Optional[float] = Query(None),
    bathrooms_min: Optional[float] = Query(None),
    bathrooms_max: Optional[float] = Query(None),
    beds_min: Optional[float] = Query(None),
    beds_max: Optional[float] = Query(None),
    minimum_nights_min: Optional[float] = Query(None),
    minimum_nights_max: Optional[float] = Query(None),
    maximum_nights_min: Optional[float] = Query(None),
    maximum_nights_max: Optional[float] = Query(None),
    distance_from_city_center_max: Optional[float] = Query(None),
    number_of_reviews_min: Optional[float] = Query(None),
    availability_365_min: Optional[float] = Query(None),
    room_types: Optional[List[str]] = Query(None),
    property_types: Optional[List[str]] = Query(None),
    neighbourhoods: Optional[List[str]] = Query(None),
    neighbourhood_groups: Optional[List[str]] = Query(None),
    page: int = 1,
    limit: int = 50,
):
    filters = {}
    # Numeric ranges
    for name, val in [
        ("price_min", price_min), ("price_max", price_max),
        ("accommodates_min", accommodates_min), ("accommodates_max", accommodates_max),
        ("bedrooms_min", bedrooms_min), ("bedrooms_max", bedrooms_max),
        ("bathrooms_min", bathrooms_min), ("bathrooms_max", bathrooms_max),
        ("beds_min", beds_min), ("beds_max", beds_max),
        ("minimum_nights_min", minimum_nights_min), ("minimum_nights_max", minimum_nights_max),
        ("maximum_nights_min", maximum_nights_min), ("maximum_nights_max", maximum_nights_max),
        ("distance_from_city_center_max", distance_from_city_center_max),
        ("number_of_reviews_min", number_of_reviews_min),
        ("availability_365_min", availability_365_min),
    ]:
        if val is not None:
            filters[name] = val
    # Categorical lists
    if room_types:
        filters["room_types"] = room_types
    if property_types:
        filters["property_types"] = property_types
    if neighbourhoods:
        filters["neighbourhoods"] = neighbourhoods
    if neighbourhood_groups:
        filters["neighbourhood_groups"] = neighbourhood_groups
    offset = (page - 1) * limit
    items, total = DATASTORE.list_apartments(offset=offset, limit=limit, filters=filters)
    payload = {"apartments": items, "total": total, "page": page, "limit": limit}
    encoded = jsonable_encoder(payload)
    return JSONResponse(content=_sanitize_for_json(encoded))


@router.get("/apartments/{apartment_id}")
def get_apartment(apartment_id: int):
    apt = DATASTORE.get_apartment(apartment_id)
    if apt is None:
        raise HTTPException(status_code=404, detail="Apartment not found")
    encoded = jsonable_encoder(apt)
    return JSONResponse(content=_sanitize_for_json(encoded))


@router.post("/ratings")
def post_rating(r: RatingRequest):
    SESSION_MODEL.add_rating(r.session_id, r.apartment_id, r.rating)
    count = len(SESSION_MODEL.sessions.get(r.session_id, {}))
    encoded = jsonable_encoder({"success": True, "message": "Rating recorded", "ratings_count": count})
    return JSONResponse(content=_sanitize_for_json(encoded))


@router.get("/recommendations")
def get_recommendations(
    session_id: str = Query(...),
    limit: int = 50,
    price_min: Optional[float] = Query(None),
    price_max: Optional[float] = Query(None),
    accommodates_min: Optional[float] = Query(None),
    accommodates_max: Optional[float] = Query(None),
    bedrooms_min: Optional[float] = Query(None),
    bedrooms_max: Optional[float] = Query(None),
    bathrooms_min: Optional[float] = Query(None),
    bathrooms_max: Optional[float] = Query(None),
    beds_min: Optional[float] = Query(None),
    beds_max: Optional[float] = Query(None),
    minimum_nights_min: Optional[float] = Query(None),
    minimum_nights_max: Optional[float] = Query(None),
    maximum_nights_min: Optional[float] = Query(None),
    maximum_nights_max: Optional[float] = Query(None),
    distance_from_city_center_max: Optional[float] = Query(None),
    number_of_reviews_min: Optional[float] = Query(None),
    availability_365_min: Optional[float] = Query(None),
    room_types: Optional[List[str]] = Query(None),
    property_types: Optional[List[str]] = Query(None),
    neighbourhoods: Optional[List[str]] = Query(None),
    neighbourhood_groups: Optional[List[str]] = Query(None),
):
    # Assemble filters dict
    filters = {}
    for name, val in [
        ("price_min", price_min), ("price_max", price_max),
        ("accommodates_min", accommodates_min), ("accommodates_max", accommodates_max),
        ("bedrooms_min", bedrooms_min), ("bedrooms_max", bedrooms_max),
        ("bathrooms_min", bathrooms_min), ("bathrooms_max", bathrooms_max),
        ("beds_min", beds_min), ("beds_max", beds_max),
        ("minimum_nights_min", minimum_nights_min), ("minimum_nights_max", minimum_nights_max),
        ("maximum_nights_min", maximum_nights_min), ("maximum_nights_max", maximum_nights_max),
        ("distance_from_city_center_max", distance_from_city_center_max),
        ("number_of_reviews_min", number_of_reviews_min),
        ("availability_365_min", availability_365_min),
    ]:
        if val is not None:
            filters[name] = val
    if room_types:
        filters["room_types"] = room_types
    if property_types:
        filters["property_types"] = property_types
    if neighbourhoods:
        filters["neighbourhoods"] = neighbourhoods
    if neighbourhood_groups:
        filters["neighbourhood_groups"] = neighbourhood_groups

    df_filtered = DATASTORE.filter_df(filters)
    if df_filtered.shape[0] == 0:
        payload = {"recommendations": [], "session_id": session_id, "model_trained": False}
        encoded = jsonable_encoder(payload)
        return JSONResponse(content=_sanitize_for_json(encoded))

    scores = SESSION_MODEL.predict_scores(session_id)
    if scores is None:
        # Fallback ranking within filtered subset
        df_sorted = df_filtered.copy()
        sort_cols = []
        if "review_scores_rating" in df_sorted.columns:
            sort_cols.append("review_scores_rating")
        elif "number_of_reviews" in df_sorted.columns:
            sort_cols.append("number_of_reviews")
        if "price" in df_sorted.columns:
            sort_cols.append("price")
        if sort_cols:
            ascending_map = {
                "review_scores_rating": False,
                "number_of_reviews": False,
                "price": True,
            }
            ascending = [ascending_map[c] for c in sort_cols]
            try:
                df_sorted = df_sorted.sort_values(by=sort_cols, ascending=ascending)
            except Exception:
                pass
        items = df_sorted.head(limit).to_dict(orient="records")
        def _fallback_score(row: dict):
            return row.get("review_scores_rating") or row.get("number_of_reviews") or 0
        payload = {"recommendations": [{"apartment": it, "predicted_score": _fallback_score(it)} for it in items], "session_id": session_id, "model_trained": False}
        encoded = jsonable_encoder(payload)
        return JSONResponse(content=_sanitize_for_json(encoded))

    # Subset scores to filtered indices
    filtered_indices = df_filtered.index.to_numpy()
    try:
        filtered_scores = scores[filtered_indices]
    except Exception:
        # If indexing fails, fall back to full scores order but only including filtered rows
        filtered_scores = np.array([scores[i] for i in filtered_indices])
    top_idx_local = np.argsort(-filtered_scores)[:limit]
    recs = []
    for local_i in top_idx_local:
        global_idx = filtered_indices[local_i]
        apt = DATASTORE.df.iloc[int(global_idx)].to_dict()
        recs.append({"apartment": apt, "predicted_score": float(filtered_scores[local_i])})
    payload = {"recommendations": recs, "session_id": session_id, "model_trained": True}
    encoded = jsonable_encoder(payload)
    return JSONResponse(content=_sanitize_for_json(encoded))


@router.get("/pca")
def get_pca(
    attributes: Optional[str] = Query(None),
    filter_outliers: bool = Query(False),
    price_min: Optional[float] = Query(None),
    price_max: Optional[float] = Query(None),
    accommodates_min: Optional[float] = Query(None),
    accommodates_max: Optional[float] = Query(None),
    bedrooms_min: Optional[float] = Query(None),
    bedrooms_max: Optional[float] = Query(None),
    bathrooms_min: Optional[float] = Query(None),
    bathrooms_max: Optional[float] = Query(None),
    beds_min: Optional[float] = Query(None),
    beds_max: Optional[float] = Query(None),
    minimum_nights_min: Optional[float] = Query(None),
    minimum_nights_max: Optional[float] = Query(None),
    maximum_nights_min: Optional[float] = Query(None),
    maximum_nights_max: Optional[float] = Query(None),
    distance_from_city_center_max: Optional[float] = Query(None),
    number_of_reviews_min: Optional[float] = Query(None),
    availability_365_min: Optional[float] = Query(None),
    room_types: Optional[List[str]] = Query(None),
    property_types: Optional[List[str]] = Query(None),
    neighbourhoods: Optional[List[str]] = Query(None),
    neighbourhood_groups: Optional[List[str]] = Query(None),
):
    # Parse attribute list (only keep numeric columns)
    requested = [a.strip() for a in attributes.split(',')] if attributes else []
    numeric_cols_available = set(getattr(DATASTORE, 'numeric_columns', []))
    selected = [c for c in requested if c in numeric_cols_available]
    # Build filters dict (reuse semantics)
    filters = {}
    for name, val in [
        ("price_min", price_min), ("price_max", price_max),
        ("accommodates_min", accommodates_min), ("accommodates_max", accommodates_max),
        ("bedrooms_min", bedrooms_min), ("bedrooms_max", bedrooms_max),
        ("bathrooms_min", bathrooms_min), ("bathrooms_max", bathrooms_max),
        ("beds_min", beds_min), ("beds_max", beds_max),
        ("minimum_nights_min", minimum_nights_min), ("minimum_nights_max", minimum_nights_max),
        ("maximum_nights_min", maximum_nights_min), ("maximum_nights_max", maximum_nights_max),
        ("distance_from_city_center_max", distance_from_city_center_max),
        ("number_of_reviews_min", number_of_reviews_min),
        ("availability_365_min", availability_365_min),
    ]:
        if val is not None:
            filters[name] = val
    if room_types:
        filters["room_types"] = room_types
    if property_types:
        filters["property_types"] = property_types
    if neighbourhoods:
        filters["neighbourhoods"] = neighbourhoods
    if neighbourhood_groups:
        filters["neighbourhood_groups"] = neighbourhood_groups

    df_filtered = DATASTORE.filter_df(filters)
    if df_filtered.shape[0] == 0 or len(selected) < 2:
        return {"points": [], "x_label": "", "y_label": "", "mode": "empty"}

    # Raw 2D scatter when exactly two attributes selected
    if len(selected) == 2:
        a1, a2 = selected
        # Optionally filter outliers if requested (simple IQR filter per axis)
        plot_df = df_filtered[[a1, a2, 'id']].dropna()
        if filter_outliers:
            def _iqr_mask(s):
                q1 = s.quantile(0.25)
                q3 = s.quantile(0.75)
                iqr = q3 - q1
                return (s >= q1 - 1.5 * iqr) & (s <= q3 + 1.5 * iqr)
            mask = _iqr_mask(plot_df[a1]) & _iqr_mask(plot_df[a2])
            plot_df = plot_df[mask]
        points = []
        for _, row in plot_df.iterrows():
            apt = df_filtered[df_filtered['id'] == row['id']].iloc[0]
            points.append({"apartment_id": str(row['id']), "x": float(row[a1]), "y": float(row[a2]), "apartment": apt.to_dict()})
        payload = {"points": points, "x_label": a1, "y_label": a2, "mode": "raw"}
        return JSONResponse(content=_sanitize_for_json(jsonable_encoder(payload)))

    # PCA for >2 attributes
    plot_df = df_filtered[selected + ['id']].dropna()
    if plot_df.shape[0] == 0:
        return {"points": [], "x_label": "", "y_label": "", "mode": "pca"}
    X_sub = plot_df[selected].to_numpy(dtype=float)
    # simple standardization
    X_sub = (X_sub - X_sub.mean(axis=0)) / (X_sub.std(axis=0) + 1e-9)
    pca = PCA(n_components=2)
    coords = pca.fit_transform(X_sub)
    points = []
    for idx, row in enumerate(coords):
        apt = df_filtered[df_filtered['id'] == plot_df.iloc[idx]['id']].iloc[0]
        points.append({"apartment_id": str(plot_df.iloc[idx]['id']), "x": float(row[0]), "y": float(row[1]), "apartment": apt.to_dict()})
    payload = {"points": points, "x_label": "", "y_label": "", "explained_variance": pca.explained_variance_ratio_.tolist(), "mode": "pca"}
    return JSONResponse(content=_sanitize_for_json(jsonable_encoder(payload)))


@router.get("/explainability")
def get_explainability(session_id: str = Query(...), apartment_ids: Optional[str] = Query(None)):
    if apartment_ids:
        ids = [int(x) for x in apartment_ids.split(",")]
    else:
        ids = []
    coeffs = SESSION_MODEL.coefficients(session_id)
    if coeffs is None:
        raise HTTPException(status_code=400, detail="Model not trained for this session")
    contributions = SESSION_MODEL.contributions_for(session_id, ids) if ids else []
    payload = {"coefficients": coeffs, "contributions": contributions}
    encoded = jsonable_encoder(payload)
    return JSONResponse(content=_sanitize_for_json(encoded))


@router.get("/clusters")
def get_clusters(
    n_clusters: int = 5,
    price_min: Optional[float] = Query(None),
    price_max: Optional[float] = Query(None),
    accommodates_min: Optional[float] = Query(None),
    accommodates_max: Optional[float] = Query(None),
    bedrooms_min: Optional[float] = Query(None),
    bedrooms_max: Optional[float] = Query(None),
    bathrooms_min: Optional[float] = Query(None),
    bathrooms_max: Optional[float] = Query(None),
    beds_min: Optional[float] = Query(None),
    beds_max: Optional[float] = Query(None),
    minimum_nights_min: Optional[float] = Query(None),
    minimum_nights_max: Optional[float] = Query(None),
    maximum_nights_min: Optional[float] = Query(None),
    maximum_nights_max: Optional[float] = Query(None),
    distance_from_city_center_max: Optional[float] = Query(None),
    number_of_reviews_min: Optional[float] = Query(None),
    availability_365_min: Optional[float] = Query(None),
    room_types: Optional[List[str]] = Query(None),
    property_types: Optional[List[str]] = Query(None),
    neighbourhoods: Optional[List[str]] = Query(None),
    neighbourhood_groups: Optional[List[str]] = Query(None),
):
    filters = {}
    for name, val in [
        ("price_min", price_min), ("price_max", price_max),
        ("accommodates_min", accommodates_min), ("accommodates_max", accommodates_max),
        ("bedrooms_min", bedrooms_min), ("bedrooms_max", bedrooms_max),
        ("bathrooms_min", bathrooms_min), ("bathrooms_max", bathrooms_max),
        ("beds_min", beds_min), ("beds_max", beds_max),
        ("minimum_nights_min", minimum_nights_min), ("minimum_nights_max", minimum_nights_max),
        ("maximum_nights_min", maximum_nights_min), ("maximum_nights_max", maximum_nights_max),
        ("distance_from_city_center_max", distance_from_city_center_max),
        ("number_of_reviews_min", number_of_reviews_min),
        ("availability_365_min", availability_365_min),
    ]:
        if val is not None:
            filters[name] = val
    if room_types:
        filters["room_types"] = room_types
    if property_types:
        filters["property_types"] = property_types
    if neighbourhoods:
        filters["neighbourhoods"] = neighbourhoods
    if neighbourhood_groups:
        filters["neighbourhood_groups"] = neighbourhood_groups

    df_filtered = DATASTORE.filter_df(filters)
    if df_filtered.shape[0] == 0:
        return {"clusters": [], "centroids": []}

    # Transform features for clustering (use existing preprocessing)
    drop_cols = ['id', 'name', 'host_id', 'host_name']
    drop_cols = [c for c in drop_cols if c in df_filtered.columns]
    df_model = df_filtered.drop(columns=drop_cols)
    try:
        X_sub = DATASTORE.preprocess.transform(df_model)
        if hasattr(X_sub, 'toarray'):
            X_sub = X_sub.toarray()
    except Exception:
        X_sub = np.zeros((df_filtered.shape[0], 0))
    if X_sub.shape[1] == 0:
        return {"clusters": [], "centroids": []}

    # Adjust cluster count if filtered rows fewer than requested clusters
    effective_clusters = min(n_clusters, df_filtered.shape[0])
    if effective_clusters < 1:
        return {"clusters": [], "centroids": []}
    kmeans = KMeans(n_clusters=effective_clusters, random_state=0)
    labels = kmeans.fit_predict(X_sub)
    clusters = []
    for idx, lab in enumerate(labels):
        apt = df_filtered.iloc[idx]
        clusters.append({"apartment_id": str(apt["id"]), "cluster_id": int(lab), "apartment": apt.to_dict()})
    # compute geographic centroids and sizes
    centroids = []
    for cid in range(int(labels.max()) + 1):
        idxs = [i for i, lab in enumerate(labels) if int(lab) == cid]
        if len(idxs) == 0:
            continue
        if 'latitude' in df_filtered.columns and 'longitude' in df_filtered.columns:
            lats = df_filtered.iloc[idxs]['latitude'].astype(float)
            lons = df_filtered.iloc[idxs]['longitude'].astype(float)
            lat_mean = float(lats.mean())
            lon_mean = float(lons.mean())
        else:
            lat_mean = 0.0
            lon_mean = 0.0
        centroids.append({"cluster_id": int(cid), "latitude": lat_mean, "longitude": lon_mean, "size": len(idxs)})
    payload = {"clusters": clusters, "centroids": centroids}
    encoded = jsonable_encoder(payload)
    return JSONResponse(content=_sanitize_for_json(encoded))


@router.get("/initial-sample")
def initial_sample(
    k: int = 5,
    price_min: Optional[float] = Query(None),
    price_max: Optional[float] = Query(None),
    accommodates_min: Optional[float] = Query(None),
    accommodates_max: Optional[float] = Query(None),
    bedrooms_min: Optional[float] = Query(None),
    bedrooms_max: Optional[float] = Query(None),
    bathrooms_min: Optional[float] = Query(None),
    bathrooms_max: Optional[float] = Query(None),
    beds_min: Optional[float] = Query(None),
    beds_max: Optional[float] = Query(None),
    minimum_nights_min: Optional[float] = Query(None),
    minimum_nights_max: Optional[float] = Query(None),
    maximum_nights_min: Optional[float] = Query(None),
    maximum_nights_max: Optional[float] = Query(None),
    distance_from_city_center_max: Optional[float] = Query(None),
    number_of_reviews_min: Optional[float] = Query(None),
    availability_365_min: Optional[float] = Query(None),
    room_types: Optional[List[str]] = Query(None),
    property_types: Optional[List[str]] = Query(None),
    neighbourhoods: Optional[List[str]] = Query(None),
    neighbourhood_groups: Optional[List[str]] = Query(None),
):
    # Build filters dict
    filters = {}
    for name, val in [
        ("price_min", price_min), ("price_max", price_max),
        ("accommodates_min", accommodates_min), ("accommodates_max", accommodates_max),
        ("bedrooms_min", bedrooms_min), ("bedrooms_max", bedrooms_max),
        ("bathrooms_min", bathrooms_min), ("bathrooms_max", bathrooms_max),
        ("beds_min", beds_min), ("beds_max", beds_max),
        ("minimum_nights_min", minimum_nights_min), ("minimum_nights_max", minimum_nights_max),
        ("maximum_nights_min", maximum_nights_min), ("maximum_nights_max", maximum_nights_max),
        ("distance_from_city_center_max", distance_from_city_center_max),
        ("number_of_reviews_min", number_of_reviews_min),
        ("availability_365_min", availability_365_min),
    ]:
        if val is not None:
            filters[name] = val
    if room_types:
        filters["room_types"] = room_types
    if property_types:
        filters["property_types"] = property_types
    if neighbourhoods:
        filters["neighbourhoods"] = neighbourhoods
    if neighbourhood_groups:
        filters["neighbourhood_groups"] = neighbourhood_groups

    df_filtered = DATASTORE.filter_df(filters)
    if df_filtered.shape[0] == 0:
        return {"apartments": [], "sample_size": 0}

    # Transform filtered subset using existing preprocess to obtain feature vectors
    drop_cols = ['id', 'name', 'host_id', 'host_name']
    drop_cols = [c for c in drop_cols if c in df_filtered.columns]
    df_model = df_filtered.drop(columns=drop_cols)
    try:
        X_sub = DATASTORE.preprocess.transform(df_model)
        if hasattr(X_sub, 'toarray'):
            X_sub = X_sub.toarray()
    except Exception:
        X_sub = np.zeros((df_filtered.shape[0], 0))

    n = X_sub.shape[0]
    if n == 0:
        return {"apartments": [], "sample_size": 0}

    # farthest-first greedy on subset feature space
    norms = np.linalg.norm(X_sub, axis=1)
    start_idx = norms.argmax()
    chosen = [start_idx]
    dists = np.linalg.norm(X_sub - X_sub[start_idx], axis=1)
    for _ in range(1, min(k, n)):
        idx = int(np.argmax(dists))
        chosen.append(idx)
        newd = np.linalg.norm(X_sub - X_sub[idx], axis=1)
        dists = np.minimum(dists, newd)
    items = [df_filtered.iloc[int(i)].to_dict() for i in chosen]
    payload = {"apartments": items, "sample_size": len(items)}
    encoded = jsonable_encoder(payload)
    return JSONResponse(content=_sanitize_for_json(encoded))


@router.get("/filter-options", response_model=FilterOptionsResponse)
def filter_options():
    df = DATASTORE.df
    def uniq(col: str) -> List[str]:
        if col not in df.columns:
            return []
        vals = df[col].dropna().unique().tolist()
        # Coerce to str and sort for stable UI
        return sorted([str(v) for v in vals if str(v).strip()])
    room_types = uniq('room_type')
    property_types = uniq('property_type')
    # Prefer cleansed columns if present
    neighbourhoods = uniq('neighbourhood_cleansed') or uniq('neighbourhood')
    neighbourhood_groups = uniq('neighbourhood_group_cleansed') or uniq('neighbourhood_group')
    payload = {
        'room_types': room_types,
        'property_types': property_types,
        'neighbourhoods': neighbourhoods,
        'neighbourhood_groups': neighbourhood_groups,
    }
    encoded = jsonable_encoder(payload)
    return JSONResponse(content=_sanitize_for_json(encoded))
