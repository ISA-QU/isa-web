#!/usr/bin/env python3
"""Monthly intake: turns the State Department's two monthly PDFs (NIV Issuances by Nationality,
and by Post) into updated versions of the 3 files in dashboard/ that `npm run dashboard:data`
reads, so nobody edits Excel by hand.

    npm run intake -- --pdf "FEBRUARY 2026 - NIV Issuances by Nationality and Visa Class.pdf" \\
                      --pdf "FEBRUARY 2026 - NIV Issuances by Post and Visa Class.pdf"
    npm run intake -- --pdf … --pdf … --apply        # replace the 3 files (after a backup)

Without --apply it only builds and checks updated copies in dashboard-intake/staging/. With
--apply it backs up the 3 originals to dashboard-intake/backups/ and then replaces them. Only
the 3 files ever live in dashboard/ (the build reads every .xlsx/.csv there).

Rules: only F1 and J1 rows; names exactly as the PDF prints them (the Lambda applies aliases);
a name never seen before stops the run; a printed 0 is a 0 row, an unlisted row isn't written;
the printed totals must match; a month already in the files is refused unless --replace.
"""

import argparse
import os
import shutil
import sys
from collections import Counter, defaultdict
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import files as F  # noqa: E402
from files import IntakeError  # noqa: E402
from lambda_bridge import ROOT, lambda_module  # noqa: E402
from pdf_spellings import NATIONALITY_SPELLINGS, POST_SPELLINGS  # noqa: E402

VISAS = ("F1", "J1")
DEFAULT_DASHBOARD = os.path.join(ROOT, "dashboard")
DEFAULT_INTAKE = os.path.join(ROOT, "dashboard-intake")


# ---- loading ----

def load(dashboard_dir):
    """The 3 files in a data folder (checked first: only the 3 data files may be there)."""
    F.check_dashboard_dir(dashboard_dir)
    return {
        "post": F.read_post(os.path.join(dashboard_dir, F.POST_FILE)),
        "nationality": F.read_nationality(os.path.join(dashboard_dir, F.NATIONALITY_FILE)),
        "historical": F.read_historical(os.path.join(dashboard_dir, F.HISTORICAL_FILE)),
    }


def known_names(state):
    """Names the files or the Lambda already know, and each nationality's type."""
    L = lambda_module()
    nat_types = {}
    for r in state["nationality"]:
        nat_types[r["nationality"]] = r["nationality_type"]
    hist_types = {}
    for r in state["historical"]:
        hist_types[r["nationality"]] = r["nationality_type"]
    posts = {r["post"] for r in state["post"]} | set(L.POST_COUNTRY) | set(L.POST_ALIASES)
    return {"nat_types": nat_types, "hist_types": hist_types, "posts": posts}


def check_names(month_input, known):
    """Stops on any name never seen before; returns each nationality's type."""
    L = lambda_module()
    label = F.month_key(month_input["year"], month_input["month"])
    unknown_posts = sorted({r[0] for r in month_input["post"] if r[1] in VISAS} - known["posts"])
    if unknown_posts:
        raise IntakeError(
            f"{label}: the by-Post report has consulate names never seen before: {', '.join(unknown_posts)}. "
            "Nothing was written. If a consulate is new or renamed, it has to be added to the Lambda's "
            "POST_COUNTRY (and POST_ALIASES for a rename) by the IT/AWS contact first."
        )
    unmapped = sorted({r[0] for r in month_input["post"] if r[1] in VISAS}
                      - {p for p in known["posts"] if L.POST_ALIASES.get(p, p) in L.POST_COUNTRY})
    if unmapped:
        raise IntakeError(f"{label}: these consulates have no country in the Lambda's POST_COUNTRY: {', '.join(unmapped)}.")
    types = {}
    unknown = []
    for name in {r[0] for r in month_input["nationality"] if r[1] in VISAS}:
        if name in known["nat_types"]:
            types[name] = known["nat_types"][name]
        elif name in known["hist_types"]:
            types[name] = known["hist_types"][name]
        else:
            unknown.append(name)
    if unknown:
        raise IntakeError(
            f"{label}: the by-Nationality report has names never seen before: {', '.join(sorted(unknown))}. "
            "Nothing was written. Check the spelling against the PDF; a genuinely new name needs a decision "
            "(country or special reporting category, and any alias in the Lambda) before it can be added."
        )
    return types


# ---- updating ----

def months_present(state):
    return (
        {(r["calendar_year"], r["calendar_month"]) for r in state["post"]},
        {(r["calendar_year"], r["calendar_month"]) for r in state["nationality"]},
    )


