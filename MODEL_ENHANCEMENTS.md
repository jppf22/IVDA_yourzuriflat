# Content-Based Model Enhancements

## Summary of Changes

The content-based recommendation model has been enhanced with four key improvements that make recommendations more accurate, personalized, and diverse while maintaining fast real-time updates.

## 1. Feature Weighting (Importance-Based Scaling)

**Problem:** All features were treated equally, but some attributes (like location) are more important for apartment selection than others.

**Solution:** Apply differential weighting based on feature importance:
- **Location features** (distance_from_city_center, latitude, longitude): **2.0x weight**
  - Location is critical for short-term rentals (proximity to attractions, work, transit)
- **Amenity features** (WiFi, Kitchen, Parking, etc.): **1.5x weight**
  - Amenities are key differentiators that strongly influence user satisfaction
- **Key apartment attributes** (beds, bathrooms, bedrooms, accommodates, room_type): **1.3x weight**
  - Core apartment characteristics that directly impact suitability
- **Other features** (property_type, neighbourhood categories): **1.0x baseline**

**Impact:** Recommendations now prioritize apartments with desired location and amenities over minor attribute differences.

**Implementation:** `_compute_feature_weights()` method in `session_model.py`

## 2. Recency Boost (Temporal Weighting)

**Problem:** All ratings were treated equally regardless of when they were given, but user preferences can evolve over time.

**Solution:** Apply recency-based weighting to liked apartments:
- Each rating is stored with a timestamp (monotonic counter)
- More recent ratings receive up to **1.2x higher weight** in the user vector
- Weight calculation: `1.0 + 0.2 * (recency_rank / total_ratings)`
- Also incorporates **rating strength**: 5-star ratings weighted more than 4-star

**Impact:** The model adapts faster to evolving preferences and emphasizes current tastes over older ones.

**Implementation:** `_get_liked_with_weights()` method and timestamp tracking in `add_rating()`

## 3. Improved Dislike Handling (Dampened Negative Feedback)

**Problem:** Disliked items (rating ≤ 1.0) were subtracted at full strength, potentially over-filtering and eliminating too many apartments.

**Solution:** Apply dampening to the dislike centroid:
- Dislike dampening factor reduced from **1.0x → 0.5x** (ALPHA = 0.5)
- User vector = liked_centroid - 0.5 × disliked_centroid
- This still learns from dislikes but prevents overly aggressive filtering

**Impact:** Model learns what users don't want without being too restrictive, maintaining recommendation diversity.

**Implementation:** Modified `_build_user_vector()` method

## 4. Diversity Penalty (Variety Encouragement)

**Problem:** Recommendations could become too similar to each other and to already-rated apartments, reducing exploration.

**Solution:** Apply diversity penalty to reduce scores for apartments too similar to already-rated ones:
- Compute similarity between each apartment and all liked apartments
- For each apartment, find max similarity to any liked apartment
- Apply penalty: `score *= (1.0 - 0.3 * max_similarity_to_liked)`
- Penalty ranges from **0.7x to 1.0x** based on similarity

**Impact:** Recommendations include more variety, helping users discover apartments with different characteristics while still being relevant.

**Implementation:** `predict_scores()` method with `apply_diversity_penalty` parameter

## Technical Details

### Data Structure Changes

**Before:**
```python
sessions: Dict[str, Dict[str, float]]  # session_id -> {apartment_id: rating}
```

**After:**
```python
sessions: Dict[str, Dict[str, Dict[str, Any]]]  # session_id -> {apartment_id: {rating, timestamp}}
```

### User Vector Computation Flow

1. **Extract ratings** with recency weights
2. **Apply feature weighting** to the feature matrix (location 2.0x, amenities 1.5x, etc.)
3. **Compute weighted centroid** of liked items (incorporating recency and rating strength)
4. **Subtract dampened dislike centroid** (0.5x factor)
5. **Normalize** to unit vector
6. **Compute similarity scores** using feature-weighted cosine similarity
7. **Apply diversity penalty** to encourage variety

### Performance Characteristics

- **Computation complexity:** O(n_ratings + n_features) for user vector rebuild (unchanged)
- **Memory overhead:** Minimal (timestamps are small integers)
- **Real-time updates:** Still instant after each rating
- **Scalability:** Works well with dataset size (2348 apartments × ~200 features)

## Dataset Alignment

These enhancements are specifically tailored to the Zurich apartment rental dataset:

- **47 amenity features** → Weighted 1.5x to capture their importance
- **Location features** → Weighted 2.0x given Zurich's geography and tourist/work patterns
- **~200 total features** → Feature weighting prevents minor attributes from dominating
- **2348 apartments** → Diversity penalty ensures recommendations don't cluster too tightly

## API Compatibility

All enhancements are **backwards compatible**:
- Existing API endpoints work unchanged
- `get_ratings()` returns simplified dict for API compatibility
- `predict_scores()` has optional `apply_diversity_penalty` parameter (defaults to True)
- Explainability API automatically accounts for feature weighting

## Documentation Updates

Updated files:
- ✅ `backend/app/models/session_model.py` - Implementation
- ✅ `AGENT.md` - Comprehensive guidelines (sections 2.2, 5.4, 6)
- ✅ `.github/copilot-instructions.md` - Quick reference guide
- ✅ `MODEL_ENHANCEMENTS.md` - This document

## Testing Recommendations

Key test cases to implement:

```python
# tests/test_session_model.py

def test_feature_weights():
    """Verify location/amenity features have higher weights"""
    weights = SESSION_MODEL._compute_feature_weights()
    # Check that amenity features have 1.5x weight
    # Check that location features have 2.0x weight

def test_recency_boost():
    """Verify recent ratings get higher weight"""
    # Add ratings at different timestamps
    # Verify newer ratings influence user vector more

def test_diversity_penalty():
    """Verify similar apartments get lower scores"""
    # Rate similar apartments
    # Verify recommendations include diverse options

def test_dislike_dampening():
    """Verify dislikes are applied with 0.5x factor"""
    # Add liked and disliked ratings
    # Verify user vector computation uses ALPHA=0.5
```

## Future Enhancement Opportunities

While these changes provide meaningful improvements without over-engineering, potential future enhancements include:

1. **Adaptive feature weighting** - Learn optimal weights per user
2. **Temporal decay** - Exponentially decay old ratings
3. **Cluster-aware diversity** - Encourage recommendations from different apartment clusters
4. **Amenity importance learning** - Detect which amenities matter most to each user

---

**Implementation Date:** December 2025  
**Model Version:** Enhanced Content-Based v2.0  
**Backwards Compatible:** Yes
