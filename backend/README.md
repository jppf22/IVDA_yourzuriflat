# Backend

Minimal FastAPI backend for YourZuriFlat.

Run using your existing Conda environment `IVDA_GROUP` (recommended):

```pwsh
cd backend
conda activate IVDA_GROUP
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Or, if you prefer a venv, use the following (Windows PowerShell):

```pwsh
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```

The API exposes endpoints used by the frontend such as `/apartments`, `/recommendations`, `/ratings`, `/pca`, `/explainability`, `/clusters`, and `/initial-sample`.