def respell(month_input):
    """Applies the reviewed PDF-spelling table (pdf_spellings.py); returns what it changed."""
    used = []
    for kind, table in (("nationality", NATIONALITY_SPELLINGS), ("post", POST_SPELLINGS)):
        rows = []
        for name, visa, count, no in month_input[kind]:
            if name in table:
                if visa in VISAS and (name, table[name]) not in used:
                    used.append((name, table[name]))
                name = table[name]
            rows.append((name, visa, count, no))
        month_input[kind] = rows
    return used


def add_month(state, month_input, replace):
    """Adds one month's F1/J1 rows; returns counts for the report."""
    y, m = month_input["year"], month_input["month"]
    label = F.month_key(y, m)
    respelled = respell(month_input)
    known = known_names(state)
    types = check_names(month_input, known)
    post_months, nat_months = months_present(state)
    if ((y, m) in post_months or (y, m) in nat_months) and not replace:
        raise IntakeError(f"{label} is already in the files. To replace it, run again with --replace "
                          "(on the intake page, tick \"Replace a month that's already in the files\").")

    def unique(rows, what):
        seen = {}
        for name, visa, count, no in rows:
            key = (name, visa)
            if key in seen:
                raise IntakeError(f"{label}: the {what} report lists {name} {visa} twice (lines {seen[key]} and {no}).")
            seen[key] = no
        return rows

    post_rows = [r for r in unique(month_input["post"], "by-Post") if r[1] in VISAS]
    nat_rows = [r for r in unique(month_input["nationality"], "by-Nationality") if r[1] in VISAS]
    replaced = {
        "post": sum(1 for r in state["post"] if (r["calendar_year"], r["calendar_month"]) == (y, m)),
        "nationality": sum(1 for r in state["nationality"] if (r["calendar_year"], r["calendar_month"]) == (y, m)),
    }
    state["post"] = [r for r in state["post"] if (r["calendar_year"], r["calendar_month"]) != (y, m)]
    state["nationality"] = [r for r in state["nationality"] if (r["calendar_year"], r["calendar_month"]) != (y, m)]
    state["post"] += [
        {"calendar_year": y, "calendar_month": m, "post": name, "visa_class": visa, "issuances": count}
        for name, visa, count, _ in post_rows
    ]
    state["nationality"] += [
        F.nationality_row(y, m, name, types[name], visa, count) for name, visa, count, _ in nat_rows
    ]
    totals = Counter()
    for name, visa, count, _ in nat_rows:
        totals[visa] += count
    by_name = Counter()
    for name, visa, count, _ in nat_rows:
        if visa == "F1":
            by_name[name] += count
    return {
        "month": label,
        "postRows": len(post_rows),
        "postZeroRows": sum(1 for r in post_rows if r[2] == 0),
        "nationalityRows": len(nat_rows),
        "nationalityZeroRows": sum(1 for r in nat_rows if r[2] == 0),
        "replacedRows": replaced if replace else None,
        "nationalityTotals": dict(totals),
        "postTotals": dict(Counter({v: sum(r[2] for r in post_rows if r[1] == v) for v in VISAS})),
        "topF1": by_name.most_common(5),
        "respelled": respelled,
    }


def historical_names(state):
    """For each country (by the Lambda's canonical name), the spelling and type its most recent
    year in the historical file uses, so a fiscal year's rows continue the year before
    (e.g. Palau → Republic of Palau, as FY2025 and FY2026 have it)."""
    L = lambda_module()
    by_canonical = {}
    for r in sorted(state["historical"], key=lambda r: r["fiscal_year"]):
        by_canonical[L._canonical(r["nationality"])] = (r["nationality"], r["nationality_type"])
    return by_canonical


