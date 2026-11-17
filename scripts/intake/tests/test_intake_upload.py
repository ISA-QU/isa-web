"""Tests for the intake-upload Lambda (backend/lambdas/intake-upload), on stand-ins for AWS
storage and Lambda (fake_aws.py) and made-up names and numbers only. No AWS is used.

    npm run intake:test
"""

import importlib.util
import json
import os
import sys
import time
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
sys.path.insert(0, HERE)

import files as F  # noqa: E402
import pdf_extract  # noqa: E402
from fake_aws import FakeLambda, FakeS3  # noqa: E402
from lambda_bridge import ROOT, lambda_module  # noqa: E402
from test_intake import FakeFiles  # noqa: E402

HANDLER_PATH = os.path.join(ROOT, "backend", "lambdas", "intake-upload", "lambda_function.py")
spec = importlib.util.spec_from_file_location("intake_upload_lambda", HANDLER_PATH)
handler = importlib.util.module_from_spec(spec)
spec.loader.exec_module(handler)

ADMIN = "dashboard-admins"
WORK = "intake/"


def fake_pdf(kind, year, month, rows):
    """A stand-in "PDF": the parsed report as JSON (pdf_extract.read_pdf is replaced in these tests)."""
    return json.dumps({"kind": kind, "year": year, "month": month, "rows": rows,
                       "totals": [["", sum(r[2] for r in rows), 99]], "joins": []}).encode()


def read_fake_pdf(path):
    with open(path, "rb") as fh:
        data = fh.read()
    try:
        parsed = json.loads(data)
    except ValueError:
        raise ValueError("not a PDF") from None
    parsed["rows"] = [tuple(r) for r in parsed["rows"]]
    parsed["totals"] = [tuple(t) for t in parsed["totals"]]
    return parsed


AUGUST = (
    fake_pdf("nationality", 2030, 8, [["Atlantis", "F1", 7, 1], ["Freedonia", "J1", 2, 2]]),
    fake_pdf("post", 2030, 8, [["Atlantis City", "F1", 7, 1], ["Freedonia Port", "J1", 2, 2]]),
)
JULY = (
    fake_pdf("nationality", 2030, 7, [["Atlantis", "F1", 9, 1]]),
    fake_pdf("post", 2030, 7, [["Atlantis City", "F1", 9, 1]]),
)


