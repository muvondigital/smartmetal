# mto_shell.pdf - Expected Item Count Analysis

## Based on Visible Pages from Images

### Page-by-Page Breakdown:

1. **Cover Sheet (Page 1)**: 0 items (index only)

2. **TUBING & FITTING (Pages 2-3)**: 
   - Visible items: ~33 line items (1001, 1002, 1109, 1203, 5005, 5005A, 5021A, 5620, 5711A, etc.)
   - **Count: ~33 items**

3. **STEEL MATERIAL (Pages 4-5)**:
   - Sheet 4 visible: 32 line items (7034A, 7053, 7106, 7213, 7214, 7215, 7309, 7310, 7313, 7341, 7403, 7601, 7603, 7605, 7606, 7704, 7805, 7810, 7904, 7906, 7907, 7907A, 7909, 7929, 7930, 8016, 8020, 9008, 9009, 9012, 9018, 9035)
   - Sheet 5 likely has more items (not fully visible in images)
   - **Count: ~50-60 items** (conservative estimate for 2 pages)

4. **CABLE & ACCESSORIES (Page 6)**:
   - Visible items: 18 line items (2011, 2012, 2014, 2015, 2171, 2174, 2180, 2181, 2261, 2265, 2266, 2708, 2709, 2710, 2711, 2712, 4801, 4802)
   - **Count: ~18 items**

5. **CABLE LADDER & ACCESSORIES (Pages 7-8)**:
   - Sheet 7: 28 line items visible (2003-2802 range, 3020, 3609, 3610, 3301-3303)
   - Sheet 8: 6 line items visible (3304, 3535, 3536, 3611, 3602, 7929, 9035)
   - **Count: ~34 items** (28 + 6)

6. **JUNCTION BOX (Page 9)**:
   - Visible items: 5 line items (9051, 9052, 9055, 9505, 9506)
   - **Count: ~5 items**

7. **NAMEPLATE (Page 10)**:
   - Visible items: 2 line items (7708, 9045)
   - **Count: 2 items**

## Total Expected Line Items: ~142-150 items

**BUT** - The benchmark data shows:
- **274 table rows detected**
- This includes headers, summaries, and actual items

## Conservative Estimate:
- **Minimum: 150-180 distinct line items**
- **Realistic: 200-250 distinct line items** (accounting for items not fully visible in images)
- **Maximum: ~274 items** (if all table rows are legitimate items)

## What the System Should Extract:

After the fix (removing 8-table limit), the system should extract:
- **ALL tables** (not just 8)
- **ALL legitimate line items** from all 10 pages
- **Expected result: 150-250 items** (not 36)

## Verification:

After deployment, check logs for:
```
[RFQ_TABLE_ACCEPT] Accepted table X for extraction (Y total)
```
- Y should be **> 8** (ideally 20-30+ tables)
- Final item count should be **150-250 items** (not 36)
