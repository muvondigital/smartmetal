# Critical Analysis: Why Extraction Might Only Get ~60 Items

## Your Concern is VALID - Here's Why:

### Potential Bottlenecks I Found:

#### 1. **MIN_NUMERIC_ROWS = 10** (Line 494) ⚠️
- **Problem**: Tables with < 10 numeric rows are REJECTED unless they have a "boost signal"
- **Impact**: Smaller tables (like NAMEPLATE with 2 items) might be filtered out
- **Fix Needed**: Lower threshold or make boost signal more lenient

#### 2. **Table Deduplication During Merge** (Lines 1033-1075) ⚠️
- **Problem**: Uses composite key `itemNum_page_descriptionHash` for deduplication
- **Risk**: If same item number appears on different pages with similar descriptions, one might be dropped
- **Impact**: Could lose legitimate items that appear in multiple sections

#### 3. **Row Filtering** (Lines 1318-1340) ⚠️
- **Problem**: Rows without valid item numbers are SKIPPED
- **Commented Code**: There's logic to handle rows with description+quantity but no item number, but it's DISABLED
- **Impact**: Items without item numbers (but with valid description+quantity) are lost

#### 4. **MIN_TABLE_SCORE = 10** (Line 493) ⚠️
- **Problem**: Tables scoring below 10 are filtered out
- **Impact**: Some valid tables might be rejected if they have low scores

#### 5. **Table Grouping** (Line 2204) ⚠️
- **Problem**: Tables are grouped and merged. If grouping is wrong, items could be lost
- **Impact**: Related tables might be incorrectly merged, losing items

## Expected vs Reality:

### If ALL tables are processed:
- **Expected**: 150-250 items (from all 10 pages)
- **Your Concern**: ~60 items (if bottlenecks filter out items)

### Why ~60 items is plausible:
- If only ~8-10 tables pass all filters (MIN_SCORE, MIN_NUMERIC_ROWS, boost signal)
- And each table has ~6-8 items
- Total: ~48-80 items ≈ **~60 items**

## What Needs to Be Fixed:

1. **Lower MIN_NUMERIC_ROWS** from 10 to 5 (or remove requirement if boost signal exists)
2. **Enable row processing for items without item numbers** (if they have description+quantity)
3. **Review table deduplication logic** - ensure it doesn't drop legitimate items
4. **Add logging** to show which tables/rows are being filtered and why

## Recommendation:

**Test first, then fix if needed:**
1. Upload `mto_shell.pdf` after deployment
2. Check logs for:
   - How many tables passed MIN_TABLE_SCORE
   - How many tables passed MIN_NUMERIC_ROWS
   - How many rows were filtered
   - Final item count
3. If only ~60 items, then fix the bottlenecks above
