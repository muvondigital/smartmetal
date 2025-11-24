# KGSB Grating Catalogue Structure

This document explains how KGSB grating codes are structured and how they map to the database.

## Order Code Pattern

KGSB grating codes follow this pattern: **TA [LOADBAR]-[SERIES]-[MATERIAL]-[SURFACE]-[FINISH]**

Example: `TA-255-1-M-P-G`

### Code Breakdown

1. **Type Prefix**: `TA` (standard type for steel gratings)

2. **Load Bar Size Code**: 3-digit code representing width×thickness
   - `203` = 20mm × 3mm
   - `253` = 25mm × 3mm
   - `255` = 25mm × 5mm
   - `305` = 30mm × 5mm
   - `325` = 32mm × 5mm
   - `405` = 40mm × 5mm
   - `406` = 40mm × 6mm
   - And others as specified in catalogue

3. **Series** (pitch type):
   - `1` = 30mm pitch (close spacing, heavy duty)
   - `2` = 40mm pitch (medium spacing, standard duty)
   - `3` = 60mm pitch (wide spacing, light duty)

4. **Material Type**:
   - `M` = Mild Steel (MS / Carbon Steel)
   - `S` = Stainless Steel (SS / 304/316)

5. **Surface**:
   - `P` = Plain (smooth surface)
   - `S` = Serrated (non-slip surface)

6. **Finish**:
   - `G` = Galvanized (Hot Dip Galvanized / GI)
   - `B` = Black Bitumen (painted with bitumen)
   - `U` = Untreated (bare/uncoated steel)

## Imperial Codes

Some gratings also have imperial designations like:
- `19-W-4` (typically corresponds to specific load bar sizes and pitches)

## Database Mapping

The grating attributes are stored in the `materials` table as follows:

- `material_code`: Full KGSB code (e.g., "KGSB-TA-255-1-M-P-G")
- `category`: "grating"
- `size_description`: Load bar dimensions (e.g., "25x5")
- `spec_standard`: Pitch in mm (e.g., "30mm pitch", "Series 1")
- `grade`: Series number or duty class (e.g., "Series 1", "light", "medium", "heavy")
- `material_type`: "Mild Steel" or "Stainless Steel"
- `notes`: JSON string containing:
  ```json
  {
    "series": 1,
    "pitch_mm": 30,
    "load_bar_width_mm": 25,
    "load_bar_thickness_mm": 5,
    "surface": "plain",
    "finish": "galvanized",
    "imperial_code": null,
    "duty_class": "heavy"
  }
  ```

## Matching Logic

The material matcher recognizes gratings by:

1. **Category check**: `category === "grating"`
2. **Description keywords**: Contains "grating", "grate", "grating panel"
3. **Size pattern**: Matches "WIDTHxTHICKNESS" (e.g., "25x5", "32x5")
4. **Series/pitch**: Extracts "Series 1/2/3" or "30/40/60mm pitch"
5. **Surface**: Detects "plain" vs "serrated"
6. **Finish**: Detects "galvanized", "GI", "hot dip", "bitumen", "untreated"
7. **Material**: Detects "mild steel", "MS", "stainless", "SS"
8. **Imperial codes**: Matches patterns like "19-W-4"

## Example RFQ Descriptions

These descriptions should match KGSB gratings:

- "Mild steel grating 25x5, serrated, 30mm pitch, hot dip galvanized, Series 1"
- "Grating 32x5, plain, 40mm pitch, MS, GI"
- "19-W-4 galvanized grating"
- "KGSB TA-255-1-M-P-G grating panel"
- "Stainless steel grating 30x5, serrated, Series 2, untreated"

