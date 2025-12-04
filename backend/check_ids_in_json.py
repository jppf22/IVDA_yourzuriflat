import pandas as pd

# Load the data
df = pd.read_json('Notebooks/listings_clean.json', lines=True)

print(f'Total apartments in JSON: {len(df)}')
print(f'ID column type: {df["id"].dtype}')
print(f'First 5 IDs: {df["id"].head().tolist()}')
print()

# Check the diverse apartment IDs
target_ids = [
    '1335415072851654786',
    '41918871', 
    '1394246341800020789',
    '1159313067199212228',
    '14781925'
]

print('Checking calibration popup IDs:')
for tid in target_ids:
    # Try both string and int comparison
    found_str = df[df['id'].astype(str) == tid]
    found_int = df[df['id'] == int(tid)]
    
    status_str = "FOUND (str)" if len(found_str) > 0 else "NOT FOUND (str)"
    status_int = "FOUND (int)" if len(found_int) > 0 else "NOT FOUND (int)"
    
    print(f'{tid}: {status_str}, {status_int}')
    
    if len(found_str) > 0:
        print(f'  → Name: {found_str.iloc[0]["name"]}')
