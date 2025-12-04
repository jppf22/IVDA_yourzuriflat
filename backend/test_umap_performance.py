"""
Test script to verify UMAP+LDA performance after optimizations
Run this to check if the computation completes within timeout
"""
import time
import sys
sys.path.insert(0, '.')

from app.data.loader import DATASTORE
from app.api.routes import _compute_umap_projection

def test_umap_performance():
    print("Testing UMAP+LDA performance...")
    print(f"Total apartments in dataset: {len(DATASTORE.df)}")
    
    # Test with common attributes
    attributes = "price,accommodates,bedrooms,bathrooms"
    
    start_time = time.time()
    result = _compute_umap_projection(
        attributes=attributes,
        filter_outliers=False,
        apartment_ids=None,
        price_min=None,
        price_max=None,
        accommodates_min=None,
        accommodates_max=None,
        bedrooms_min=None,
        bedrooms_max=None,
        bathrooms_min=None,
        bathrooms_max=None,
        beds_min=None,
        beds_max=None,
        minimum_nights_min=None,
        minimum_nights_max=None,
        maximum_nights_min=None,
        maximum_nights_max=None,
        distance_from_city_center_max=None,
        number_of_reviews_min=None,
        availability_365_min=None,
        room_types=None,
        property_types=None,
        neighbourhoods=None,
        neighbourhood_groups=None,
        amenities=None,
        n_topics=5,
    )
    elapsed = time.time() - start_time
    
    print(f"\n✅ Computation completed in {elapsed:.2f} seconds")
    print(f"Points generated: {len(result['points'])}")
    print(f"Topics discovered: {len(result['topics'])}")
    print(f"Mode: {result['mode']}")
    
    if elapsed > 60:
        print(f"\n⚠️  WARNING: Computation took {elapsed:.2f}s (may still timeout)")
    elif elapsed > 30:
        print(f"\n✅ Computation within 60s timeout (previously would fail at 30s)")
    else:
        print(f"\n✅ Excellent performance - well within timeout")
    
    # Show topic labels
    print("\nTopics discovered:")
    for topic in result['topics']:
        print(f"  - {topic['label']}: {', '.join(topic['keywords'][:3])}")

if __name__ == "__main__":
    test_umap_performance()