class UploadLambdaTests(FakeFiles):
    def setUp(self):
        super().setUp()
        L = lambda_module()
        self.bucket, self.raw = L.BUCKET, L.RAW_PREFIX
        self.env = {"DATA_BUCKET": self.bucket, "RAW_PREFIX": self.raw, "WORK_PREFIX": WORK,
                    "REBUILD_FUNCTION": "rebuild-test", "AWS_LAMBDA_FUNCTION_NAME": "intake-upload-test"}
        self.saved_env = {k: os.environ.get(k) for k in [*self.env, "ADMIN_GROUP", "MAX_PDF_MB"]}
        os.environ.update(self.env)
        self.s3 = FakeS3(os.path.join(self.tmp.name, "s3"))
        self.lam = FakeLambda(self.s3, "rebuild-test", "intake-upload-test")
        handler.CLIENTS = (self.s3, self.lam)
        self.saved_read_pdf = pdf_extract.read_pdf
        pdf_extract.read_pdf = read_fake_pdf
        for name in F.DATA_FILES:
            with open(os.path.join(self.dashboard, name), "rb") as fh:
                self.s3.write(self.bucket, self.raw + name, fh.read())
        self.original = self.raw_files()

    def tearDown(self):
        pdf_extract.read_pdf = self.saved_read_pdf
        handler.CLIENTS = None
        for k, v in self.saved_env.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v
        super().tearDown()

    # helpers

    def raw_files(self):
        return {k: self.s3.read(self.bucket, k) for k in self.s3.list_keys(self.bucket, self.raw)}

    def call(self, method, path, body=None, groups=(ADMIN,), claims=True):
        event = {"rawPath": path, "requestContext": {"http": {"method": method}}}
        if claims:
            event["requestContext"]["authorizer"] = {"jwt": {"claims": {"sub": "test-user", "cognito:groups": groups}}}
        if body is not None:
            event["body"] = json.dumps(body)
        answer = handler.lambda_handler(event, None)
        return answer["statusCode"], json.loads(answer["body"])

    def job(self, body):
        status, started = self.call("POST", "/intake/jobs", body)
        self.assertEqual(status, 200, started)
        self.lam.run_queued(handler)
        status, job = self.call("GET", f"/intake/jobs/{started['jobId']}")
        self.assertEqual(status, 200)
        self.assertEqual(job["status"], "done", job)
        return job["result"]

    def upload(self, pdfs):
        files = [{"name": f"report {i}.pdf", "size": len(data)} for i, data in enumerate(pdfs)]
        status, answer = self.call("POST", "/intake/uploads", {"files": files})
        self.assertEqual(status, 200, answer)
        for link, data in zip(answer["uploads"], pdfs):
            self.s3.receive_upload(link, data)
        return answer["uploadId"]

    def check(self, pdfs, replace=False):
        return self.job({"action": "check", "uploadId": self.upload(pdfs), "replace": replace})

    def backup_names(self):
        return sorted({k.split("/")[2] for k in self.s3.list_keys(self.bucket, WORK + "backups/")})

    def manifest(self, name):
        return json.loads(self.s3.read(self.bucket, f"{WORK}backups/{name}/backup.json"))

    # sign-in and admins

    def test_needs_sign_in(self):
        status, answer = self.call("POST", "/intake/uploads", {"files": []}, claims=False)
        self.assertEqual(status, 401)
        self.assertIn("Sign in again", answer["error"])

    def test_admins_only(self):
        status, answer = self.call("POST", "/intake/jobs", {"action": "undo-info"}, groups=["someone-else"])
        self.assertEqual(status, 403)
        self.assertIn("Only dashboard admins", answer["error"])
        self.assertEqual(self.lam.queued, [])
        status, answer = self.call("GET", "/intake/jobs/20300101-000000-abcdef12", groups=[])
        self.assertEqual(status, 403)
        # The API passes the groups claim as text.
        for text in ("[dashboard-admins other]", '["other","dashboard-admins"]'):
            status, _ = self.call("POST", "/intake/uploads", {"files": [{"name": "a.pdf", "size": 10}]}, groups=text)
            self.assertEqual(status, 200, text)
        status, _ = self.call("POST", "/intake/uploads", {"files": [{"name": "a.pdf", "size": 10}]}, groups="[dashboard-admins-old]")
        self.assertEqual(status, 403)

    def test_admin_group_from_settings(self):
        os.environ["ADMIN_GROUP"] = "data-team"
        status, _ = self.call("POST", "/intake/uploads", {"files": [{"name": "a.pdf", "size": 10}]})
        self.assertEqual(status, 403)
        status, _ = self.call("POST", "/intake/uploads", {"files": [{"name": "a.pdf", "size": 10}]}, groups=["data-team"])
        self.assertEqual(status, 200)

    def test_background_event_through_the_api_is_not_a_job(self):
        status, _ = self.call("POST", "/intake/jobs", {"action": "check", "uploadId": self.upload(AUGUST)})
        job_id = self.lam.queued[0]["intakeWorker"]
        self.lam.queued.clear()
        answer = handler.lambda_handler({"intakeWorker": job_id, "requestContext": {"http": {"method": "POST"}}}, None)
        self.assertEqual(answer["statusCode"], 401)
        status, job = self.call("GET", f"/intake/jobs/{job_id}")
        self.assertEqual(job["status"], "queued")

    # settings

    def test_settings_must_be_where_the_rebuild_reads(self):
        os.environ["DATA_BUCKET"] = "some-other-storage"
        status, answer = self.call("POST", "/intake/uploads", {"files": [{"name": "a.pdf", "size": 10}]})
        self.assertEqual(status, 500)
        self.assertIn("where rebuild-dashboard reads", answer["error"])
        os.environ["DATA_BUCKET"] = self.bucket
        os.environ["WORK_PREFIX"] = self.raw + "intake/"
        status, answer = self.call("POST", "/intake/uploads", {"files": [{"name": "a.pdf", "size": 10}]})
        self.assertIn("outside the raw-files area", answer["error"])
        del os.environ["REBUILD_FUNCTION"]
        status, answer = self.call("POST", "/intake/uploads", {"files": [{"name": "a.pdf", "size": 10}]})
        self.assertIn("isn't set up yet", answer["error"])

    # upload links

    def test_upload_links(self):
        status, answer = self.call("POST", "/intake/uploads", {"files": [{"name": "a.pdf", "size": 10}, {"name": "b.pdf", "size": 10}]})
        self.assertEqual(status, 200)
        keys = [u["fields"]["key"] for u in answer["uploads"]]
        self.assertEqual(keys, [f"{WORK}uploads/{answer['uploadId']}/a.pdf", f"{WORK}uploads/{answer['uploadId']}/b.pdf"])
        for files, message in (
            ([], "Drop the month's two PDF reports first"),
            ([{"name": "data.xlsx", "size": 10}], "isn't a PDF"),
            ([{"name": "../../raw/x.pdf", "size": 10}], None),
            ([{"name": "a.pdf", "size": 0}], "empty or larger than 20 MB"),
            ([{"name": "a.pdf", "size": 21 * 1024 * 1024}], "empty or larger than 20 MB"),
            ([{"name": "a.pdf", "size": 1}, {"name": "a.pdf", "size": 1}], "added twice"),
            ([{"name": f"{i}.pdf", "size": 1} for i in range(25)], "At most 24"),
        ):
            status, answer = self.call("POST", "/intake/uploads", {"files": files})
            if message is None:  # a path is reduced to its name: never outside the uploads area
                self.assertEqual(answer["uploads"][0]["fields"]["key"].split("/")[-1], "x.pdf")
                self.assertTrue(answer["uploads"][0]["fields"]["key"].startswith(WORK + "uploads/"))
                continue
            self.assertEqual(status, 400, files)
            self.assertIn(message, answer["error"])

    def test_odd_job_ids_are_not_found(self):
        for path in ("/intake/jobs/..%2Fraw", "/intake/jobs/nope", "/intake/jobs/20300101-000000-ABCDEF12"):
            status, _ = self.call("GET", path)
            self.assertEqual(status, 404, path)
        status, answer = self.call("POST", "/intake/jobs", {"action": "check", "uploadId": "../raw"})
        self.assertEqual(status, 400)
        status, answer = self.call("POST", "/intake/jobs", {"action": "delete-everything"})
        self.assertEqual(status, 400)

    # check

    def test_existing_month_refused_with_dashboard_wording(self):
        result = self.check(JULY)
        self.assertFalse(result["ok"])
        self.assertEqual(result["error"], "2030-07 is already in the files. Tick \"Replace a month that's already "
                                          "in the files\" above and check again.")
        self.assertEqual(self.raw_files(), self.original)
        self.assertTrue(self.check(JULY, replace=True)["ok"])

    def test_check_report(self):
        result = self.check(AUGUST)
        self.assertTrue(result["ok"], result)
        self.assertIn("2030-08: 2 post rows", result["report"])
        self.assertIn("Not applied yet: press Apply to replace the 3 files.", result["report"])
        self.assertNotIn(self.tmp.name, result["report"])
        self.assertNotIn("/tmp", result["report"])
        self.assertNotIn("--", result["report"])
        self.assertEqual(self.raw_files(), self.original)
        staged = self.s3.list_keys(self.bucket, f"{WORK}staging/{result['id']}/")
        self.assertEqual(sorted(k.split("/")[-1] for k in staged), sorted(F.DATA_FILES))

    def test_unreadable_pdf(self):
        result = self.check([b"%PDF-1.7 not really", AUGUST[1]])
        self.assertFalse(result["ok"])
        self.assertEqual(result["error"], "report 0.pdf couldn't be read. Is it one of the State Department's two "
                                          "monthly PDF reports?")

    def test_extra_raw_file_refused(self):
        self.s3.write(self.bucket, self.raw + "old copy.xlsx", b"x")
        result = self.check(AUGUST)
        self.assertFalse(result["ok"])
        self.assertIn("other .xlsx/.csv files, which the rebuild would also read: old copy.xlsx", result["error"])

    # apply and undo

    def test_apply_then_undo(self):
        checked = self.check(AUGUST)
        applied = self.job({"action": "apply", "checkJob": checked["id"]})
        self.assertTrue(applied["ok"], applied)
        self.assertEqual(applied["message"], "Applied: the 3 files are updated and the checks passed.")
        self.assertNotIn(self.tmp.name, applied["text"])
        self.assertNotEqual(self.raw_files(), self.original)
        # The rebuild ran once, on the new files, after the backup was saved.
        self.assertEqual(len(self.lam.rebuilds), 1)
        self.assertEqual(self.lam.rebuilds[0], self.raw_files())
        (backup,) = self.backup_names()
        self.assertEqual(self.manifest(backup)["months"], ["2030-08"])
        for name in F.DATA_FILES:
            self.assertEqual(self.s3.read(self.bucket, f"{WORK}backups/{backup}/{name}"), self.original[self.raw + name])
        state = handler.intake.load(self.dashboard)  # untouched local copy
        self.assertNotIn("2030-08", {r["month"] for r in state["nationality"]})
        # The same check can't be applied twice.
        again = self.job({"action": "apply", "checkJob": checked["id"]})
        self.assertFalse(again["ok"])
        self.assertIn("already applied", again["message"])

        info = self.job({"action": "undo-info"})
        self.assertTrue(info["ok"], info)
        self.assertEqual(info["backup"], backup)
        self.assertIn("Months it removes: 2030-08", info["text"])
        undone = self.job({"action": "undo", "backup": info["backup"]})
        self.assertTrue(undone["ok"], undone)
        self.assertEqual(undone["message"], "Undone: the files are back as they were before that update.")
        self.assertEqual(self.raw_files(), self.original)
        self.assertEqual(len(self.lam.rebuilds), 2)
        # Backups are kept: the apply's (marked undone) and a copy from before the undo.
        names = self.backup_names()
        self.assertEqual(len(names), 2)
        self.assertTrue(self.manifest(backup)["undone"])
        self.assertEqual(self.manifest(names[1])["kind"], "before-undo")
        self.assertEqual(self.s3.deleted, [WORK + "lock.json"] * 2)  # only the lock, never a backup
        nothing = self.job({"action": "undo-info"})
        self.assertFalse(nothing["ok"])
        self.assertEqual(nothing["error"], "There's no update to undo.")

    def test_rebuild_failure_restores(self):
        checked = self.check(AUGUST)
        self.lam.fail = ["post data is missing 3 month(s)", None]
        applied = self.job({"action": "apply", "checkJob": checked["id"]})
        self.assertFalse(applied["ok"])
        self.assertEqual(applied["message"], "Apply failed, old files restored, nothing changed.")
        self.assertIn("post data is missing 3 month(s)", applied["text"])
        self.assertEqual(self.raw_files(), self.original)
        self.assertEqual(len(self.lam.rebuilds), 2)  # the failed one, then again on the old files
        self.assertEqual(self.lam.rebuilds[1], self.original)
        (backup,) = self.backup_names()
        self.assertTrue(self.manifest(backup)["rolledBack"])
        self.assertFalse(self.job({"action": "undo-info"})["ok"])

    def test_rebuild_warning_restores(self):
        checked = self.check(AUGUST)
        self.lam.warnings = ["something looks off"]
        applied = self.job({"action": "apply", "checkJob": checked["id"]})
        self.assertFalse(applied["ok"])
        self.assertIn("Warning: something looks off", applied["text"])
        self.assertEqual(self.raw_files(), self.original)

    def test_restore_rebuild_failing_too(self):
        checked = self.check(AUGUST)
        self.lam.fail = "broken"
        applied = self.job({"action": "apply", "checkJob": checked["id"]})
        self.assertIn("rebuilding the dashboard from them also failed", applied["message"])
        self.assertEqual(self.raw_files(), self.original)

    def test_apply_refused_if_files_changed_since_check(self):
        checked = self.check(AUGUST)
        self.s3.write(self.bucket, self.raw + F.POST_FILE, self.original[self.raw + F.POST_FILE] + b"2030,7,Atlantis City,J1,1\n")
        changed = self.raw_files()
        applied = self.job({"action": "apply", "checkJob": checked["id"]})
        self.assertFalse(applied["ok"])
        self.assertIn("changed since the check", applied["message"])
        self.assertEqual(self.raw_files(), changed)
        self.assertEqual(self.lam.rebuilds, [])

    def test_undo_refused_if_files_changed_since_update(self):
        self.job({"action": "apply", "checkJob": self.check(AUGUST)["id"]})
        self.s3.write(self.bucket, self.raw + F.POST_FILE, b"changed")
        info = self.job({"action": "undo-info"})
        self.assertFalse(info["ok"])
        self.assertIn("changed since the update", info["error"])

    def test_one_update_at_a_time(self):
        checked = self.check(AUGUST)
        self.s3.write(self.bucket, WORK + "lock.json", json.dumps({"jobId": "other", "since": time.time()}).encode())
        applied = self.job({"action": "apply", "checkJob": checked["id"]})
        self.assertFalse(applied["ok"])
        self.assertIn("Another update or undo is running", applied["message"])
        self.assertEqual(self.raw_files(), self.original)
        # A lock left by a run that was cut off long ago doesn't block.
        self.s3.write(self.bucket, WORK + "lock.json", json.dumps({"jobId": "other", "since": time.time() - 3600}).encode())
        self.assertTrue(self.job({"action": "apply", "checkJob": self.check(AUGUST)["id"]})["ok"])

    def test_job_runs_once(self):
        self.call("POST", "/intake/jobs", {"action": "check", "uploadId": self.upload(AUGUST)})
        event = self.lam.queued[0]
        self.lam.run_queued(handler)
        handler.lambda_handler(event, None)  # delivered again
        staged = self.s3.list_keys(self.bucket, WORK + "staging/")
        self.assertEqual(len(staged), len(F.DATA_FILES))


if __name__ == "__main__":
    unittest.main()
