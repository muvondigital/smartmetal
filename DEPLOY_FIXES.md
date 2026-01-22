# Deploy Extraction Fixes - Quick Guide

## ✅ Code is Committed & Pushed
All fixes have been committed and pushed to `main` branch (commit: d5dc748)

## 🚀 Deploy to Cloud Run

### Step 1: Authenticate (REQUIRED)
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

1. **Upload test document** `mto_shell.pdf` (10 pages) or `WHP-DHN-S-X-2001_0 (PetroVietnam).pdf` (32 pages)
2. **Check logs** for:
   - `[RFQ_TABLE_ACCEPT] Accepted table X for extraction (Y total)` - should show ALL tables, not just 8
   - `[Tables] Extracted X items with sparse numbering` - should NOT show false "missing items" warnings
   - `📊 Chunk Processing Summary:` - should show successful/failed chunks
3. **Verify** all items are extracted (should be much more than 36 items for mto_shell.pdf)

## 📊 What Changed

### Fix 1: Removed 8-Table Limit ✅
- **Before**: Only processed first 8 tables → extracted 36 items from mto_shell.pdf
- **After**: Processes ALL valid tables → will extract ALL items
- **Impact**: Complete extraction on large documents (32-page MTOs, multi-table RFQs)

### Fix 2: Smart Sequential Validation ✅
- **Before**: Assumed sequential numbering → false warnings on MTOs (e.g., "Missing 9842 items")
- **After**: Detects pattern (sequential vs sparse) → only warns on real gaps
- **Impact**: No more false positives on hierarchical MTOs with section-based numbering

### Fix 3: Detect Failed Chunks ✅
- **Before**: Failed chunks silently returned empty arrays → data loss
- **After**: Detects and warns on failed chunks → visibility into data loss
- **Impact**: Know when extraction is incomplete due to chunk failures

### Fix 4: Chunk Failure Tracking ✅
- **Before**: No visibility into which chunks failed
- **After**: Tracks failed chunks in response metadata
- **Impact**: Better monitoring and debugging

### Fix 5: Improved Logging ✅
- **Before**: Minimal chunk processing visibility
- **After**: Detailed summary (successful/failed/total items)
- **Impact**: Better operational visibility

## ⚠️ If Something Breaks

Rollback command:
```bash
# List previous revisions
gcloud run revisions list --service smartmetal-backend --region us-central1

# Rollback to previous revision
gcloud run services update smartmetal-backend \
  --region us-central1 \
  --revision-suffix=<previous-revision-suffix>
```

## 📝 Files Modified

- `backend/src/services/aiParseService.js` - Removed 8-table limit, added smart validation
- `backend/src/utils/documentChunker.js` - Added chunk failure detection
- `backend/src/services/gcp/genaiClient.js` - Added chunk processing summary logging
- `backend/src/services/gcp/geminiApiClient.js` - Added chunk processing summary logging

## ✅ All Fixes Apply To

- RFQ (Request for Quotation)
- PO (Purchase Order)  
- MTO (Material Take-Off) - **Tested with mto_shell.pdf and PetroVietnam 32-page MTO**
- BOQ (Bill of Quantities)
- Budget
- Tender
- Change Order
- Re-quote
