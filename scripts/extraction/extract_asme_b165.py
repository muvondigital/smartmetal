"""
Extract flange dimensions from ASME B16.5 into data/flanges_dimensions.csv

Usage (example in PowerShell):

  cd C:/path/to/PRICER
  python scripts/extraction/extract_asme_b165.py ^
      --pdf "C:/Users/Administrator/Desktop/standards/ASME B16.5.pdf" ^
      --output "data/flanges_dimensions.csv" ^
      --pages "all"
"""


import argparse
import math
import os
from pathlib import Path
from typing import List, Dict, Any

import pandas as pd
import tabula

# Force tabula to use subprocess mode (avoids JPype issues)
os.environ["TABULA_USE_SUBPROCESS"] = "1"

STANDARD_NAME = "ASME B16.5-2022"
SOURCE_FILE_NAME = "ASME B16.5.pdf"
DEFAULT_FLANGE_CATEGORY = "CS"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extract ASME B16.5 flanges to CSV")
    parser.add_argument(
        "--pdf",
        required=True,
        help="Path to ASME B16.5 PDF on your machine",
    )
    parser.add_argument(
        "--output",
        required=True,
        help="Output CSV path (e.g. data/flanges_dimensions.csv)",
    )
    parser.add_argument(
        "--pages",
        default="all",
        help='Page range for tabula, e.g. "all" or "50-150". '
             "If you know the exact page range of the dimension tables, use it.",
    )
    return parser.parse_args()


def is_nan(x: Any) -> bool:
    return x is None or (isinstance(x, float) and math.isnan(x))


def normalise_header(cols: List[Any]) -> List[str]:
    """
    Convert raw column labels to simpler, lowercased names for detection.
    """
    normed = []
    for c in cols:
        if is_nan(c):
            normed.append("")
        else:
            normed.append(str(c).strip())
    return normed


def looks_like_flange_table(df: pd.DataFrame) -> bool:
    """
    Heuristic check if a table is a flange dimension table.

    We look for a header row containing something like:
      - 'NPS' or 'Nominal Pipe Size'
      - 'Class' or 'Rating'
      - 'OD' or 'Outside Diameter'
      - 'BC' or 'Bolt Circle'
    """
    if df.empty or df.shape[1] < 4:
        return False

    header = normalise_header(df.iloc[0].tolist())
    header_str = " ".join(h.lower() for h in header)

    has_nps = "nps" in header_str or "nominal pipe size" in header_str
    has_class = "class" in header_str or "rating" in header_str
    has_od = "outside" in header_str or "o.d." in header_str or "od" in header_str
    has_bc = "bolt circle" in header_str or "bc" in header_str

    return has_nps and (has_class or has_od or has_bc)


