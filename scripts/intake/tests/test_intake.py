"""Tests for the monthly intake tool, on made-up names and numbers only (no real data).

    npm run intake:test
"""

import hashlib
import os
import sys
import tempfile
import unittest
from datetime import datetime

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

import files as F  # noqa: E402
import intake  # noqa: E402
import live_upload  # noqa: E402
import pdf_extract  # noqa: E402
from files import IntakeError  # noqa: E402
from lambda_bridge import lambda_module  # noqa: E402

FAKE_POSTS = {"Atlantis City": "Atlantis", "Freedonia Port": "Freedonia"}


def fixture_lines():
    with open(os.path.join(HERE, "fixtures", "fake_nationality_report.txt")) as fh:
        return fh.read().splitlines()


def digest(folder):
    h = hashlib.sha256()
    for name in F.DATA_FILES:
        with open(os.path.join(folder, name), "rb") as fh:
            h.update(fh.read())
    return h.hexdigest()


class FakeFiles(unittest.TestCase):
    """A temporary data folder with tiny files in the real formats, and fake consulates the Lambda knows."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dashboard = os.path.join(self.tmp.name, "dashboard")
        self.intake_dir = os.path.join(self.tmp.name, "dashboard-intake")
        os.makedirs(self.dashboard)
        F.write_post(os.path.join(self.dashboard, F.POST_FILE), [
            {"calendar_year": 2030, "calendar_month": 7, "post": "Atlantis City", "visa_class": "F1", "issuances": 5},
            {"calendar_year": 2030, "calendar_month": 7, "post": "Freedonia Port", "visa_class": "J1", "issuances": 0},
        ])
        F.write_nationality(os.path.join(self.dashboard, F.NATIONALITY_FILE), [
            F.nationality_row(2029, 10, "Atlantis", F.COUNTRY, "F1", 4),
            F.nationality_row(2030, 7, "Atlantis", F.COUNTRY, "F1", 5),
            F.nationality_row(2030, 7, "Freedonia", F.COUNTRY, "J1", 0),
            F.nationality_row(2030, 7, "Stateless Test", F.SPECIAL, "J1", 1),
        ])
        F.write_historical(os.path.join(self.dashboard, F.HISTORICAL_FILE), [
            {"fiscal_year": 2029, "period_status": F.FY_COMPLETE, "months_included": 12, "through_month": "2029-09",
             "nationality": "Atlantis", "nationality_type": F.COUNTRY, "visa_class": "F1", "issuances": 40,
             "data_source": "Annual nationality issuance workbook"},
        ])
        L = lambda_module()
        self._post_country = dict(L.POST_COUNTRY)
        L.POST_COUNTRY.update(FAKE_POSTS)

    def tearDown(self):
        lambda_module().POST_COUNTRY.clear()
        lambda_module().POST_COUNTRY.update(self._post_country)
        self.tmp.cleanup()

    def month(self, year, month, nationality, post):
        return {"year": year, "month": month, "nationality": nationality, "post": post, "joins": []}

    def run_intake(self, months, **kw):
        return intake.run(months, dashboard_dir=self.dashboard, intake_dir=self.intake_dir, **kw)


class ParsingTests(unittest.TestCase):
    def test_rows_totals_joins_and_footnote(self):
        parsed = pdf_extract.parse_lines(fixture_lines())
        self.assertEqual(
            [(n, v, c) for n, v, c, _ in parsed["rows"]],
            [("Atlantis", "B1/B2", 1204), ("Atlantis", "F1", 12), ("Atlantis", "J1", 0), ("Freedonia", "I", 3),
             ("Freedonia", "F1", 7), ("Republic of the Very Long Name That Wraps", "F1", 2)],
        )
        self.assertEqual([(label, count) for label, count, _ in parsed["totals"]], [("", 1228)])
        self.assertEqual([j[0] for j in parsed["joins"]], ["Republic of the Very Long Name That Wraps"])
        self.assertEqual(parsed["footnote"], ["*A footnote that is not a row."])
        self.assertEqual(pdf_extract.check_totals(parsed, "fake"), [])

    def test_title(self):
        self.assertEqual(pdf_extract.kind_of("Nonimmigrant Visa Issuances by Nationality"), "nationality")
        self.assertEqual(pdf_extract.kind_of("Nonimmigrant Visa Issuances by Post"), "post")
        self.assertEqual(pdf_extract.month_of("September 2030 (FY 2030)"), (2030, 9))

    def test_total_mismatch_stops(self):
        lines = [l.replace("GRAND TOTAL 1,228", "GRAND TOTAL 1,229") for l in fixture_lines()]
        with self.assertRaisesRegex(IntakeError, "doesn't match"):
            pdf_extract.check_totals(pdf_extract.parse_lines(lines), "fake")

    def test_row_after_grand_total_stops(self):
        with self.assertRaisesRegex(IntakeError, "after the grand total"):
            pdf_extract.parse_lines(fixture_lines() + ["Atlantis F1 1"])


class FolderTests(FakeFiles):
    def test_hidden_files_ignored(self):
        open(os.path.join(self.dashboard, ".DS_Store"), "w").close()
        F.check_dashboard_dir(self.dashboard)

    def test_excel_lock_file_stops(self):
        open(os.path.join(self.dashboard, "~$" + F.NATIONALITY_FILE), "w").close()
        with self.assertRaisesRegex(IntakeError, "Close Excel and try again"):
            F.check_dashboard_dir(self.dashboard)

    def test_extra_data_file_named(self):
        open(os.path.join(self.dashboard, "backup copy.csv"), "w").close()
        with self.assertRaisesRegex(IntakeError, "backup copy.csv"):
            F.check_dashboard_dir(self.dashboard)

    def test_other_files_allowed(self):
        open(os.path.join(self.dashboard, "notes.txt"), "w").close()
        F.check_dashboard_dir(self.dashboard)


class IntakeTests(FakeFiles):
    AUG_NAT = [("Atlantis", "F1", 6, 1), ("Atlantis", "B1/B2", 9, 2), ("Freedonia", "J1", 0, 3)]
    AUG_POST = [("Atlantis City", "F1", 6, 1), ("Freedonia Port", "J1", 0, 2)]

    def test_staging_only_without_apply(self):
        before = digest(self.dashboard)
        report = self.run_intake([self.month(2030, 8, self.AUG_NAT, self.AUG_POST)])
        self.assertEqual(digest(self.dashboard), before)
        self.assertTrue(report["staging"].startswith(self.intake_dir))
        self.assertEqual(sorted(os.listdir(report["staging"])), sorted(F.DATA_FILES))

    def test_add_month_zeros_and_fiscal_year(self):
        report = self.run_intake([self.month(2030, 8, self.AUG_NAT, self.AUG_POST)], apply=True)
        self.assertTrue(os.path.isdir(report["backup"]))
        state = intake.load(self.dashboard)
        aug = [(r["nationality"], r["visa_class"], r["issuances"]) for r in state["nationality"] if r["month"] == "2030-08"]
        # Only F1/J1; the printed 0 stays a row; unlisted names get no row.
        self.assertEqual(aug, [("Atlantis", "F1", 6), ("Freedonia", "J1", 0)])
        self.assertIn(("Freedonia Port", "J1", 0), [(r["post"], r["visa_class"], r["issuances"]) for r in state["post"] if r["calendar_month"] == 8])
        fy = [r for r in state["historical"] if r["fiscal_year"] == 2030]
        # FY2030 = Oct 2029, Jul and Aug 2030; zero sums are left out; official FY2029 untouched.
        self.assertEqual([(r["nationality"], r["visa_class"], r["issuances"], r["months_included"], r["through_month"], r["period_status"]) for r in fy],
                         [("Atlantis", "F1", 15, 3, "2030-08", F.FY_TO_DATE), ("Stateless Test", "J1", 1, 3, "2030-08", F.FY_TO_DATE)])
        self.assertEqual(len([r for r in state["historical"] if r["fiscal_year"] == 2029]), 1)
        # The Lambda's own parser reads the written files.
        L = lambda_module()
        for name in F.DATA_FILES:
            with open(os.path.join(self.dashboard, name), "rb") as fh:
                kind, records, skipped = L.parse_file(L.RawFile(name, 0, fh.read()))
            self.assertTrue(records)

    def test_existing_month_refused_then_replaced(self):
        july = self.month(2030, 7, [("Atlantis", "F1", 9, 1)], [("Atlantis City", "F1", 9, 1)])
        with self.assertRaisesRegex(IntakeError, "already in the files"):
            self.run_intake([july])
        self.run_intake([july], apply=True, replace=True)
        state = intake.load(self.dashboard)
        jul = [(r["nationality"], r["issuances"]) for r in state["nationality"] if r["month"] == "2030-07"]
        self.assertEqual(jul, [("Atlantis", 9)])

    def test_unknown_names_stop(self):
        with self.assertRaisesRegex(IntakeError, "never seen before: Narnia"):
            self.run_intake([self.month(2030, 8, [("Narnia", "F1", 1, 1)], self.AUG_POST)])
        with self.assertRaisesRegex(IntakeError, "consulate names never seen before: Narnia Post"):
            self.run_intake([self.month(2030, 8, self.AUG_NAT, [("Narnia Post", "F1", 1, 1)])])

    def test_september_completes_and_october_opens(self):
        months = [self.month(2030, mo, [("Atlantis", "F1", 1, 1)], [("Atlantis City", "F1", 1, 1)])
                  for mo in (8, 9, 10)]
        # Fill the rest of FY2030 so it has 12 months (Nov 2029 – Jun 2030).
        extra = [self.month(2029 if mo > 9 else 2030, mo, [("Atlantis", "F1", 1, 1)], [("Atlantis City", "F1", 1, 1)])
                 for mo in (11, 12, 1, 2, 3, 4, 5, 6)]
        self.run_intake(extra + months, apply=True)
        state = intake.load(self.dashboard)
        fy30 = {(r["period_status"], r["months_included"], r["through_month"], r["data_source"]) for r in state["historical"] if r["fiscal_year"] == 2030}
        fy31 = {(r["period_status"], r["months_included"], r["through_month"]) for r in state["historical"] if r["fiscal_year"] == 2031}
        self.assertEqual(fy30, {(F.FY_COMPLETE, 12, "2030-09", F.MONTHLY_SOURCE)})
        self.assertEqual(fy31, {(F.FY_TO_DATE, 1, "2030-10")})

    def test_writer_dates_and_types(self):
        state = intake.load(self.dashboard)
        row = state["nationality"][0]
        self.assertEqual(row["date"], datetime(2029, 10, 1))
        self.assertEqual((row["month"], row["fiscal_year"]), ("2029-10", 2030))

    def test_staging_inside_dashboard_refused(self):
        with self.assertRaisesRegex(IntakeError, "outside the data folder"):
            intake.run([], dashboard_dir=self.dashboard, intake_dir=os.path.join(self.dashboard, "staging"))


def fake_checks(fail=None):
    """Stands in for dashboard:data / dashboard:verify, so tests never run the real npm scripts."""
    calls = []

    def checks(scripts):
        steps = []
        for script in scripts:
            calls.append(script)
            ok = script != fail
            steps.append({"step": script, "ok": ok, "output": "" if ok else f"{script} failed (pretend)"})
            if not ok:
                break
        return steps

    checks.calls = calls
    return checks


class SafetyTests(FakeFiles):
    AUG = ([("Atlantis", "F1", 6, 1), ("Freedonia", "J1", 0, 2)], [("Atlantis City", "F1", 6, 1), ("Freedonia Port", "J1", 0, 2)])
    SEP = ([("Atlantis", "F1", 2, 1)], [("Atlantis City", "F1", 2, 1)])

    def stage(self, *months):
        report = self.run_intake([self.month(2030, mo, *rows) for mo, rows in months])
        return report["staging"], report["monthLabels"]

    # 3. No gaps
    def test_gap_refused(self):
        with self.assertRaisesRegex(IntakeError, "Add August 2030 first"):
            self.run_intake([self.month(2030, 9, *self.SEP)])

    def test_consecutive_months_together_are_fine(self):
        report = self.run_intake([self.month(2030, 8, *self.AUG), self.month(2030, 9, *self.SEP)])
        self.assertEqual(report["monthLabels"], ["2030-08", "2030-09"])

    # 4. Pair check
    def test_reports_must_match(self):
        with self.assertRaisesRegex(IntakeError, "the two PDFs don't match; check they're the same month"):
            self.run_intake([self.month(2030, 8, [("Atlantis", "F1", 6, 1)], [("Atlantis City", "F1", 5, 1)])])

    # 5. Big-change warning (never a stop)
    def test_big_change_warns_but_does_not_stop(self):
        path = os.path.join(self.dashboard, F.NATIONALITY_FILE)
        rows = F.read_nationality(path) + [F.nationality_row(2029, 8, "Atlantis", F.COUNTRY, "F1", 10)]
        F.write_nationality(path, rows)
        down_60 = self.run_intake([self.month(2030, 8, [("Atlantis", "F1", 4, 1)], [("Atlantis City", "F1", 4, 1)])])
        self.assertEqual(down_60["bigChanges"], [
            "Big change: August 2030 F1 4 vs 10 in August 2029 (▼ 60.0%). This can be real — just confirm these are "
            "the right month's PDFs before Apply."
        ])
        self.assertIn("Warning: Big change: August 2030 F1 4 vs 10", intake.report_text(down_60))
        down_40 = self.run_intake([self.month(2030, 8, [("Atlantis", "F1", 6, 1)], [("Atlantis City", "F1", 6, 1)])])
        self.assertEqual(down_40["bigChanges"], [])

    # 2. Automatic rollback
    def test_failed_check_restores_the_old_files(self):
        before = digest(self.dashboard)
        staging, months = self.stage((8, self.AUG))
        checks = fake_checks(fail="dashboard:verify")
        result = intake.apply_and_check(staging, self.dashboard, self.intake_dir, months, checks=checks)
        self.assertFalse(result["ok"])
        self.assertEqual(result["message"], "Apply failed, old files restored, nothing changed.")
        self.assertEqual(digest(self.dashboard), before)
        self.assertEqual(checks.calls, ["dashboard:data", "dashboard:verify", "dashboard:data"])
        self.assertTrue(intake.read_manifest(result["backup"])["rolledBack"])
        with self.assertRaisesRegex(IntakeError, "no update to undo"):
            intake.undo_info(self.dashboard, self.intake_dir)

    def test_no_not_applied_line_when_applying(self):
        report = self.run_intake([self.month(2030, 8, *self.AUG)])
        self.assertIn("Not applied", intake.report_text(report))
        self.assertNotIn("Not applied", intake.report_text(report, applying=True))

    def test_successful_apply(self):
        staging, months = self.stage((8, self.AUG))
        result = intake.apply_and_check(staging, self.dashboard, self.intake_dir, months, checks=fake_checks())
        self.assertTrue(result["ok"])
        self.assertEqual(intake.read_manifest(result["backup"])["months"], ["2030-08"])

    # 1. Undo
    def test_undo_restores_latest_update_and_keeps_every_backup(self):
        original = digest(self.dashboard)
        staging, months = self.stage((8, self.AUG))
        intake.apply_and_check(staging, self.dashboard, self.intake_dir, months, checks=fake_checks())
        after_august = digest(self.dashboard)
        staging, months = self.stage((9, self.SEP))
        intake.apply_and_check(staging, self.dashboard, self.intake_dir, months, checks=fake_checks())

        info = intake.undo_info(self.dashboard, self.intake_dir)
        self.assertEqual((info["monthsRemoved"], info["monthsChanged"]), (["2030-09"], []))
        self.assertIn("Months it removes: 2030-09", intake.undo_text(info))
        result = intake.undo(self.dashboard, self.intake_dir, expected_backup=info["backup"], checks=fake_checks())
        self.assertTrue(result["ok"])
        self.assertEqual(digest(self.dashboard), after_august)
        # A second undo takes the next older update (August), not the one just undone.
        info = intake.undo_info(self.dashboard, self.intake_dir)
        self.assertEqual(info["monthsRemoved"], ["2030-08"])
        intake.undo(self.dashboard, self.intake_dir, checks=fake_checks())
        self.assertEqual(digest(self.dashboard), original)
        with self.assertRaisesRegex(IntakeError, "no update to undo"):
            intake.undo_info(self.dashboard, self.intake_dir)
        # Nothing was deleted: 2 updates + 2 "before undo" copies.
        kinds = sorted(intake.read_manifest(os.path.join(self.intake_dir, "backups", b))["kind"]
                       for b in os.listdir(os.path.join(self.intake_dir, "backups")))
        self.assertEqual(kinds, ["apply", "apply", "before-undo", "before-undo"])

    def test_undo_refuses_if_files_changed_since(self):
        staging, months = self.stage((8, self.AUG))
        intake.apply_and_check(staging, self.dashboard, self.intake_dir, months, checks=fake_checks())
        path = os.path.join(self.dashboard, F.POST_FILE)
        F.write_post(path, F.read_post(path)[:-1])
        with self.assertRaisesRegex(IntakeError, "changed since the update"):
            intake.undo(self.dashboard, self.intake_dir, checks=fake_checks())

    def test_undo_checks_it_is_still_the_same_update(self):
        staging, months = self.stage((8, self.AUG))
        intake.apply_and_check(staging, self.dashboard, self.intake_dir, months, checks=fake_checks())
        with self.assertRaisesRegex(IntakeError, "changed since you checked"):
            intake.undo(self.dashboard, self.intake_dir, expected_backup="an-older-backup", checks=fake_checks())


class RenamedConsulateTests(FakeFiles):
    def test_old_and_new_consulate_spellings_are_accepted(self):
        # The CSV keeps whatever the PDF prints; the Lambda merges old labels via POST_ALIASES.
        L = lambda_module()
        self.assertEqual((L.POST_ALIASES["Nur-Sultan"], L.POST_ALIASES["Kuwait"]), ("Astana", "Kuwait City"))
        for posts in (["Nur-Sultan", "Kuwait"], ["Astana", "Kuwait City"]):
            month = self.month(2030, 8, [("Atlantis", "F1", 2, 1)], [(posts[0], "F1", 1, 1), (posts[1], "F1", 1, 2)])
            report = self.run_intake([month])
            self.assertEqual(report["months"][0]["postRows"], 2)


class SpellingTests(unittest.TestCase):
    def test_pdf_spellings(self):
        month = {
            "year": 2030, "month": 8, "post": [],
            "nationality": [("Congo, Republic of the", "F1", 3, 1), ("Congo, Democratic Republic of the", "J1", 2, 2),
                            ("China - mainland", "F1", 9, 3), ("Atlantis", "F1", 1, 4)],
        }
        used = intake.respell(month)
        self.assertEqual([r[0] for r in month["nationality"]],
                         ["Republic of the Congo", "Democratic Republic of the Congo", "China - Mainland", "Atlantis"])
        self.assertIn(("Congo, Republic of the", "Republic of the Congo"), used)
        # The two Congos stay two countries.
        self.assertNotEqual(month["nationality"][0][0], month["nationality"][1][0])


class LiveUploadTests(unittest.TestCase):
    def test_switched_off(self):
        self.assertFalse(live_upload.LIVE_UPLOAD_ENABLED)
        with self.assertRaisesRegex(IntakeError, "switched off"):
            live_upload.upload("dashboard")


if __name__ == "__main__":
    unittest.main()
