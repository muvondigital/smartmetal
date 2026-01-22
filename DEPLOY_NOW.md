# Deploy Token Limits Fix - Quick Guide

## ✅ Code is Committed & Pushed
Your changes are already committed and pushed to `main` branch.

## 🚀 Deploy to Cloud Run

### Step 1: Authenticate (if needed)
```bash
gcloud auth login
gcloud config set project helpful-aurora-482800-v8
```

### Step 2: Build & Deploy Backend
```bash
cd backend
gcloud builds submit --tag gcr.io/helpful-aurora-482800-v8/smartmetal-backend:latest
gcloud run deploy smartmetal-backend \
  --image gcr.io/helpful-aurora-482800-v8/smartmetal-backend:latest \
  --region us-central1 \
  --platform managed
```

### Step 3: Verify Deployment
```bash
# Check service status
gcloud run services describe smartmetal-backend --region us-central1

# View logs
gcloud run services logs read smartmetal-backend --region us-central1 --limit=50
```

## 🧪 Test After Deployment

1. **Upload a test document** with cables + pipes
2. **Check logs** for token allocation messages:
   ```
   [MTO Extraction] Estimated X items, allocating Y tokens
   ```
3. **Verify** all items are extracted (including cables)

## 📊 What Changed

- ✅ Dynamic token allocation (was hardcoded 4000/2000)
- ✅ Extracts ALL items (was filtering cables/electrical)
- ✅ Prevents truncation on large documents

## ⚠️ If Something Breaks

Rollback command:
```bash
# Deploy previous version
gcloud run services update smartmetal-backend \
  --region us-central1 \
  --image gcr.io/helpful-aurora-482800-v8/smartmetal-backend:previous-tag
```