def parse_flange_rows(df: pd.DataFrame, rating_class: int = None, flange_type: str = None, facing: str = None) -> List[Dict[str, Any]]:
    """
    Convert one dimension table into normalized rows for flanges_dimensions.csv.

    This function assumes a row-oriented format like:

      NPS | DN | OD (in) | Thickness (in) | BC (in) | No. of Bolts | Bolt Dia (in) | ...

    Because layouts vary, this function is written defensively and may need
    tweaks after you inspect your PDF.
    """
    rows: List[Dict[str, Any]] = []

    # Use first non-empty row as header
    df = df.dropna(how="all")
    df = df.reset_index(drop=True)
    header = normalise_header(df.iloc[0].tolist())
    data = df.iloc[1:].reset_index(drop=True)

    # Try to detect column indices
    col_map = {
        "nps": None,
        "dn": None,
        "od": None,
        "thickness": None,
        "bc": None,
        "bolt_hole_dia": None,
        "num_bolts": None,
        "bolt_size": None,
        "bore": None,
        "hub_dia": None,
        "hub_len": None,
        "weight": None,
    }

    for idx, col_name in enumerate(header):
        lower = col_name.lower()
        if "nps" in lower or "nominal" in lower:
            col_map["nps"] = idx
        elif lower.startswith("dn"):
            col_map["dn"] = idx
        elif "outside" in lower and ("in" in lower or "inch" in lower):
            col_map["od"] = idx
        elif ("thickness" in lower or "thick" in lower) and ("in" in lower or "inch" in lower):
            col_map["thickness"] = idx
        elif "bolt circle" in lower or "bc" in lower:
            col_map["bc"] = idx
        elif "bolt hole" in lower or ("bolt" in lower and "dia" in lower):
            col_map["bolt_hole_dia"] = idx
        elif "number" in lower and "bolt" in lower or "no. of bolts" in lower:
            col_map["num_bolts"] = idx
        elif "bolt size" in lower or ("bolt" in lower and "size" in lower):
            col_map["bolt_size"] = idx
        elif "bore" in lower:
            col_map["bore"] = idx
        elif "hub" in lower and "dia" in lower:
            col_map["hub_dia"] = idx
        elif "hub" in lower and ("length" in lower or "len" in lower):
            col_map["hub_len"] = idx
        elif "weight" in lower and "kg" in lower:
            col_map["weight"] = idx

    for _, raw_row in data.iterrows():
        vals = raw_row.tolist()

        def get(col_key: str):
            idx = col_map[col_key]
            if idx is None or idx >= len(vals):
                return None
            val = vals[idx]
            if is_nan(val):
                return None
            return str(val).strip()

        nps_raw = get("nps")
        if not nps_raw:
            # probably not a valid line
            continue

        # Normalize numeric fields
        def to_float(x: Any) -> float:
            if x is None:
                return None
            s = str(x).replace(",", "").strip()
            try:
                return float(s)
            except ValueError:
                return None

        def to_int(x: Any) -> int:
            if x is None:
                return None
            s = str(x).replace(",", "").strip()
            try:
                return int(float(s))
            except ValueError:
                return None

        nps_clean = nps_raw.replace('"', "").strip()
        nps_display = nps_raw.strip()

        try:
            nps_inch = float(nps_clean)
        except ValueError:
            # For special designations like 1/8, 1/4 etc, leave as None; you can refine later.
            nps_inch = None

        dn_val = get("dn")
        dn_mm = to_int(dn_val)

        # Try to infer rating_class, type, facing from table context or row data
        # These may need to be set manually based on which table you're processing
        inferred_rating = rating_class
        inferred_type = flange_type or "WN"  # Default to Weld Neck
        inferred_facing = facing or "RF"  # Default to Raised Face

        row: Dict[str, Any] = {
            "standard": STANDARD_NAME,
            "nps_inch": nps_inch,
            "dn_mm": dn_mm,
            "rating_class": inferred_rating,
            "type": inferred_type,
            "facing": inferred_facing,
            "bore_inch": to_float(get("bore")),
            "od_inch": to_float(get("od")),
            "thickness_inch": to_float(get("thickness")),
            "hub_diameter_inch": to_float(get("hub_dia")),
            "hub_length_inch": to_float(get("hub_len")),
            "bolt_circle_inch": to_float(get("bc")),
            "bolt_hole_diameter_inch": to_float(get("bolt_hole_dia")),
            "number_of_bolts": to_int(get("num_bolts")),
            "bolt_size_inch": get("bolt_size"),
            "weight_kg": to_float(get("weight")),
            "flange_category": DEFAULT_FLANGE_CATEGORY,
            "b165_table": "",
            "b165_page": None,
            "source_file": SOURCE_FILE_NAME,
            "is_active": True,
        }

        rows.append(row)

    return rows


def extract_tables(pdf_path: Path, pages: str) -> List[pd.DataFrame]:
    print(f"Reading tables from {pdf_path} (pages={pages})")
    tables = tabula.read_pdf(
        str(pdf_path),
        pages=pages,
        multiple_tables=True,
        lattice=False,   # turn OFF lattice
        stream=True,     # turn ON stream mode
        guess=True,
    )
    print(f"Found {len(tables)} raw tables")
    return tables


def main():
    args = parse_args()
    pdf_path = Path(args.pdf)
    output_path = Path(args.output)

    if not pdf_path.exists():
        raise FileNotFoundError(f"PDF not found: {pdf_path}")

    tables = extract_tables(pdf_path, args.pages)
    all_rows: List[Dict[str, Any]] = []

    for idx, df in enumerate(tables):
        if df is None or df.empty:
            continue

        if not looks_like_flange_table(df):
            continue

        print(f"Processing table #{idx} that looks like a flange table...")
        
        # Note: You may need to manually specify rating_class, type, and facing
        # based on which table you're processing. For now, we use defaults.
        rows = parse_flange_rows(df)

        # Add table/page metadata
        for r in rows:
            r["b165_table"] = f"Table_{idx}"
            # If you know the page range, you can map idx → page manually later.
            r["b165_page"] = None

        print(f"  → extracted {len(rows)} rows from table #{idx}")
        all_rows.extend(rows)

    if not all_rows:
        print("WARNING: no flange rows extracted. You may need to adjust pages or parsing logic.")
        return

    # Deduplicate by (nps_inch, rating_class, type, facing)
    df_out = pd.DataFrame(all_rows)
    df_out = df_out.drop_duplicates(
        subset=["nps_inch", "rating_class", "type", "facing"]
    ).reset_index(drop=True)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    df_out.to_csv(output_path, index=False)
    print(f"Saved {len(df_out)} rows to {output_path}")


if __name__ == "__main__":
    main()

