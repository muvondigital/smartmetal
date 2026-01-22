# Deployment Checklist - Token Limits & Extraction Fix

## Changes Deployed
1. ✅ Extract ALL items (removed cable/electrical filtering)
2. ✅ Dynamic token allocation for MTO extraction (was hardcoded 4000)
3. ✅ Dynamic token allocation for Document AI (was hardcoded 2000)
4. ✅ Updated extraction prompts to extract everything

## Critical Tests After Deployment

### Test 1: Document with Mixed Items (Cables + Pipes)
- **File**: `test_data/RealSamples/mto_shell.pdf` or similar
- **Expected**: Should extract ALL items including cables
- **Check**: 
  - Item count should match what's in document
  - No truncation warnings in logs
  - Cables should be present in extraction

### Test 2: Large Document (50+ items)
- **Expected**: Should allocate enough tokens (check logs for token allocation)
- **Check**:
  - Log should show: `Estimated X items, allocating Y tokens`
  - Y should be: `4000 + (X × 200)` up to 30K max
  - No truncation errors

### Test 3: Very Large Document (100+ items)
- **Expected**: Should cap at 30K tokens, still extract all items
- **Check**:
  - Token allocation should be 30K (not higher)
  - All items extracted (no truncation)
  - Check logs for any warnings

## Monitoring After Deployment

### Watch Logs For:
1. **Token allocation messages**:
   ```
   [MTO Extraction] Estimated 48 items, allocating 13600 tokens
   [Document AI] Estimated 50 items, allocating 14000 tokens
   ```

2. **Truncation warnings** (should NOT appear):
   ```
   ⚠️ Response was truncated at X tokens
   ```

3. **Extraction completeness**:
   - Item counts should match document
   - No "extraction incomplete" errors

### Metrics to Track:
- Average tokens used per extraction
- Item extraction success rate
- Truncation rate (should be 0%)
- Cost per extraction (may increase slightly due to more tokens)

## Rollback Plan

If issues occur:
1. **Revert these files**:
   - `backend/src/services/ai/mtoExtractionService.js`
   - `backend/src/services/gcp/documentAiService.js`
   - `backend/src/ai/prompts/rfqExtractionPrompts.js`
   - `backend/src/services/aiParseService.js`

2. **Or**: Set environment variable to use old behavior (if you add feature flag)

## Expected Impact

### Positive:
- ✅ No more truncation on large documents
- ✅ All items extracted (cables, electrical, etc.)
- ✅ Better extraction completeness

### Potential Concerns:
- ⚠️ **Higher token usage** - More items = more tokens (but this is correct!)
- ⚠️ **Slightly higher costs** - More tokens = more cost (but prevents data loss)
- ⚠️ **Longer processing** - More items to process (but necessary)

## Post-Deployment Validation

Run this query to check extraction success:
```sql
SELECT 
  COUNT(*) as total_extractions,
  AVG(array_length(items, 1)) as avg_items_per_extraction,
  MAX(array_length(items, 1)) as max_items_extracted
FROM document_extractions
WHERE created_at > NOW() - INTERVAL '1 hour';
```

Compare with pre-deployment baseline.
