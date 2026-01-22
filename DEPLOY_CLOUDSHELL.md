# Deploy from Cloud Shell - Step by Step

## Step 1: Clone/Pull Latest Code
```bash
# If you haven't cloned yet:
git clone https://github.com/muvondigital/smartmetal.git
cd smartmetal

# OR if already cloned, pull latest:
cd smartmetal
git pull origin main
```

## Step 2: Create Artifact Registry Repository (if needed)
```bash
# Check if repository exists
gcloud artifacts repositories list --location=us-central1

# If it doesn't exist, create it:
gcloud artifacts repositories create smartmetal-backend \
  --repository-format=docker \
  --location=us-central1 \
  --description="SmartMetal Backend Docker images"
```

## Step 3: Navigate to Backend and Build
```bash
cd backend
gcloud builds submit --tag us-central1-docker.pkg.dev/helpful-aurora-482800-v8/smartmetal-backend/smartmetal-backend:latest
```

This will:
- Find the Dockerfile in the backend directory
- Build the Docker image
- Push it to Artifact Registry (replaces deprecated GCR)

## Step 4: Deploy to Cloud Run
```bash
gcloud run deploy smartmetal-backend \
  --image us-central1-docker.pkg.dev/helpful-aurora-482800-v8/smartmetal-backend/smartmetal-backend:latest \
  --region us-central1 \
  --platform managed
```

## Step 5: Verify Deployment
```bash
# Check service status
gcloud run services describe smartmetal-backend --region us-central1

# View recent logs
gcloud run services logs read smartmetal-backend --region us-central1 --limit=50
```

## Quick One-Liner (if already in smartmetal directory)
```bash
cd backend && gcloud builds submit --tag us-central1-docker.pkg.dev/helpful-aurora-482800-v8/smartmetal-backend/smartmetal-backend:latest && gcloud run deploy smartmetal-backend --image us-central1-docker.pkg.dev/helpful-aurora-482800-v8/smartmetal-backend/smartmetal-backend:latest --region us-central1 --platform managed
```