def rebuild_fiscal_year(state, fiscal_year):
    """Recomputes a fiscal year's rows from the monthly nationality file (sum of its months).
    Rows from the official annual workbook are never touched. Returns the remapped names."""
    L = lambda_module()
    official = [r for r in state["historical"] if r["fiscal_year"] == fiscal_year and r["data_source"] != F.MONTHLY_SOURCE]
    if official:
        return {"fiscalYear": fiscal_year, "skipped": "has official annual figures; left unchanged"}
    months = sorted({(r["calendar_year"], r["calendar_month"]) for r in state["nationality"] if r["fiscal_year"] == fiscal_year})
    if not months:
        return {"fiscalYear": fiscal_year, "skipped": "no monthly rows"}
    names = historical_names(state)
    sums = defaultdict(int)
    types = {}
    remapped = {}
    for r in state["nationality"]:
        if r["fiscal_year"] != fiscal_year:
            continue
        hist_name, hist_type = names.get(L._canonical(r["nationality"]), (r["nationality"], r["nationality_type"]))
        if (hist_name, hist_type) != (r["nationality"], r["nationality_type"]):
            remapped[r["nationality"]] = (hist_name, hist_type)
        sums[(hist_name, r["visa_class"])] += r["issuances"]
        types[hist_name] = hist_type
    complete = len(months) == 12 and months[-1] == (fiscal_year, 9)
    through = F.month_key(*months[-1])
    before = [r for r in state["historical"] if r["fiscal_year"] == fiscal_year]
    state["historical"] = [r for r in state["historical"] if r["fiscal_year"] != fiscal_year]
    new = [
        {
            "fiscal_year": fiscal_year,
            "period_status": F.FY_COMPLETE if complete else F.FY_TO_DATE,
            "months_included": len(months),
            "through_month": through,
            "nationality": name,
            "nationality_type": types[name],
            "visa_class": visa,
            "issuances": total,
            "data_source": F.MONTHLY_SOURCE,
        }
        for (name, visa), total in sums.items()
        if total > 0
    ]
    state["historical"] += new
    return {
        "fiscalYear": fiscal_year,
        "status": F.FY_COMPLETE if complete else F.FY_TO_DATE,
        "monthsIncluded": len(months),
        "throughMonth": through,
        "rowsBefore": len(before),
        "rowsAfter": len(new),
        "remapped": {k: f"{v[0]} ({v[1]})" for k, v in sorted(remapped.items())},
    }


# ---- staging, checking, applying ----

def write_all(state, folder):
    os.makedirs(folder, exist_ok=True)
    F.write_post(os.path.join(folder, F.POST_FILE), state["post"])
    F.write_nationality(os.path.join(folder, F.NATIONALITY_FILE), state["nationality"])
    F.write_historical(os.path.join(folder, F.HISTORICAL_FILE), state["historical"])


def check_with_lambda(folder, state):
    """Reads the staged files with the Lambda's own parser; they must hold exactly the rows written."""
    L = lambda_module()
    expect = {
        F.POST_FILE: ("post", {((r["calendar_year"], r["calendar_month"]), r["post"], r["visa_class"], r["issuances"]) for r in state["post"]}),
        F.NATIONALITY_FILE: ("nationality", {((r["calendar_year"], r["calendar_month"]), r["nationality"], r["visa_class"], r["issuances"]) for r in state["nationality"]}),
        F.HISTORICAL_FILE: ("historical", {(r["fiscal_year"], r["nationality"], r["visa_class"], r["issuances"]) for r in state["historical"]}),
    }
    for name, (kind, rows) in expect.items():
        path = os.path.join(folder, name)
        with open(path, "rb") as fh:
            got_kind, records, skipped = L.parse_file(L.RawFile(name, os.path.getmtime(path), fh.read()))
        got = {(r["period"], r["name"], r["visa"], r["issuances"]) for r in records}
        if got_kind != kind or got != rows or skipped:
            raise IntakeError(f"{name}: the Lambda's reader doesn't read the staged file as written; nothing was applied.")


def stamp():
    return datetime.now().strftime("%Y%m%d-%H%M%S")


def apply_staged(staging, dashboard_dir, intake_dir):
    """Backs up the 3 originals, then replaces them with the staged files."""
    F.check_dashboard_dir(dashboard_dir)
    for name in F.DATA_FILES:
        if not os.path.isfile(os.path.join(staging, name)):
            raise IntakeError(f"The staged files are incomplete ({name} is missing); nothing was applied.")
    backup = os.path.join(intake_dir, "backups", stamp())
    os.makedirs(backup)
    for name in F.DATA_FILES:
        shutil.copy2(os.path.join(dashboard_dir, name), os.path.join(backup, name))
    for name in F.DATA_FILES:
        shutil.copyfile(os.path.join(staging, name), os.path.join(dashboard_dir, name))
    F.check_dashboard_dir(dashboard_dir)
    return backup


def group_reports(parsed_pdfs):
    """One input per month, with both reports."""
    months = defaultdict(dict)
    for p in parsed_pdfs:
        key = (p["year"], p["month"])
        if p["kind"] in months[key]:
            raise IntakeError(f"Two {p['kind']} reports for {F.month_key(*key)}.")
        months[key][p["kind"]] = p
    out = []
    for (y, m), kinds in sorted(months.items()):
        missing = [k for k in ("nationality", "post") if k not in kinds]
        if missing:
            raise IntakeError(f"{F.month_key(y, m)}: the {' and '.join(missing)} report is missing; both are needed.")
        out.append({"year": y, "month": m, "post": kinds["post"]["rows"], "nationality": kinds["nationality"]["rows"],
                    "joins": kinds["post"]["joins"] + kinds["nationality"]["joins"]})
    return out


