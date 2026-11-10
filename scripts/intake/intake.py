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
import hashlib
import json
import os
import shutil
import subprocess
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
# A month whose F1 or J1 total moves more than this share from the same month a year earlier gets a
# warning (not a stop): big swings can be real (F1 fell 53% in June 2025 and 55% in November 2025).
BIG_CHANGE = 0.5


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
    nat_totals = {v: sum(r[2] for r in nat_rows if r[1] == v) for v in VISAS}
    post_totals = {v: sum(r[2] for r in post_rows if r[1] == v) for v in VISAS}
    if nat_totals != post_totals:
        raise IntakeError(
            f"{label}: the two PDFs don't match; check they're the same month. "
            f"By Nationality: F1 {nat_totals['F1']:,}, J1 {nat_totals['J1']:,}; "
            f"by Post: F1 {post_totals['F1']:,}, J1 {post_totals['J1']:,}. Nothing was written."
        )
    big_changes = []
    for visa in VISAS:
        before = sum(r["issuances"] for r in state["nationality"]
                     if (r["calendar_year"], r["calendar_month"]) == (y - 1, m) and r["visa_class"] == visa)
        now = nat_totals[visa]
        if before > 0 and abs(now - before) / before > BIG_CHANGE:
            change = (now - before) / before * 100
            big_changes.append(
                f"Big change: {month_name(y, m)} {visa} {now:,} vs {before:,} in {month_name(y - 1, m)} "
                f"({'▲' if change > 0 else '▼'} {abs(change):.1f}%). This can be real — just confirm these are "
                "the right month's PDFs before Apply."
            )
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
        "bigChanges": big_changes,
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


MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September",
               "October", "November", "December"]


def month_name(year, month):
    return f"{MONTH_NAMES[month - 1]} {year}"


def fingerprint(folder):
    """Each data file's SHA-256, so undo can tell whether the files changed since an update."""
    out = {}
    for name in F.DATA_FILES:
        with open(os.path.join(folder, name), "rb") as fh:
            out[name] = hashlib.sha256(fh.read()).hexdigest()
    return out


MANIFEST = "backup.json"


def read_manifest(backup):
    path = os.path.join(backup, MANIFEST)
    if not os.path.isfile(path):
        return None
    with open(path) as fh:
        return json.load(fh)


def write_manifest(backup, manifest):
    with open(os.path.join(backup, MANIFEST), "w") as fh:
        json.dump(manifest, fh, indent=2)


def new_backup(intake_dir, dashboard_dir, manifest):
    """Copies the 3 files into a new dated backup folder with a note of why. Backups are never deleted."""
    backup = os.path.join(intake_dir, "backups", stamp())
    while os.path.exists(backup):
        backup += "-1"
    os.makedirs(backup)
    for name in F.DATA_FILES:
        shutil.copy2(os.path.join(dashboard_dir, name), os.path.join(backup, name))
    write_manifest(backup, {"created": datetime.now().isoformat(timespec="seconds"), **manifest})
    return backup


def restore(backup, dashboard_dir):
    for name in F.DATA_FILES:
        shutil.copyfile(os.path.join(backup, name), os.path.join(dashboard_dir, name))
    F.check_dashboard_dir(dashboard_dir)


def apply_staged(staging, dashboard_dir, intake_dir, months=()):
    """Backs up the 3 originals (with a note of the months being added), then replaces them."""
    F.check_dashboard_dir(dashboard_dir)
    for name in F.DATA_FILES:
        if not os.path.isfile(os.path.join(staging, name)):
            raise IntakeError(f"The staged files are incomplete ({name} is missing); nothing was applied.")
    backup = new_backup(intake_dir, dashboard_dir, {
        "kind": "apply",
        "months": list(months),
        "before": fingerprint(dashboard_dir),
        "after": fingerprint(staging),
        "undone": None,
        "rolledBack": False,
    })
    restore(staging, dashboard_dir)
    return backup


def run_checks(scripts=("dashboard:data", "dashboard:verify")):
    """Runs the dashboard's own build and checks; stops at the first that fails."""
    steps = []
    for script in scripts:
        done = subprocess.run(["npm", "run", script], cwd=ROOT, capture_output=True, text=True)
        output = (done.stdout + done.stderr).strip().splitlines()
        steps.append({"step": script, "ok": done.returncode == 0, "output": "\n".join(output[-25:])})
        if done.returncode != 0:
            break
    return steps


