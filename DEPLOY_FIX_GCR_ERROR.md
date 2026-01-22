# Fix: GCR Repository Error - Use Artifact Registry

## Problem
```
denied: gcr.io repo does not exist. Creating on push requires the artifactregistry.repositories.createOnPush permission
```

GCR (Google Container Registry) is deprecated. Use **Artifact Registry** instead.

## Solution: Use Artifact Registry

### Step 1: Create Artifact Registry Repository (if doesn't exist)
```bash
gcloud artifacts repositories create smartmetal-backend \
  --repository-format=docker \
  --location=us-central1 \
  --description="SmartMetal Backend Docker images"
```

### Step 2: Build and Push to Artifact Registry
```bash
cd backend
gcloud builds submit --tag us-central1-docker.pkg.dev/helpful-aurora-482800-v8/smartmetal-backend/smartmetal-backend:latest
```

### Step 3: Deploy to Cloud Run
```bash
gcloud run deploy smartmetal-backend \
  --image us-central1-docker.pkg.dev/helpful-aurora-482800-v8/smartmetal-backend/smartmetal-backend:latest \
  --region us-central1 \
  --platform managed
```

## Alternative: Use Cloud Build (Recommended)

Cloud Build automatically handles the repository:

```bash
cd backend
gcloud builds submit --tag us-central1-docker.pkg.dev/helpful-aurora-482800-v8/smartmetal-backend/smartmetal-backend:latest
```

If repository doesn't exist, Cloud Build will create it automatically (if you have permissions).

## Quick Fix: One Command

```bash
cd backend && \
gcloud builds submit --tag us-central1-docker.pkg.dev/helpful-aurora-482800-v8/smartmetal-backend/smartmetal-backend:latest && \
gcloud run deploy smartmetal-backend \
  --image us-central1-docker.pkg.dev/helpful-aurora-482800-v8/smartmetal-backend/smartmetal-backend:latest \
  --region us-central1 \
  --platform managed
```

## Verify Repository Exists

```bash
# List repositories
gcloud artifacts repositories list --location=us-central1

# If empty, create it:
gcloud artifacts repositories create smartmetal-backend \
  --repository-format=docker \
  --location=us-central1
```
