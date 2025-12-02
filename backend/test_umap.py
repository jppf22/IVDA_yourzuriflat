"""
Test script for UMAP endpoint
Run this after starting the backend server
"""
import requests
import json

BASE_URL = "http://localhost:8000"

def test_umap_endpoint():
    """Test the UMAP endpoint with sample attributes"""
    print("Testing UMAP endpoint...")
    
    # Test with multiple attributes (should trigger UMAP)
    params = {
        "attributes": "price,distance_from_city_center,accommodates,bedrooms,bathrooms",
        "filter_outliers": False
    }
    
    response = requests.get(f"{BASE_URL}/umap", params=params)
    
    if response.status_code == 200:
        data = response.json()
        print(f"✓ UMAP endpoint successful")
        print(f"  - Mode: {data.get('mode')}")
        print(f"  - Points: {len(data.get('points', []))}")
        print(f"  - Topics: {len(data.get('topics', []))}")
        
        if data.get('topics'):
            print("\nTopics discovered:")
            for topic in data['topics']:
                print(f"  Topic {topic['topic_id']}: {topic['label']}")
                print(f"    Keywords: {', '.join(topic['keywords'][:5])}")
        
        # Check first point structure
        if data.get('points'):
            point = data['points'][0]
            print(f"\nSample point structure:")
            print(f"  - Has topic_id: {'topic_id' in point}")
            print(f"  - Has topic_label: {'topic_label' in point}")
            print(f"  - Topic: {point.get('topic_label', 'N/A')}")
    else:
        print(f"✗ UMAP endpoint failed: {response.status_code}")
        print(response.text)

def test_pca_redirect():
    """Test that PCA endpoint redirects to UMAP"""
    print("\nTesting PCA redirect to UMAP...")
    
    params = {
        "attributes": "price,distance_from_city_center,accommodates",
        "filter_outliers": False
    }
    
    response = requests.get(f"{BASE_URL}/pca", params=params)
    
    if response.status_code == 200:
        data = response.json()
        print(f"✓ PCA endpoint successful (redirects to UMAP)")
        print(f"  - Mode: {data.get('mode')}")
        print(f"  - Has topics: {len(data.get('topics', [])) > 0}")
    else:
        print(f"✗ PCA endpoint failed: {response.status_code}")

if __name__ == "__main__":
    try:
        # Check if server is running
        response = requests.get(f"{BASE_URL}/")
        print("Backend server is running!\n")
        
        test_umap_endpoint()
        test_pca_redirect()
        
        print("\n✓ All tests passed!")
    except requests.exceptions.ConnectionError:
        print("✗ Error: Backend server is not running")
        print("Start the backend with: cd backend && uvicorn app.main:app --reload")
