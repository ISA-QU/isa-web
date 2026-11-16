#!/usr/bin/env python3
"""Proves the intake tool rebuilds a month exactly, using only copies in dashboard-intake/proof/.

    python3 scripts/intake/proof.py --pdf "<nationality>.pdf" --pdf "<post>.pdf"

0. Self-checks: the writer round-trips the current files exactly (as the Lambda reads them), and
   the fiscal-year rule reproduces every monthly-built fiscal year in the historical file.
a. From copies with the PDFs' month removed (and its fiscal year rolled back), rebuild that month
   from its two PDFs and compare every row with the current files.
b. Run the Lambda locally on the rebuilt files and on copies of the current files and compare the
   two snapshots, ignoring only build-time and file-metadata fields.
Differences are reported, never "fixed". dashboard/ and public/dashboard-data/ are only read.
"""

import argparse
import json
import os
import shutil
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import files as F  # noqa: E402
import intake  # noqa: E402
import pdf_extract  # noqa: E402
from lambda_bridge import LAMBDA_PATH, lambda_module  # noqa: E402

IGNORED_SNAPSHOT_FIELDS = ("generatedAt", "sources[].modified")


def keyed(rows, header):
    return {tuple(r[c] for c in header) for r in rows}


def compare(label, expected, got, out):
    missing, extra = expected - got, got - expected
    out.append(f"  {label}: {len(expected & got)} match, {len(missing)} missing, {len(extra)} extra")
    for row in sorted(missing, key=str)[:10]:
        out.append(f"    missing: {row}")
    for row in sorted(extra, key=str)[:10]:
        out.append(f"    extra:   {row}")
    return not missing and not extra


def lambda_tables(folder):
    L = lambda_module()
    tables = {}
    for name in F.DATA_FILES:
        with open(os.path.join(folder, name), "rb") as fh:
            data = fh.read()
        tables[name] = L.read_xlsx(data) if name.endswith(".xlsx") else L.read_csv(data)
    return tables