def apply_and_check(staging, dashboard_dir=DEFAULT_DASHBOARD, intake_dir=DEFAULT_INTAKE, months=(), checks=run_checks):
    """Replaces the 3 files, then runs dashboard:data and dashboard:verify. If either fails, the
    backup is put back automatically (and dashboard:data rerun on it), so nothing changes."""
    backup = apply_staged(staging, dashboard_dir, intake_dir, months)
    steps = checks(("dashboard:data", "dashboard:verify"))
    if all(s["ok"] for s in steps):
        return {"ok": True, "backup": backup, "steps": steps,
                "message": "Applied: the 3 files are updated and the checks passed."}
    restore(backup, dashboard_dir)
    manifest = read_manifest(backup)
    manifest["rolledBack"] = True
    write_manifest(backup, manifest)
    rebuilt = checks(("dashboard:data",))
    message = ("Apply failed, old files restored, nothing changed." if all(s["ok"] for s in rebuilt) else
               "Apply failed and the old files are restored, but rebuilding the local copy from them also failed. Stop and ask for help.")
    return {"ok": False, "rolledBack": True, "backup": backup, "steps": steps, "restoreSteps": rebuilt, "message": message}


# ---- undo ----

def _months(state):
    by_month = defaultdict(set)
    for r in state["post"]:
        by_month[(r["calendar_year"], r["calendar_month"])].add(("post", r["post"], r["visa_class"], r["issuances"]))
    for r in state["nationality"]:
        by_month[(r["calendar_year"], r["calendar_month"])].add(("nat", r["nationality"], r["visa_class"], r["issuances"]))
    return by_month


def undo_target(intake_dir):
    """The most recent update that hasn't been undone or rolled back (older backups without a note count too)."""
    folder = os.path.join(intake_dir, "backups")
    names = sorted(os.listdir(folder)) if os.path.isdir(folder) else []
    for name in reversed(names):
        backup = os.path.join(folder, name)
        manifest = read_manifest(backup)
        if manifest is None or (manifest.get("kind") == "apply" and not manifest.get("undone") and not manifest.get("rolledBack")):
            return backup, manifest
    raise IntakeError("There's no update to undo.")


def undo_info(dashboard_dir=DEFAULT_DASHBOARD, intake_dir=DEFAULT_INTAKE):
    """Which backup undo would restore, and the months it removes or changes back."""
    F.check_dashboard_dir(dashboard_dir)
    backup, manifest = undo_target(intake_dir)
    if manifest and manifest.get("after") != fingerprint(dashboard_dir):
        raise IntakeError(
            f"The data files changed since the update in {os.path.basename(backup)}, so undoing it would lose "
            "those changes. Nothing was changed."
        )
    now, then = _months(load(dashboard_dir)), _months(load(backup))
    label = lambda ym: F.month_key(*ym)  # noqa: E731
    return {
        "backup": os.path.basename(backup),
        "path": backup,
        "created": (manifest or {}).get("created", os.path.basename(backup)),
        "monthsRemoved": [label(k) for k in sorted(set(now) - set(then))],
        "monthsChanged": [label(k) for k in sorted(set(now) & set(then)) if now[k] != then[k]],
    }


def undo_text(info):
    removed = ", ".join(info["monthsRemoved"]) or "none"
    changed = ", ".join(info["monthsChanged"]) or "none"
    return (f"Undo restores the files from before the update of {info['created']} (backup {info['backup']}).\n"
            f"  Months it removes: {removed}\n  Months it changes back: {changed}")


def undo(dashboard_dir=DEFAULT_DASHBOARD, intake_dir=DEFAULT_INTAKE, expected_backup=None, checks=run_checks):
    """Restores the most recent update's backup (after saving the current files as another backup),
    then runs dashboard:data and dashboard:verify. No backup is ever deleted."""
    info = undo_info(dashboard_dir, intake_dir)
    if expected_backup is not None and info["backup"] != expected_backup:
        raise IntakeError("The files changed since you checked. Press Undo again to see what it would do now.")
    saved = new_backup(intake_dir, dashboard_dir, {"kind": "before-undo", "undoes": info["backup"],
                                                   "after": fingerprint(dashboard_dir)})
    restore(info["path"], dashboard_dir)
    manifest = read_manifest(info["path"]) or {"kind": "apply", "note": "made before backups had notes"}
    manifest["undone"] = datetime.now().isoformat(timespec="seconds")
    write_manifest(info["path"], manifest)
    steps = checks(("dashboard:data", "dashboard:verify"))
    ok = all(s["ok"] for s in steps)
    return {"ok": ok, "info": info, "savedCopy": saved, "steps": steps,
            "message": "Undone: the files are back as they were before that update." if ok else
            "The files are restored, but a check failed afterwards. Stop and ask for help."}


# ---- one run ----

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


