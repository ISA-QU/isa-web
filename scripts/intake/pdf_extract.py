"""Turns the State Department's monthly "NIV Issuances by Nationality / by Post and Visa Class"
PDFs into rows (name, visa class, issuances) and the totals the PDF prints.

Only text is read (pdfplumber). The row rules work on plain text lines, so the tests can use a
tiny made-up page. Anything the rules can't read stops the intake with the line it couldn't
read; nothing is guessed.
"""

import re

from files import IntakeError, require

MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august",
          "september", "october", "november", "december"]

# A visa class as the reports print it: "F1", "J1", "B1/B2", "H1B1", "C4/D3", "NATO2", "I", "D",
# "TN", "BBBCC"… (February 2026 has 71 of these).
VISA_RE = re.compile(r"^[A-Z]{1,5}\d{0,2}[A-Z0-9]{0,3}(?:/[A-Z0-9]+)*$")
COUNT_RE = re.compile(r"^\d{1,3}(?:,\d{3})*$|^\d+$")
TOTAL_RE = re.compile(r"^(grand total|total)\b\s*(?P<label>.*?)\s+(?P<count>\d{1,3}(?:,\d{3})*|\d+)$", re.I)
# The title, month and column headings repeat at the top of every page; page numbers at the foot.
SKIP_RE = re.compile(
    r"^(page \d+ of \d+|(nationality|post) visa class issuances|nonimmigrant visa issuances by (nationality|post)|"
    r"(" + "|".join(MONTHS) + r") \d{4} \(fy \d{4}\))$",
    re.I,
)


def kind_of(title_text):
    """'nationality' or 'post', from the report's title."""
    t = title_text.lower()
    if "by nationality" in t:
        return "nationality"
    if "by post" in t:
        return "post"
    raise IntakeError("This PDF isn't a monthly 'NIV Issuances by Nationality' or 'by Post' report.")


def month_of(title_text):
    """(year, month) from the report's title, e.g. 'February 2026'."""
    m = re.search(r"\b(" + "|".join(MONTHS) + r")\s+(\d{4})\b", title_text, re.I)
    if not m:
        raise IntakeError("Couldn't find the report's month and year in its title.")
    return int(m.group(2)), MONTHS.index(m.group(1).lower()) + 1


def parse_lines(lines, title_lines=0):
    """Rows, printed totals and name joins from the report's text lines.

    Returns {"rows": [(name, visa, count, line_no)], "totals": [(label, count, line_no)],
    "joins": [(joined_name, line_no)]}.
    """
    rows, totals, joins, footnote = [], [], [], []
    name = None
    pending = None
    ended = False
    for no, raw in enumerate(lines, start=1):
        line = " ".join(raw.split())
        if not line or no <= title_lines or SKIP_RE.match(line):
            continue
        if ended:
            # After GRAND TOTAL only the footnote follows; a row there would mean a misread page.
            parts = line.split(" ")
            if len(parts) >= 2 and COUNT_RE.match(parts[-1]) and VISA_RE.match(parts[-2]):
                raise IntakeError(f"Line {no} looks like a row after the grand total: {line!r}")
            footnote.append(line)
            continue
        t = TOTAL_RE.match(line)
        if t:
            totals.append((t.group("label").strip(), int(t.group("count").replace(",", "")), no))
            if pending is not None:
                raise IntakeError(f"Line {no - 1} isn't a row: {pending!r}")
            ended = t.group(1).lower() == "grand total"
            continue
        parts = line.split(" ")
        if len(parts) >= 2 and COUNT_RE.match(parts[-1]) and VISA_RE.match(parts[-2]):
            head = " ".join(parts[:-2]).strip()
            if pending is not None:
                head = f"{pending} {head}".strip()
                joins.append((head, no))
                pending = None
            if head:
                name = head
            if name is None:
                raise IntakeError(f"Line {no} has a visa class and count but no name before it: {line!r}")
            rows.append((name, parts[-2], int(parts[-1].replace(",", "")), no))
            continue
        # A line with no visa class and count: the first part of a name that wraps onto the next line.
        if pending is not None:
            raise IntakeError(f"Couldn't read lines {no - 1}-{no}: {pending!r} / {line!r}")
        pending = line
    if pending is not None:
        raise IntakeError(f"The report ends with a line that isn't a row: {pending!r}")
    return {"rows": rows, "totals": totals, "joins": joins, "footnote": footnote}


def read_pdf(path):
    """The report's kind, month, rows, totals and joins, read from the PDF's text."""
    pdfplumber = require("pdfplumber", "pdfplumber")
    with pdfplumber.open(path) as pdf:
        pages = [page.extract_text() or "" for page in pdf.pages]
    if not any(pages):
        raise IntakeError(f"{path}: no text found (is it a scanned image?)")
    first_lines = pages[0].splitlines()
    title = " ".join(first_lines[:4])
    kind = kind_of(title)
    year, month = month_of(title)
    lines = [line for text in pages for line in text.splitlines()]
    parsed = parse_lines(lines)
    return {"kind": kind, "year": year, "month": month, **parsed}


def check_totals(parsed, source):
    """Every printed total must equal the sum of the rows it covers (grand total = every row)."""
    rows = parsed["rows"]
    if not parsed["totals"]:
        return ["no printed totals in the report to check against"]
    notes = []
    for label, count, no in parsed["totals"]:
        if label == "" or label.lower() in ("all", "issuances"):
            got = sum(r[2] for r in rows)
        else:
            # A total for one visa class ("Total F1 1,234") or one name ("Total India 1,234").
            by_visa = [r[2] for r in rows if r[1].upper() == label.upper()]
            by_name = [r[2] for r in rows if r[0].lower() == label.lower()]
            got = sum(by_visa) if by_visa else sum(by_name) if by_name else None
            if got is None:
                notes.append(f"line {no}: total {label!r} names nothing in the report; not checked")
                continue
        if got != count:
            raise IntakeError(
                f"{source}: the printed total on line {no} ({label or 'grand total'}: {count:,}) "
                f"doesn't match the rows read ({got:,}). The PDF may not have been read correctly; stop."
            )
    return notes
