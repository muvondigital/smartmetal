# Check Extraction Logs - What to Look For

## Current Status from Logs:
- `[EXTRACTION_METRICS] { candidate_rows: 36, rfq_items_inserted: 0 }`
- Still showing **36 candidate rows** - this suggests the fix might not be deployed yet, OR Table 26 still isn't extracting

## What We Need to See:

### 1. Check if Fix is Deployed
Look for logs showing:
```
[RFQ_HYBRID] Valid item at row X with missing item number, using synthetic ID...
```

### 2. Check Table 26 Extraction
Look for logs around Table 26:
```
[Tables] Processing group X: Y table(s) [26]
[Tables]   Extracted Z raw items from merged table
```

### 3. Check Total Extraction Count
Look for:
```
[RFQ_HYBRID] Extracted rawItemsCount: X
```
- Should be **> 36** if fix is working
- Should be **40-50+** if Table 26 is now extracting

## Commands to Check:

```bash
# Get more logs (earlier in the extraction process)
gcloud run services logs read smartmetal-backend --region=us-central1 --limit=200 | grep -E "EXTRACTION|RFQ_HYBRID|Tables|Table 26|synthetic ID"

# Or get full extraction logs
gcloud run services logs read smartmetal-backend --region=us-central1 --limit=500 | grep -A 5 -B 5 "Extracted rawItemsCount"

# Check if Table 26 extracted items
gcloud run services logs read smartmetal-backend --region=us-central1 --limit=500 | grep -A 10 "Table 26\|table.*26"
```

## Expected After Fix:
- Table 26 should extract 4 items (the cable tray rows)
- Total should be 36 + 4 = **40 items minimum**
- If other tables also had this issue, could be **50-60+ items**

## If Still 36 Items:
1. Check if fix is deployed (look for "synthetic ID" logs)
2. Check if Table 26 is being processed (look for table 26 logs)
3. Check if quantity detection is working (look for "Found quantity in column" logs)
