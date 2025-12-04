import pandas as pd
import json
import os

# Change to script directory
os.chdir(os.path.dirname(os.path.abspath(__file__)))

# Load the dataset (JSON lines format)
df = pd.read_json('Notebooks/listings_clean.json', lines=True)

# Five diverse apartment IDs - UPDATED LIST (fixed typo)
target_ids = [
    '1335415072851654786',
    '41918871',
    '1394246341800020789',
    '1159313067199212228',  # Fixed: was 159313067199212228
    '14781925'
]

print('Checking if diverse apartment IDs exist in dataset:')
print('=' * 60)

found_count = 0
for apt_id in target_ids:
    exists = str(apt_id) in df['id'].astype(str).values
    status = '✓ EXISTS' if exists else '✗ NOT FOUND'
    print(f'{apt_id:25s} {status}')
    if exists:
        found_count += 1
        # Show basic info about the apartment
        apt = df[df['id'].astype(str) == str(apt_id)].iloc[0]
        print(f'  → {apt["name"][:60]}...')
        print(f'  → Price: ${apt["price"]}/night, Type: {apt["room_type"]}')
        print()

print('=' * 60)
print(f'Found {found_count}/{len(target_ids)} apartments')
print(f'Total apartments in dataset: {len(df)}')
