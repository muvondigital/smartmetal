"""
Extract pipe dimensions from ASME B36.10-2022 into data/pipes_dimensions.csv

Usage (example in PowerShell):

  cd C:/path/to/PRICER
  python scripts/extraction/extract_asme_b3610.py ^
      --pdf "C:/Users/Administrator/Desktop/standards/ASME B36.10-2022.pdf" ^
      --output "data/pipes_dimensions.csv" ^
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

STANDARD_NAME = "ASME B36.10M-2022"
SOURCE_FILE_NAME = "ASME B36.10-2022.pdf"
DEFAULT_PIPE_CATEGORY = "CS"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extract ASME B36.10 pipes to CSV")
    parser.add_argument(
        "--pdf",
        required=True,
        help="Path to ASME B36.10-2022 PDF on your machine",
    )
    parser.add_argument(
        "--output",
        required=True,
        help="Output CSV path (e.g. data/pipes_dimensions.csv)",
    )
    parser.add_argument(
        "--pages",
        default="all",
        help='Page range for tabula, e.g. "all" or "15-40". '
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


def looks_like_pipe_table(df: pd.DataFrame) -> bool:
    """
    Heuristic check if a table is a pipe dimension table.

    We look for a header row containing something like:
      - 'NPS' or 'Nominal Pipe Size'
      - 'Outside Diameter' or 'OD'
      - 'Wall' or 'Wall Thickness'
    """
    if df.empty or df.shape[1] < 4:
        return False

    header = normalise_header(df.iloc[0].tolist())
    header_str = " ".join(h.lower() for h in header)

    has_nps = "nps" in header_str or "nominal pipe size" in header_str
    has_od = "outside" in header_str or "o.d." in header_str or "od" in header_str
    has_wall = "wall" in header_str

    return has_nps and has_od and has_wall


def parse_schedule_from_title(title_text: str) -> str:
    """
    If the table caption or nearby text encodes schedule (e.g. 'Schedule 40'),
    you could parse it here. For now this is a stub and we expect schedule
    in the row itself.
    """
    return ""


def pressure_series_from_schedule(schedule: str) -> str:
    sch = schedule.upper().replace(" ", "")
    if sch in {"STD", "40", "40S"}:
        return "STD"
    if sch in {"XS", "80", "80S"}:
        return "XS"
    if sch in {"XXS"}:
        return "XXS"
    return ""


def parse_pipe_rows(df: pd.DataFrame) -> List[Dict[str, Any]]:
    """
    Convert one dimension table into normalized rows for pipes_dimensions.csv.

    This function assumes a row-oriented format like:

      NPS | DN | Outside Diameter (in) | Outside Diameter (mm) | Wall (in) | Wall (mm) |
          |    | Weight (lb/ft)       | Weight (kg/m)         | Schedule  | ...

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
        "od_in": None,
        "od_mm": None,
        "wall_in": None,
        "wall_mm": None,
        "wt_lb_ft": None,
        "wt_kg_m": None,
        "schedule": None,
    }

    for idx, col_name in enumerate(header):
        lower = col_name.lower()
        if "nps" in lower or "nominal" in lower:
            col_map["nps"] = idx
        elif lower.startswith("dn"):
            col_map["dn"] = idx
        elif "outside" in lower and ("in" in lower or "inch" in lower):
            col_map["od_in"] = idx
        elif "outside" in lower and ("mm" in lower or "millimeter" in lower):
            col_map["od_mm"] = idx
        elif ("wall" in lower or "thick" in lower) and ("in" in lower or "inch" in lower):
            col_map["wall_in"] = idx
        elif ("wall" in lower or "thick" in lower) and ("mm" in lower or "millimeter" in lower):
            col_map["wall_mm"] = idx
        elif ("weight" in lower or "wt" in lower) and ("lb" in lower or "lbs" in lower):
            col_map["wt_lb_ft"] = idx
        elif ("weight" in lower or "wt" in lower) and ("kg" in lower):
            col_map["wt_kg_m"] = idx
        elif "sched" in lower or "sch" in lower:
            col_map["schedule"] = idx

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
            # strip trailing schedule markers etc.
            try:
                return float(s)
            except ValueError:
                return None

        dn_val = get("dn")
        dn_mm = int(float(dn_val)) if dn_val and dn_val.replace(".", "", 1).isdigit() else None

        od_inch = to_float(get("od_in"))
        od_mm = to_float(get("od_mm"))
        wall_inch = to_float(get("wall_in"))
        wall_mm = to_float(get("wall_mm"))
        wt_lb_ft = to_float(get("wt_lb_ft"))
        wt_kg_m = to_float(get("wt_kg_m"))
        schedule = get("schedule") or ""

        # Basic NPS normalisation (drop quotes)
        nps_clean = nps_raw.replace('"', "").strip()
        nps_display = nps_raw.strip()

        try:
            nps_inch = float(nps_clean)
        except ValueError:
            # For special designations like 1/8, 1/4 etc, leave as None; you can refine later.
            nps_inch = None

        row: Dict[str, Any] = {
            "standard": STANDARD_NAME,
            "nps_inch": nps_inch,
            "dn_mm": dn_mm,
            "od_inch": od_inch,
            "od_mm": od_mm,
            "schedule": schedule,
            "wall_thickness_inch": wall_inch,
            "wall_thickness_mm": wall_mm,
            "weight_lb_per_ft": wt_lb_ft,
            "weight_kg_per_m": wt_kg_m,
            "pipe_category": DEFAULT_PIPE_CATEGORY,
            "pressure_series": pressure_series_from_schedule(schedule),
            "nps_display": nps_display,
            # table + page will be set by caller
            "b3610_table": "",
            "b3610_page": None,
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

        if not looks_like_pipe_table(df):
            continue

        print(f"Processing table #{idx} that looks like a pipe table...")
        rows = parse_pipe_rows(df)

        # Add table/page metadata (page info isn't directly exposed here, so we leave page=None)
        for r in rows:
            r["b3610_table"] = f"Table_{idx}"
            # If you know the page range, you can map idx → page manually later.
            r["b3610_page"] = None

        print(f"  → extracted {len(rows)} rows from table #{idx}")
        all_rows.extend(rows)

    if not all_rows:
        print("WARNING: no pipe rows extracted. You may need to adjust pages or parsing logic.")
        return

    # Deduplicate (optional) by (nps_inch, schedule, wall_thickness_inch)
    df_out = pd.DataFrame(all_rows)
    df_out = df_out.drop_duplicates(
        subset=["nps_inch", "schedule", "wall_thickness_inch"]
    ).reset_index(drop=True)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    df_out.to_csv(output_path, index=False)
    print(f"Saved {len(df_out)} rows to {output_path}")


if __name__ == "__main__":
    main()