def run(month_inputs, dashboard_dir=DEFAULT_DASHBOARD, intake_dir=DEFAULT_INTAKE, replace=False, apply=False):
    """Builds the updated files in staging, checks them, and (with apply) replaces the originals."""
    if os.path.abspath(intake_dir).startswith(os.path.abspath(dashboard_dir) + os.sep):
        raise IntakeError("The staging folder must be outside the data folder.")
    state = load(dashboard_dir)
    report = {"months": [], "fiscalYears": [], "warnings": []}
    for mi in month_inputs:
        report["months"].append(add_month(state, mi, replace))
        report["months"][-1]["nameJoins"] = [j[0] for j in mi.get("joins", [])]
    for fy in sorted({F.fiscal_year_of(mi["year"], mi["month"]) for mi in month_inputs}):
        report["fiscalYears"].append(rebuild_fiscal_year(state, fy))
    staging = os.path.join(intake_dir, "staging", stamp())
    write_all(state, staging)
    check_with_lambda(staging, state)
    report["staging"] = staging
    if apply:
        report["backup"] = apply_staged(staging, dashboard_dir, intake_dir)
        report["applied"] = True
    return report


def report_text(report):
    lines = []
    for m in report["months"]:
        lines.append(f"{m['month']}: {m['postRows']} post rows ({m['postZeroRows']} zero), "
                     f"{m['nationalityRows']} nationality rows ({m['nationalityZeroRows']} zero)")
        lines.append("  F1/J1 by nationality: " + ", ".join(f"{k} {v:,}" for k, v in sorted(m["nationalityTotals"].items()))
                     + " · by post: " + ", ".join(f"{k} {v:,}" for k, v in sorted(m["postTotals"].items())))
        lines.append("  Top 5 F1 nationalities: " + ", ".join(f"{n} {c:,}" for n, c in m["topF1"]))
        if m.get("respelled"):
            lines.append("  PDF spellings changed to the files' spelling (pdf_spellings.py): "
                         + "; ".join(f"{a!r} → {b!r}" for a, b in m["respelled"]))
        if m.get("nameJoins"):
            lines.append("  Names joined from wrapped lines: " + "; ".join(m["nameJoins"]))
        if m.get("replacedRows"):
            lines.append(f"  Replaced: {m['replacedRows']['post']} post rows, {m['replacedRows']['nationality']} nationality rows")
    for f in report["fiscalYears"]:
        if "skipped" in f:
            lines.append(f"FY{f['fiscalYear']}: {f['skipped']}")
        else:
            lines.append(f"FY{f['fiscalYear']}: {f['status']}, {f['monthsIncluded']} months through {f['throughMonth']}, "
                         f"{f['rowsBefore']} → {f['rowsAfter']} rows")
            if f["remapped"]:
                lines.append("  Spelled as in the historical file: " + "; ".join(f"{k} → {v}" for k, v in f["remapped"].items()))
    for w in report["warnings"]:
        lines.append(f"Warning: {w}")
    lines.append(f"Staged in {report['staging']}")
    if report.get("applied"):
        lines.append(f"Applied. Originals backed up to {report['backup']}")
    else:
        lines.append("Not applied (run with --apply to replace the 3 files).")
    return "\n".join(lines)


def main(argv=None):
    parser = argparse.ArgumentParser(description="Add monthly State Department reports to the dashboard's 3 data files.")
    parser.add_argument("--pdf", action="append", default=[], help="a monthly report PDF (give both for each month)")
    parser.add_argument("--download", action="append", default=[], metavar="YYYY-MM",
                        help="download that month's two PDFs from travel.state.gov first (off by default)")
    parser.add_argument("--replace", action="store_true", help="replace a month that's already in the files")
    parser.add_argument("--apply", action="store_true", help="replace the 3 files in dashboard/ (after a backup)")
    parser.add_argument("--dashboard", default=DEFAULT_DASHBOARD, help=argparse.SUPPRESS)
    parser.add_argument("--intake", default=DEFAULT_INTAKE, help=argparse.SUPPRESS)
    args = parser.parse_args(argv)
    try:
        import pdf_extract
        paths = list(args.pdf)
        if args.download:
            import download
            for month in args.download:
                paths += download.download_month(month, os.path.join(args.intake, "downloads"))
        if not paths:
            raise IntakeError("Give the month's two PDFs with --pdf (or use --download YYYY-MM).")
        parsed = []
        for path in paths:
            p = pdf_extract.read_pdf(path)
            notes = pdf_extract.check_totals(p, os.path.basename(path))
            p["notes"] = notes
            parsed.append(p)
        report = run(group_reports(parsed), args.dashboard, args.intake, args.replace, args.apply)
        report["warnings"] += [n for p in parsed for n in p["notes"]]
        print(report_text(report))
        return 0
    except IntakeError as error:
        print(f"Stopped: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