def build_snapshot(folder, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    done = subprocess.run([sys.executable, LAMBDA_PATH, "--local", folder, "--out", out_dir], capture_output=True, text=True)
    if done.returncode != 0:
        raise SystemExit(f"The Lambda failed on {folder}:\n{done.stdout}{done.stderr}")
    with open(os.path.join(out_dir, "snapshot.json")) as fh:
        return json.load(fh)


def normalised(snapshot):
    s = json.loads(json.dumps(snapshot))
    s.pop("generatedAt", None)
    order = [x["file"] for x in s["sources"]]
    for x in s["sources"]:
        x.pop("modified", None)
    s["sources"] = sorted(s["sources"], key=lambda x: x["file"])
    return s, order


def first_difference(a, b, path="snapshot"):
    if type(a) is not type(b):
        return path
    if isinstance(a, dict):
        for k in sorted(set(a) | set(b)):
            if k not in a or k not in b:
                return f"{path}.{k}"
            d = first_difference(a[k], b[k], f"{path}.{k}")
            if d:
                return d
        return None
    if isinstance(a, list):
        if len(a) != len(b):
            return f"{path} (length {len(a)} vs {len(b)})"
        for i, (x, y) in enumerate(zip(a, b)):
            d = first_difference(x, y, f"{path}[{i}]")
            if d:
                return d
        return None
    return None if a == b else path


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--pdf", action="append", required=True)
    parser.add_argument("--dashboard", default=intake.DEFAULT_DASHBOARD)
    args = parser.parse_args()

    root = os.path.join(intake.DEFAULT_INTAKE, "proof", intake.stamp())
    current, rolled, rebuilt = (os.path.join(root, d) for d in ("current", "rolled-back", "rebuilt"))
    for d in (current, rolled, rebuilt):
        os.makedirs(d)
    F.check_dashboard_dir(args.dashboard)
    for name in F.DATA_FILES:
        shutil.copy2(os.path.join(args.dashboard, name), os.path.join(current, name))
    out = [f"Proof folder: {root}"]
    ok = True

    parsed = []
    for path in args.pdf:
        p = pdf_extract.read_pdf(path)
        p["notes"] = pdf_extract.check_totals(p, os.path.basename(path))
        parsed.append(p)
        out.append(f"Read {os.path.basename(path)}: {p['kind']}, {F.month_key(p['year'], p['month'])}, {len(p['rows'])} rows (all visa classes), "
                   f"printed totals {[(t[0] or 'GRAND TOTAL', t[1]) for t in p['totals']]} match the rows; wrapped names joined: {len(p['joins'])}")
        for j in p["joins"]:
            out.append(f"    joined: {j[0]!r} (line {j[1]})")
    (month_input,) = intake.group_reports(parsed)
    y, m = month_input["year"], month_input["month"]
    fy = F.fiscal_year_of(y, m)

    # ---- 0. self-checks ----
    out.append("\n0. Self-checks")
    state = intake.load(current)
    roundtrip = os.path.join(root, "roundtrip")
    intake.write_all(state, roundtrip)
    same_tables = lambda_tables(current) == lambda_tables(roundtrip)
    same_csv = open(os.path.join(current, F.POST_FILE), "rb").read() == open(os.path.join(roundtrip, F.POST_FILE), "rb").read()
    out.append(f"  writer round-trip: post CSV byte-identical {same_csv}; all 3 files identical as the Lambda reads them {same_tables}")
    ok &= same_tables and same_csv
    monthly_fys = sorted({r["fiscal_year"] for r in state["historical"] if r["data_source"] == F.MONTHLY_SOURCE})
    remaps = {}
    for year in monthly_fys:
        before = keyed([r for r in state["historical"] if r["fiscal_year"] == year], F.HISTORICAL_HEADER)
        info = intake.rebuild_fiscal_year(state, year)
        after = keyed([r for r in state["historical"] if r["fiscal_year"] == year], F.HISTORICAL_HEADER)
        out.append(f"  fiscal-year rule reproduces FY{year} ({len(before)} rows): {before == after}")
        ok &= before == after
        remaps.update(info.get("remapped", {}))

    # ---- a. rebuild the month ----
    out.append(f"\na. Rebuild {F.month_key(y, m)} from its PDFs")
    state = intake.load(current)
    state["post"] = [r for r in state["post"] if (r["calendar_year"], r["calendar_month"]) != (y, m)]
    state["nationality"] = [r for r in state["nationality"] if (r["calendar_year"], r["calendar_month"]) != (y, m)]
    rolled_info = intake.rebuild_fiscal_year(state, fy)
    intake.write_all(state, rolled)
    out.append(f"  rolled back: {F.month_key(y, m)} removed; FY{fy} → {rolled_info['status']}, {rolled_info['monthsIncluded']} months through {rolled_info['throughMonth']}")
    for name in F.DATA_FILES:
        shutil.copy2(os.path.join(rolled, name), os.path.join(rebuilt, name))
    report = intake.run([month_input], dashboard_dir=rebuilt, intake_dir=os.path.join(root, "intake"), apply=True)
    out.append("  intake report:\n" + "\n".join("    " + l for l in intake.report_text(report).splitlines()))
    cur, new = intake.load(current), intake.load(rebuilt)
    in_month = lambda r: (r["calendar_year"], r["calendar_month"]) == (y, m)  # noqa: E731
    ok &= compare(f"{F.month_key(y, m)} post rows (incl. zero rows)", keyed(filter(in_month, cur["post"]), F.POST_HEADER), keyed(filter(in_month, new["post"]), F.POST_HEADER), out)
    ok &= compare(f"{F.month_key(y, m)} nationality rows (incl. zero rows)", keyed(filter(in_month, cur["nationality"]), F.NATIONALITY_HEADER), keyed(filter(in_month, new["nationality"]), F.NATIONALITY_HEADER), out)
    in_fy = lambda r: r["fiscal_year"] == fy  # noqa: E731
    ok &= compare(f"FY{fy} historical rows", keyed(filter(in_fy, cur["historical"]), F.HISTORICAL_HEADER), keyed(filter(in_fy, new["historical"]), F.HISTORICAL_HEADER), out)
    for kind, header in (("post", F.POST_HEADER), ("nationality", F.NATIONALITY_HEADER), ("historical", F.HISTORICAL_HEADER)):
        ok &= compare(f"whole {kind} file", keyed(cur[kind], header), keyed(new[kind], header), out)
    zero = lambda rows: sum(1 for r in rows if r["issuances"] == 0)  # noqa: E731
    out.append(f"  zero rows: post {zero(cur['post'])} → {zero(new['post'])}; nationality {zero(cur['nationality'])} → {zero(new['nationality'])}; "
               f"historical {zero(cur['historical'])} → {zero(new['historical'])}")
    same_tables = lambda_tables(current) == lambda_tables(rebuilt)
    same_csv = open(os.path.join(current, F.POST_FILE), "rb").read() == open(os.path.join(rebuilt, F.POST_FILE), "rb").read()
    out.append(f"  files as the Lambda reads them (cell by cell, in order): identical {same_tables}; post CSV byte-identical {same_csv}")
    ok &= same_tables and same_csv

    # ---- b. snapshots ----
    out.append("\nb. Lambda snapshots: rebuilt files vs copies of the current files")
    snap_cur, order_cur = normalised(build_snapshot(current, os.path.join(root, "snapshot-current")))
    snap_new, order_new = normalised(build_snapshot(rebuilt, os.path.join(root, "snapshot-rebuilt")))
    diff = first_difference(snap_cur, snap_new)
    out.append(f"  ignored fields: {', '.join(IGNORED_SNAPSHOT_FIELDS)}; sources compared sorted by file name "
               f"(order by modified time was {'the same' if order_cur == order_new else f'{order_cur} vs {order_new}'})")
    out.append(f"  identical apart from those: {diff is None}" + (f" (first difference at {diff})" if diff else ""))
    ok &= diff is None

    # ---- hand-cleaning and name joins ----
    out.append("\nRows where the existing files look hand-cleaned")
    used = [pair for mo in report["months"] for pair in mo.get("respelled", [])]
    if used:
        out.append("  The nationality file spells these names differently from the PDF (applied from pdf_spellings.py):")
        for a, b in used:
            out.append(f"    {a!r} → {b!r}")
    if remaps:
        out.append("  The historical file's monthly-built fiscal years use the annual workbook's spelling or type, not the monthly report's:")
        for k, v in sorted(remaps.items()):
            out.append(f"    {k} → {v}")
        out.append("  The intake reproduces these by following the latest year's spelling in the historical file.")
    L = lambda_module()
    hist = intake.load(current)["historical"]
    annual = {}
    for r in sorted(hist, key=lambda r: r["fiscal_year"]):
        if r["data_source"] != F.MONTHLY_SOURCE:
            annual[L._canonical(r["nationality"])] = r["nationality"]
    unlike = sorted({(r["fiscal_year"], r["nationality"], annual[L._canonical(r["nationality"])])
                     for r in hist if r["data_source"] == F.MONTHLY_SOURCE
                     and annual.get(L._canonical(r["nationality"]), r["nationality"]) != r["nationality"]})
    for year, name, annual_name in unlike:
        out.append(f"  FY{year} spells {name!r} where the annual years spell {annual_name!r} (the earlier cleaning skipped it).")
    out.append(f"  Name joins from wrapped lines: {sum(len(p['joins']) for p in parsed)}")
    out.append(f"\n{'PASS' if ok else 'DIFFERENCES FOUND'}")
    print("\n".join(out))
    with open(os.path.join(root, "proof-report.txt"), "w") as fh:
        fh.write("\n".join(out) + "\n")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