def check_no_gaps(state, month_inputs):
    """New months must start right after the latest month in the files and follow on without holes."""
    post_months, nat_months = months_present(state)
    present = post_months | nat_months
    if not present:
        return
    index = lambda ym: ym[0] * 12 + ym[1] - 1  # noqa: E731
    name = lambda i: month_name(i // 12, i % 12 + 1)  # noqa: E731
    latest = index(max(present))
    expected = latest + 1
    for mi in sorted(month_inputs, key=lambda mi: (mi["year"], mi["month"])):
        i = index((mi["year"], mi["month"]))
        if i <= latest:
            continue
        if i > expected:
            raise IntakeError(
                f"Add {name(expected)} first: the files end at {name(latest)}, so {name(i)} would leave a gap. "
                "Nothing was written. (Several months in a row can be added in one go.)"
            )
        expected = i + 1


def run(month_inputs, dashboard_dir=DEFAULT_DASHBOARD, intake_dir=DEFAULT_INTAKE, replace=False, apply=False):
    """Builds the updated files in staging and checks them. With apply, replaces the originals
    (after a backup) without running the dashboard checks; use apply_and_check for that."""
    if os.path.abspath(intake_dir).startswith(os.path.abspath(dashboard_dir) + os.sep):
        raise IntakeError("The staging folder must be outside the data folder.")
    state = load(dashboard_dir)
    check_no_gaps(state, month_inputs)
    report = {"months": [], "fiscalYears": [], "warnings": [], "bigChanges": []}
    for mi in month_inputs:
        report["months"].append(add_month(state, mi, replace))
        report["months"][-1]["nameJoins"] = [j[0] for j in mi.get("joins", [])]
        report["bigChanges"] += report["months"][-1]["bigChanges"]
    for fy in sorted({F.fiscal_year_of(mi["year"], mi["month"]) for mi in month_inputs}):
        report["fiscalYears"].append(rebuild_fiscal_year(state, fy))
    staging = os.path.join(intake_dir, "staging", stamp())
    write_all(state, staging)
    check_with_lambda(staging, state)
    report["staging"] = staging
    report["monthLabels"] = [m["month"] for m in report["months"]]
    if apply:
        report["backup"] = apply_staged(staging, dashboard_dir, intake_dir, report["monthLabels"])
        report["applied"] = True
    return report


def report_text(report, applying=False):
    """The run's report. `applying`: the files are about to be applied, so no "Not applied" line."""
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
    for b in report.get("bigChanges", []):
        lines.append(f"Warning: {b}")
    for w in report["warnings"]:
        lines.append(f"Warning: {w}")
    lines.append(f"Staged in {report['staging']}")
    if report.get("applied"):
        lines.append(f"Applied. Originals backed up to {report['backup']}")
    elif not applying:
        lines.append("Not applied (run with --apply to replace the 3 files).")
    return "\n".join(lines)


def steps_text(result):
    lines = [result["message"]]
    for s in result.get("steps", []) + result.get("restoreSteps", []):
        lines.append(f"  {s['step']}: {'passed' if s['ok'] else 'FAILED'}")
        if not s["ok"]:
            lines += ["    " + l for l in s["output"].splitlines()]
    if result.get("backup"):
        lines.append(f"  Backup: {result['backup']}")
    if result.get("savedCopy"):
        lines.append(f"  The files from before the undo were also saved: {result['savedCopy']}")
    return "\n".join(lines)


def main(argv=None):
    parser = argparse.ArgumentParser(description="Add monthly State Department reports to the dashboard's 3 data files.")
    parser.add_argument("--pdf", action="append", default=[], help="a monthly report PDF (give both for each month)")
    parser.add_argument("--download", action="append", default=[], metavar="YYYY-MM",
                        help="download that month's two PDFs from travel.state.gov first (off by default)")
    parser.add_argument("--replace", action="store_true", help="replace a month that's already in the files")
    parser.add_argument("--apply", action="store_true",
                        help="replace the 3 files in dashboard/ (after a backup), then run dashboard:data and dashboard:verify")
    parser.add_argument("--undo", action="store_true", help="undo the most recent update (restores its backup)")
    parser.add_argument("--yes", action="store_true", help="with --undo: don't ask to confirm")
    parser.add_argument("--dashboard", default=DEFAULT_DASHBOARD, help=argparse.SUPPRESS)
    parser.add_argument("--intake", default=DEFAULT_INTAKE, help=argparse.SUPPRESS)
    args = parser.parse_args(argv)
    try:
        if args.undo:
            info = undo_info(args.dashboard, args.intake)
            print(undo_text(info))
            if not args.yes and input("Undo this update? [y/N] ").strip().lower() not in ("y", "yes"):
                print("Nothing changed.")
                return 0
            result = undo(args.dashboard, args.intake, expected_backup=info["backup"])
            print(steps_text(result))
            return 0 if result["ok"] else 1
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
            p["notes"] = pdf_extract.check_totals(p, os.path.basename(path))
            parsed.append(p)
        report = run(group_reports(parsed), args.dashboard, args.intake, args.replace)
        report["warnings"] += [n for p in parsed for n in p["notes"]]
        print(report_text(report, applying=args.apply))
        if args.apply:
            result = apply_and_check(report["staging"], args.dashboard, args.intake, report["monthLabels"])
            print(steps_text(result))
            return 0 if result["ok"] else 1
        return 0
    except IntakeError as error:
        print(f"Stopped: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
