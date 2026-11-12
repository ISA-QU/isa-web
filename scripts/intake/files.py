"""Reads and writes the three raw files the dashboard build reads, in their exact formats.

- post_F1_J1_By_Post.csv: calendar_year, calendar_month, post, visa_class, issuances
  (UTF-8, no BOM, LF line ends), sorted by year, month, post, visa class.
- the nationality workbook, sheet Nationality_Data, sorted by month, nationality, visa class.
- the historical workbook, sheet Historical_Nationality, sorted by fiscal year, nationality,
  visa class.
The workbooks are written the way the current ones were (a bold, centred header row; dates as
Excel dates), and the Lambda's own reader is used to check what it will see.
"""

import csv
import io
import os
from datetime import datetime

POST_FILE = "post_F1_J1_By_Post.csv"
NATIONALITY_FILE = "dashboard_by_nationality_F1_J1_2017_2026_clean.xlsx"
HISTORICAL_FILE = "dashboard_historical_by_nationality_F1_J1_1997_2026_YTD_clean.xlsx"
DATA_FILES = (POST_FILE, NATIONALITY_FILE, HISTORICAL_FILE)

POST_HEADER = ["calendar_year", "calendar_month", "post", "visa_class", "issuances"]
NATIONALITY_SHEET = "Nationality_Data"
NATIONALITY_HEADER = [
    "date", "month", "calendar_year", "calendar_month", "fiscal_year",
    "nationality", "nationality_type", "visa_class", "issuances",
]
HISTORICAL_SHEET = "Historical_Nationality"
HISTORICAL_HEADER = [
    "fiscal_year", "period_status", "months_included", "through_month",
    "nationality", "nationality_type", "visa_class", "issuances", "data_source",
]

COUNTRY = "Country or area"
SPECIAL = "Special reporting category"
FY_TO_DATE = "Fiscal year to date"
FY_COMPLETE = "Complete fiscal year"
MONTHLY_SOURCE = "Monthly nationality issuance reports"


class IntakeError(Exception):
    """A problem the person running the intake must fix; the message says what to do."""


def require(package, pip_name):
    try:
        return __import__(package)
    except ImportError:
        raise IntakeError(
            f"The Python package '{pip_name}' is missing. Install the intake tool's packages with:\n"
            "    python3 -m pip install -r scripts/intake/requirements.txt"
        ) from None


def check_dashboard_dir(path):
    """The build reads every .xlsx/.csv in dashboard/, so only the 3 files may be there."""
    if not os.path.isdir(path):
        raise IntakeError(f"The data folder {path} doesn't exist. Put the 3 data files there first.")
    names = [n for n in os.listdir(path) if not n.startswith(".")]
    if any(n.startswith("~$") for n in names):
        raise IntakeError("An Excel lock file (~$…) is in the data folder. Close Excel and try again.")
    data = sorted(n for n in names if n.lower().endswith((".xlsx", ".csv")))
    extra = [n for n in data if n not in DATA_FILES]
    if extra:
        raise IntakeError(
            "The data folder has other .xlsx/.csv files, which the dashboard build would also read: "
            + ", ".join(extra) + ". Move them out of the folder and try again."
        )
    missing = [n for n in DATA_FILES if n not in data]
    if missing:
        raise IntakeError("The data folder is missing: " + ", ".join(missing) + ".")


def month_key(year, month):
    return f"{year:04d}-{month:02d}"


def fiscal_year_of(year, month):
    return year + 1 if month >= 10 else year


# ---- reading ----

def read_post(path):
    with open(path, newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        if reader.fieldnames != POST_HEADER:
            raise IntakeError(f"{os.path.basename(path)}: unexpected columns {reader.fieldnames}")
        return [
            {
                "calendar_year": int(r["calendar_year"]),
                "calendar_month": int(r["calendar_month"]),
                "post": r["post"],
                "visa_class": r["visa_class"],
                "issuances": int(r["issuances"]),
            }
            for r in reader
        ]


def _read_sheet(path, sheet, header):
    openpyxl = require("openpyxl", "openpyxl")
    wb = openpyxl.load_workbook(path, read_only=True)
    try:
        if wb.sheetnames[0] != sheet:
            raise IntakeError(f"{os.path.basename(path)}: the first sheet should be {sheet}, not {wb.sheetnames[0]}")
        rows = wb[sheet].iter_rows(values_only=True)
        first = list(next(rows))
        if first[: len(header)] != header:
            raise IntakeError(f"{os.path.basename(path)}: unexpected columns {first}")
        return [dict(zip(header, r)) for r in rows if any(v is not None for v in r)]
    finally:
        wb.close()


def read_nationality(path):
    return _read_sheet(path, NATIONALITY_SHEET, NATIONALITY_HEADER)


def read_historical(path):
    return _read_sheet(path, HISTORICAL_SHEET, HISTORICAL_HEADER)


# ---- writing ----

def sort_post(rows):
    return sorted(rows, key=lambda r: (r["calendar_year"], r["calendar_month"], r["post"], r["visa_class"]))


def sort_nationality(rows):
    return sorted(rows, key=lambda r: (r["month"], r["nationality"], r["visa_class"]))


def sort_historical(rows):
    return sorted(rows, key=lambda r: (r["fiscal_year"], r["nationality"], r["visa_class"]))


def post_csv_bytes(rows):
    out = io.StringIO()
    writer = csv.writer(out, lineterminator="\n")
    writer.writerow(POST_HEADER)
    for r in sort_post(rows):
        writer.writerow([r[c] for c in POST_HEADER])
    return out.getvalue().encode("utf-8")


def write_post(path, rows):
    with open(path, "wb") as fh:
        fh.write(post_csv_bytes(rows))


def _write_sheet(path, sheet, header, rows):
    openpyxl = require("openpyxl", "openpyxl")
    from openpyxl.styles import Alignment, Border, Font, Side

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = sheet
    thin = Side(style="thin")
    ws.append(header)
    for cell in ws[1]:
        cell.font = Font(bold=True)
        cell.alignment = Alignment(horizontal="center", vertical="top")
        cell.border = Border(left=thin, right=thin, top=thin, bottom=thin)
    for r in rows:
        ws.append([r[c] for c in header])
    if "date" in header:
        col = header.index("date") + 1
        for (cell,) in ws.iter_rows(min_row=2, min_col=col, max_col=col):
            cell.number_format = "YYYY-MM-DD HH:MM:SS"
    wb.save(path)


def write_nationality(path, rows):
    _write_sheet(path, NATIONALITY_SHEET, NATIONALITY_HEADER, sort_nationality(rows))


def write_historical(path, rows):
    _write_sheet(path, HISTORICAL_SHEET, HISTORICAL_HEADER, sort_historical(rows))


def nationality_row(year, month, name, nationality_type, visa, issuances):
    return {
        "date": datetime(year, month, 1),
        "month": month_key(year, month),
        "calendar_year": year,
        "calendar_month": month,
        "fiscal_year": fiscal_year_of(year, month),
        "nationality": name,
        "nationality_type": nationality_type,
        "visa_class": visa,
        "issuances": issuances,
    }
