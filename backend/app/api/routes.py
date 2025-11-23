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
import numpy as np

router = APIRouter()


class ApartmentsResponse(BaseModel):
    apartments: List[dict]
    total: int
    page: int = 1
    limit: int = 50


class RatingRequest(BaseModel):
    session_id: str
    apartment_id: int
    rating: float


@router.get("/apartments", response_model=ApartmentsResponse)
def get_apartments(
    price_min: Optional[float] = Query(None),
    price_max: Optional[float] = Query(None),
    room_types: Optional[List[str]] = Query(None),
    page: int = 1,
    limit: int = 50,
):
    filters = {}
    if price_min is not None:
        filters["price_min"] = price_min
    if price_max is not None:
        filters["price_max"] = price_max
    if room_types:
        filters["room_types"] = room_types
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
def get_recommendations(session_id: str = Query(...), limit: int = 50):
    scores = SESSION_MODEL.predict_scores(session_id)
    df = DATASTORE.df
    if scores is None:
        # fallback: rank by review_scores_rating then price
        df_sorted = df.sort_values(by=["review_scores_rating", "price"], ascending=[False, True])
        items = df_sorted.head(limit).to_dict(orient="records")
        payload = {"recommendations": [{"apartment": it, "predicted_score": it.get("review_scores_rating", 0)} for it in items], "session_id": session_id, "model_trained": False}
        encoded = jsonable_encoder(payload)
        return JSONResponse(content=_sanitize_for_json(encoded))
    idx = np.argsort(-scores)[:limit]
    recs = []
    for i in idx:
        apt = df.iloc[int(i)].to_dict()
        recs.append({"apartment": apt, "predicted_score": float(scores[int(i)])})
    payload = {"recommendations": recs, "session_id": session_id, "model_trained": True}
    encoded = jsonable_encoder(payload)
    return JSONResponse(content=_sanitize_for_json(encoded))


@router.get("/pca")
def get_pca(attributes: Optional[str] = Query(None), mode: str = Query("pca"), filter_outliers: bool = Query(False)):
    X = DATASTORE.X
    if X.shape[1] == 0:
        return {"points": [], "x_label": "", "y_label": "", "mode": mode}
    pca = PCA(n_components=2)
    coords = pca.fit_transform(X)
    points = []
    for idx, row in enumerate(coords):
        # keep apartment_id as string to avoid JavaScript numeric precision loss for large ints
        points.append({"apartment_id": str(DATASTORE.df.iloc[idx]["id"]), "x": float(row[0]), "y": float(row[1]), "apartment": DATASTORE.df.iloc[idx].to_dict()})
    payload = {"points": points, "x_label": "PC1", "y_label": "PC2", "explained_variance": pca.explained_variance_ratio_.tolist(), "mode": mode}
    encoded = jsonable_encoder(payload)
    return JSONResponse(content=_sanitize_for_json(encoded))


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
def get_clusters(n_clusters: int = 5):
    X = DATASTORE.X
    if X.shape[1] == 0:
        return {"clusters": [], "centroids": []}
    kmeans = KMeans(n_clusters=n_clusters, random_state=0)
    labels = kmeans.fit_predict(X)
    clusters = []
    for idx, lab in enumerate(labels):
        clusters.append({"apartment_id": str(DATASTORE.df.iloc[idx]["id"]), "cluster_id": int(lab), "apartment": DATASTORE.df.iloc[idx].to_dict()})
    # compute geographic centroids (latitude/longitude) and sizes for map view
    centroids = []
    df = DATASTORE.df
    for cid in range(int(labels.max()) + 1):
        idxs = [i for i, lab in enumerate(labels) if int(lab) == cid]
        if len(idxs) == 0:
            continue
        lat_col = df.columns[df.columns.str.lower() == 'latitude'][0] if 'latitude' in df.columns else None
        lon_col = df.columns[df.columns.str.lower() == 'longitude'][0] if 'longitude' in df.columns else None
        if lat_col and lon_col:
            lats = df.iloc[idxs]["latitude"].astype(float)
            lons = df.iloc[idxs]["longitude"].astype(float)
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
def initial_sample(k: int = 20):
    # farthest-first greedy on feature space
    X = DATASTORE.X
    n = X.shape[0]
    if n == 0:
        return {"apartments": [], "sample_size": 0}
    chosen = [0]
    import numpy as np

    dists = np.linalg.norm(X - X[0], axis=1)
    for _ in range(1, min(k, n)):
        idx = int(np.argmax(dists))
        chosen.append(idx)
        newd = np.linalg.norm(X - X[idx], axis=1)
        dists = np.minimum(dists, newd)
    items = [DATASTORE.df.iloc[int(i)].to_dict() for i in chosen]
    payload = {"apartments": items, "sample_size": len(items)}
    encoded = jsonable_encoder(payload)
    return JSONResponse(content=_sanitize_for_json(encoded))
