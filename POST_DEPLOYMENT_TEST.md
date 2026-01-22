# Post-Deployment Testing Guide

## ✅ Deployment Successful!

**Service URL:** https://smartmetal-backend-293567440480.us-central1.run.app  
**Revision:** smartmetal-backend-00014-7zk  
**Status:** Serving 100% of traffic

## 🧪 Test the Fixes

### Test 1: Verify Service is Running
```bash
# Check service health
curl https://smartmetal-backend-293567440480.us-central1.run.app/health

# Should return: {"status":"ok"} or similar
```

### Test 2: Upload Test Document (mto_shell.pdf)
1. Go to your frontend: https://smartmetal.muvondigital.my
2. Upload `test_data/RealSamples/mto_shell.pdf` (10 pages)
3. **Expected Result**: Should extract **ALL items** (not just 36)
   - Previous: Only 36 items (stopped after 8 tables)
   - Now: Should extract items from ALL tables across all 10 pages

### Test 3: Upload Large Document (32-page MTO)
1. Upload `backend/src/__tests__/fixtures/WHP-DHN-S-X-2001_0 (PetroVietnam).pdf`
2. **Expected Result**: 
   - Should extract items from ALL pages
   - Should NOT show false "Missing 9842 items" warnings
   - Should show sparse numbering message instead

### Test 4: Check Logs for Fixes

```bash
# View recent logs
gcloud run services logs read smartmetal-backend --region us-central1 --limit=100

# Look for these indicators:
```

#### ✅ Fix 1: No 8-Table Limit
```
[RFQ_TABLE_ACCEPT] Accepted table X for extraction (Y total)
```
- Should show **ALL tables**, not stop at 8
- Count should be much higher than 8

#### ✅ Fix 2: Smart Sequential Validation
```
[Tables] Extracted X items with sparse numbering (range: Y - Z). Gaps are normal for section-based numbering.
```
- Should NOT show false "Missing 9842 items" warnings
- Should recognize sparse numbering pattern

#### ✅ Fix 3: Chunk Failure Detection
```
📊 Chunk Processing Summary:
   Total chunks: X
   Successful: Y
   Failed: Z
   Total items extracted: N
```
- Should show chunk processing summary
- If any chunks failed, should show warnings

## 🔍 What to Look For in Logs

### Good Signs ✅
- `[RFQ_TABLE_ACCEPT] Accepted table X for extraction (Y total)` - Y should be > 8
- `[Tables] Extracted X items with sparse numbering` - No false warnings
- `📊 Chunk Processing Summary: Successful: X, Failed: 0` - All chunks succeeded
- `✅ Merged extraction complete: X total items` - High item count

### Bad Signs ❌
- `[RFQ_TABLE_PICK] Reached MAX_ACCEPTED_TABLES (8), stopping` - **Should NOT appear**
- `⚠️ WARNING: Missing 9842 line item(s)` - **Should NOT appear for sparse numbering**
- `⚠️ CRITICAL: X chunk(s) failed` - **Should investigate if appears**

## 📊 Expected Results

### mto_shell.pdf (10 pages)
- **Before**: 36 items (only 8 tables processed)
- **After**: Should extract **ALL items** from all 10 pages
- **Expected**: 200+ items (tables, cables, steel, junction boxes, nameplates)

### WHP-DHN-S-X-2001_0 (PetroVietnam).pdf (32 pages)
- **Before**: Would fail or extract incomplete
- **After**: Should extract **ALL items** from all 32 pages
- **Expected**: 500+ items (tubulars, plates, reducers, cones, etc.)

## 🐛 If Something's Wrong

### Check Service Status
```bash
gcloud run services describe smartmetal-backend --region us-central1
```

### View Detailed Logs
```bash
gcloud run services logs read smartmetal-backend --region us-central1 --limit=200
```

### Check for Errors
```bash
gcloud run services logs read smartmetal-backend --region us-central1 --limit=200 | grep -i "error\|warning\|failed"
```

### Rollback if Needed
```bash
# List revisions
gcloud run revisions list --service smartmetal-backend --region us-central1

# Rollback to previous revision
gcloud run services update-traffic smartmetal-backend \
  --region us-central1 \
  --to-revisions smartmetal-backend-00013-xxx=100
```

## ✅ Success Criteria

1. ✅ Service is running and healthy
2. ✅ mto_shell.pdf extracts > 36 items (ideally 200+)
3. ✅ No false "missing items" warnings on MTOs
4. ✅ All chunks process successfully
5. ✅ 32-page document extracts completely

## 🎉 Next Steps

Once verified:
1. Monitor logs for a few extractions
2. Test with real customer documents
3. Verify extraction quality matches expectations
4. Document any edge cases found
