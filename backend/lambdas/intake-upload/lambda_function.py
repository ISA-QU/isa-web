"""intake-upload: the Update data tab's AWS side. WRITTEN BUT NOT DEPLOYED (see docs/UPLOAD_AWS_SETUP.md).

It runs the same intake engine as the office laptop (scripts/intake: no second copy of the logic).
For each job it copies the raw files from storage into a temporary folder, runs the engine there,
then writes the results back, so the engine's rules all apply unchanged: only the 3 files, a
month already in the files refused without Replace, the Lambda's own reader checks the staged
files, backups before anything is replaced, undo only of the most recent update.

The difference from the laptop is the check after Apply: instead of `npm run dashboard:data` and
`dashboard:verify`, the 3 files are uploaded to the raw-files area and rebuild-dashboard runs. If
it fails or warns, the backup is put back and rebuild-dashboard runs again, so nothing changes.

Routes (on the API with the dashboard's sign-in check; admins only):
    POST /intake/uploads        {files: [{name, size}]} -> one-time upload links for the PDFs
    POST /intake/jobs           {action: "check", uploadId, replace} | {action: "apply", checkJob}
                                | {action: "undo-info"} | {action: "undo", backup}  -> {jobId}
    GET  /intake/jobs/{jobId}   -> {status: "queued" | "running" | "done" | "failed", result}
The API stops waiting after about 29 seconds and a check takes about a minute, so every action is
a job: this function starts it in the background (invoking itself) and the tab polls its status.

Settings (environment variables only; the repo holds no names, IDs or addresses):
    DATA_BUCKET       storage that holds the raw files (where rebuild-dashboard reads them)
    RAW_PREFIX        the raw-files area in it, as rebuild-dashboard reads it (e.g. "raw/")
    WORK_PREFIX       the intake's own area: uploads, staging, backups, jobs (default "intake/")
    REBUILD_FUNCTION  the rebuild-dashboard function's name
    ADMIN_GROUP       the sign-in group allowed to update the data (default "dashboard-admins")
    MAX_PDF_MB        the largest PDF accepted (default 20)
Backups are never deleted.
"""

import hashlib
import json
import os
import re
import secrets
import shutil
import sys
import tempfile
import time
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
# In the zip the engine sits next to this file; in the repo it's three folders up.
for root in (HERE, os.path.abspath(os.path.join(HERE, "..", "..", ".."))):
    if os.path.isfile(os.path.join(root, "scripts", "intake", "intake.py")):
        sys.path.insert(0, os.path.join(root, "scripts", "intake"))
        break

import files as F  # noqa: E402
import intake  # noqa: E402
from files import IntakeError  # noqa: E402
from lambda_bridge import lambda_module  # noqa: E402

ACTIONS = ("check", "apply", "undo-info", "undo")
ID_PATTERN = re.compile(r"^\d{8}-\d{6}-[0-9a-f]{8}$")
BACKUP_PATTERN = re.compile(r"^\d{8}-\d{6}(-1)*$")
PDF_NAME = re.compile(r"^[A-Za-z0-9 ._()&,'-]{1,150}\.pdf$", re.IGNORECASE)
MAX_FILES = 24
UPLOAD_LINK_SECONDS = 600
# A lock older than this is from a run that was cut off (the function's limit is 15 minutes).
STALE_LOCK_SECONDS = 20 * 60

# (s3, lambda) clients. Created on first use in AWS; tests put stand-ins here.
CLIENTS = None


def clients():
    global CLIENTS
    if CLIENTS is None:
        import boto3  # part of the Lambda runtime
        from botocore.config import Config

        CLIENTS = (boto3.client("s3"), boto3.client("lambda", config=Config(read_timeout=300, retries={"max_attempts": 0})))
    return CLIENTS


def error_code(error):
    return str(getattr(error, "response", {}).get("Error", {}).get("Code", ""))


# ---- settings ----

def settings():
    bucket = os.environ.get("DATA_BUCKET", "")
    raw = os.environ.get("RAW_PREFIX", "")
    work = os.environ.get("WORK_PREFIX", "intake/")
    rebuild = os.environ.get("REBUILD_FUNCTION", "")
    if not bucket or not raw or not rebuild:
        raise IntakeError("The upload function isn't set up yet (DATA_BUCKET, RAW_PREFIX and REBUILD_FUNCTION). "
                          "Ask the IT/AWS contact.")
    raw, work = raw.rstrip("/") + "/", work.rstrip("/") + "/"
    L = lambda_module()
    # The rebuild reads its raw files from a fixed place; the 3 files must go exactly there.
    if (bucket, raw) != (L.BUCKET, L.RAW_PREFIX):
        raise IntakeError("DATA_BUCKET and RAW_PREFIX must be where rebuild-dashboard reads the raw files. "
                          "Ask the IT/AWS contact.")
    if work.startswith(raw) or raw.startswith(work):
        raise IntakeError("WORK_PREFIX must be outside the raw-files area (the rebuild reads every file there).")
    return {
        "bucket": bucket, "raw": raw, "work": work, "rebuild": rebuild,
        "admin_group": os.environ.get("ADMIN_GROUP", "dashboard-admins"),
        "max_bytes": int(float(os.environ.get("MAX_PDF_MB", "20")) * 1024 * 1024),
    }


# ---- storage ----

class Store:
    def __init__(self, cfg):
        self.s3 = clients()[0]
        self.bucket = cfg["bucket"]
        self.raw = cfg["raw"]
        self.work = cfg["work"]

    def keys(self, prefix):
        out = []
        for page in self.s3.get_paginator("list_objects_v2").paginate(Bucket=self.bucket, Prefix=prefix):
            out += [o["Key"] for o in page.get("Contents", [])]
        return out

    def get(self, key):
        return self.s3.get_object(Bucket=self.bucket, Key=key)["Body"].read()

    def put(self, key, data, kind="application/octet-stream", **conditions):
        return self.s3.put_object(Bucket=self.bucket, Key=key, Body=data, ContentType=kind, **conditions)

    def get_json(self, key):
        try:
            return json.loads(self.get(key))
        except Exception as error:
            if error_code(error) in ("NoSuchKey", "404"):
                return None
            raise

    def put_json(self, key, value, **conditions):
        return self.put(key, json.dumps(value, indent=2).encode(), "application/json", **conditions)

    # The raw files

    def download_raw(self, folder):
        """The 3 raw files into `folder`. Any other data file there would also be read by the rebuild, so it stops."""
        os.makedirs(folder, exist_ok=True)
        keys = self.keys(self.raw)
        data = [k for k in keys if k.lower().endswith((".xlsx", ".csv"))]
        extra = [k[len(self.raw):] for k in data if k[len(self.raw):] not in F.DATA_FILES]
        if extra:
            raise IntakeError("The raw-files area has other .xlsx/.csv files, which the rebuild would also read: "
                              + ", ".join(extra) + ". Ask the IT/AWS contact to move them out. Nothing was changed.")
        for name in F.DATA_FILES:
            if self.raw + name not in keys:
                raise IntakeError(f"The raw-files area is missing {name}. Ask the IT/AWS contact. Nothing was changed.")
            with open(os.path.join(folder, name), "wb") as fh:
                fh.write(self.get(self.raw + name))
        F.check_dashboard_dir(folder)

    def upload_raw(self, folder):
        for name in F.DATA_FILES:
            with open(os.path.join(folder, name), "rb") as fh:
                self.put(self.raw + name, fh.read(), "text/csv" if name.endswith(".csv") else
                         "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")

    # Folders in the work area (staging, backups)

    def download_folder(self, prefix, folder, only=None):
        os.makedirs(folder, exist_ok=True)
        got = {}
        for key in self.keys(prefix):
            name = key[len(prefix):]
            if not name or "/" in name or (only and name not in only):
                continue
            data = self.get(key)
            with open(os.path.join(folder, name), "wb") as fh:
                fh.write(data)
            got[key] = hashlib.sha256(data).hexdigest()
        return got

    def upload_folder(self, folder, prefix):
        for name in sorted(os.listdir(folder)):
            with open(os.path.join(folder, name), "rb") as fh:
                self.put(prefix + name, fh.read())


class Backups:
    """The backups area mirrored into the engine's local backups folder: every backup's note
    (backup.json), plus the files of any backup the engine needs. Afterwards, only new or changed
    files are written back. Nothing is ever deleted."""

    def __init__(self, store, intake_dir):
        self.store = store
        self.prefix = store.work + "backups/"
        self.local = os.path.join(intake_dir, "backups")
        self.seen = {}
        os.makedirs(self.local, exist_ok=True)
        for key in self.store.keys(self.prefix):
            name, _, file = key[len(self.prefix):].partition("/")
            if BACKUP_PATTERN.match(name):
                os.makedirs(os.path.join(self.local, name), exist_ok=True)
                if file == intake.MANIFEST:
                    self.seen.update(self.store.download_folder(f"{self.prefix}{name}/", os.path.join(self.local, name),
                                                                only={intake.MANIFEST}))

    def fetch(self, name):
        """The data files of one backup (for undo)."""
        self.seen.update(self.store.download_folder(f"{self.prefix}{name}/", os.path.join(self.local, name),
                                                    only=set(F.DATA_FILES)))

    def sync(self):
        """Writes new or changed backup files to storage, data files before notes."""
        for name in sorted(os.listdir(self.local)):
            folder = os.path.join(self.local, name)
            for file in sorted(os.listdir(folder), key=lambda f: f == intake.MANIFEST):
                key = f"{self.prefix}{name}/{file}"
                with open(os.path.join(folder, file), "rb") as fh:
                    data = fh.read()
                digest = hashlib.sha256(data).hexdigest()
                if self.seen.get(key) != digest:
                    self.store.put(key, data)
                    self.seen[key] = digest


class Lock:
    """Only one Apply or Undo at a time (a lock note in the work area, written only if absent)."""

    def __init__(self, store, job_id):
        self.store = store
        self.key = store.work + "lock.json"
        self.job_id = job_id

    def __enter__(self):
        note = {"jobId": self.job_id, "since": time.time()}
        try:
            self.store.put_json(self.key, note, IfNoneMatch="*")
            return self
        except Exception as error:
            if error_code(error) not in ("PreconditionFailed", "412", "ConditionalRequestConflict", "409"):
                raise
        held = self.store.s3.get_object(Bucket=self.store.bucket, Key=self.key)
        since = json.loads(held["Body"].read()).get("since", 0)
        if time.time() - since < STALE_LOCK_SECONDS:
            raise IntakeError("Another update or undo is running. Wait a minute and try again. Nothing was changed.")
        try:
            self.store.put_json(self.key, note, IfMatch=held["ETag"])
        except Exception as error:
            if error_code(error) in ("PreconditionFailed", "412", "ConditionalRequestConflict", "409"):
                raise IntakeError("Another update or undo is running. Wait a minute and try again. Nothing was changed.") from None
            raise
        return self

    def __exit__(self, *_):
        self.store.s3.delete_object(Bucket=self.store.bucket, Key=self.key)


# ---- the check after Apply and Undo ----

def rebuild_checks(store, backups, dashboard_dir, rebuild_function):
    """Stands in for `npm run dashboard:data` and `dashboard:verify`: saves any new backup first,
    then uploads the 3 files and runs rebuild-dashboard. A failure or any warning counts as failed."""

    def checks(_scripts):
        steps = []
        try:
            backups.sync()
            store.upload_raw(dashboard_dir)
            steps.append({"step": "upload the 3 files", "ok": True, "output": ""})
        except Exception as error:
            steps.append({"step": "upload the 3 files", "ok": False, "output": str(error)})
            return steps
        try:
            answer = clients()[1].invoke(FunctionName=rebuild_function, InvocationType="RequestResponse", Payload=b"{}")
            payload = json.loads(answer["Payload"].read() or b"{}")
        except Exception as error:
            steps.append({"step": "rebuild-dashboard", "ok": False, "output": f"Couldn't run it: {error}"})
            return steps
        if answer.get("FunctionError"):
            message = payload.get("errorMessage") if isinstance(payload, dict) else str(payload)
            steps.append({"step": "rebuild-dashboard", "ok": False, "output": message or "it failed"})
            return steps
        warnings = payload.get("warnings") or []
        lines = [f"{k}: {payload[k]}" for k in ("postsMonthly", "nationalityMonthly", "annualCountry", "operational") if k in payload]
        lines += [f"Warning: {w}" for w in warnings]
        steps.append({"step": "rebuild-dashboard", "ok": bool(payload.get("ok")) and not warnings, "output": "\n".join(lines)})
        return steps

    return checks


# ---- jobs ----

def new_id():
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-") + secrets.token_hex(4)


def job_key(cfg, job_id):
    return f"{cfg['work']}jobs/{job_id}.json"


def public(job):
    return {k: job.get(k) for k in ("jobId", "action", "status", "created", "updated", "result")}


def save_job(store, cfg, job, **changes):
    job.update(changes, updated=datetime.now(timezone.utc).isoformat(timespec="seconds"))
    store.put_json(job_key(cfg, job["jobId"]), job)


def run_job(job_id):
    """The background part: runs one job and stores its result. Never raises."""
    cfg = settings()
    store = Store(cfg)
    job = store.get_json(job_key(cfg, job_id))
    if not job or job.get("status") != "queued":
        return  # already started (for example a repeated delivery): never run a job twice
    save_job(store, cfg, job, status="running")
    work = tempfile.mkdtemp(prefix="intake-")
    try:
        result = ACTION_RUNNERS[job["action"]](store, cfg, job, work)
        save_job(store, cfg, job, status="done", result=result)
    except IntakeError as error:
        # Messages name files by their temporary paths here; show just the names.
        message = error.dashboard.replace(os.path.join(work, "uploads") + os.sep, "").replace(work + os.sep, "")
        save_job(store, cfg, job, status="done", result=failure(job["action"], message))
    except Exception as error:  # noqa: BLE001 (the job must always end with a status)
        print(f"intake job {job_id} failed: {error!r}")
        save_job(store, cfg, job, status="failed",
                 result=failure(job["action"], "Something went wrong on the server. Nothing more was changed; "
                                "ask the IT/AWS contact to check the function's log."))
    finally:
        shutil.rmtree(work, ignore_errors=True)


def failure(action, message):
    if action in ("apply", "undo"):
        return {"ok": False, "message": f"Stopped: {message}"}
    return {"ok": False, "error": message}


def folders(work):
    dashboard_dir = os.path.join(work, "dashboard")
    intake_dir = os.path.join(work, "intake")
    os.makedirs(intake_dir, exist_ok=True)
    return dashboard_dir, intake_dir


def do_check(store, cfg, job, work):
    import pdf_extract  # needs pdfplumber, packaged in the zip

    dashboard_dir, intake_dir = folders(work)
    store.download_raw(dashboard_dir)
    upload_dir = os.path.join(work, "uploads")
    store.download_folder(f"{cfg['work']}uploads/{job['uploadId']}/", upload_dir)
    paths = [os.path.join(upload_dir, n) for n in sorted(os.listdir(upload_dir)) if n.lower().endswith(".pdf")]
    if not paths:
        raise IntakeError("Drop the month's two PDF reports first.")
    parsed = []
    for path in paths:
        try:
            p = pdf_extract.read_pdf(path)
        except IntakeError:
            raise
        except Exception:  # noqa: BLE001 (not a readable PDF)
            raise IntakeError(f"{os.path.basename(path)} couldn't be read. Is it one of the State Department's "
                              "two monthly PDF reports?") from None
        p["notes"] = pdf_extract.check_totals(p, os.path.basename(path))
        parsed.append(p)
    report = intake.run(intake.group_reports(parsed), dashboard_dir, intake_dir, replace=bool(job.get("replace")))
    report["warnings"] += [n for p in parsed for n in p["notes"]]
    store.upload_folder(report["staging"], f"{cfg['work']}staging/{job['jobId']}/")
    report["staging"] = f"staging/{job['jobId']}"
    job["checked"] = {"before": intake.fingerprint(dashboard_dir), "months": report["monthLabels"]}
    return {"ok": True, "report": intake.report_text(report, dashboard=True), "bigChanges": report["bigChanges"],
            "id": job["jobId"]}


def do_apply(store, cfg, job, work):
    check = store.get_json(job_key(cfg, job["checkJob"]))
    if not check or check.get("action") != "check" or not (check.get("result") or {}).get("ok") or not check.get("checked"):
        raise IntakeError("Check the PDFs again first.")
    if check.get("appliedBy"):
        raise IntakeError("These checked files were already applied. Check the PDFs again to add them.")
    with Lock(store, job["jobId"]):
        save_job(store, cfg, check, appliedBy=job["jobId"])  # one Apply per check, even if this one fails
        dashboard_dir, intake_dir = folders(work)
        store.download_raw(dashboard_dir)
        if intake.fingerprint(dashboard_dir) != check["checked"]["before"]:
            raise IntakeError("The data files changed since the check. Drop the PDFs and check them again. Nothing was changed.")
        staging = os.path.join(intake_dir, "staging", check["jobId"])
        store.download_folder(f"{cfg['work']}staging/{check['jobId']}/", staging, only=set(F.DATA_FILES))
        backups = Backups(store, intake_dir)
        checks = rebuild_checks(store, backups, dashboard_dir, cfg["rebuild"])
        result = intake.apply_and_check(staging, dashboard_dir, intake_dir, check["checked"]["months"], checks=checks)
        backups.sync()  # the note of a rolled-back apply
        return steps_result(result)


def undo_setup(store, work):
    dashboard_dir, intake_dir = folders(work)
    store.download_raw(dashboard_dir)
    backups = Backups(store, intake_dir)
    backup, _ = intake.undo_target(intake_dir)
    backups.fetch(os.path.basename(backup))
    return dashboard_dir, intake_dir, backups


def do_undo_info(store, cfg, job, work):
    dashboard_dir, intake_dir, _ = undo_setup(store, work)
    info = intake.undo_info(dashboard_dir, intake_dir)
    return {"ok": True, "backup": info["backup"], "text": intake.undo_text(info)}


def do_undo(store, cfg, job, work):
    with Lock(store, job["jobId"]):
        dashboard_dir, intake_dir, backups = undo_setup(store, work)
        checks = rebuild_checks(store, backups, dashboard_dir, cfg["rebuild"])
        result = intake.undo(dashboard_dir, intake_dir, expected_backup=job.get("backup"), checks=checks)
        backups.sync()
        return steps_result(result)


def steps_result(result):
    """The engine's result as the tab shows it, naming backups rather than temporary folders."""
    for key in ("backup", "savedCopy"):
        if result.get(key):
            result[key] = f"backups/{os.path.basename(result[key])}"
    if result.get("restoreSteps") and not all(s["ok"] for s in result["restoreSteps"]):
        result["message"] = ("Apply failed and the old files are restored, but rebuilding the dashboard from them "
                             "also failed. Stop and ask the IT/AWS contact.")
    return {"ok": result["ok"], "message": result["message"], "text": intake.steps_text(result)}


ACTION_RUNNERS = {"check": do_check, "apply": do_apply, "undo-info": do_undo_info, "undo": do_undo}


# ---- the API ----

def respond(status, body):
    return {"statusCode": status, "headers": {"Content-Type": "application/json", "Cache-Control": "no-store"},
            "body": json.dumps(body)}


def groups_of(event):
    """The signed-in person's groups, from the sign-in token the API has already verified."""
    claims = (((event.get("requestContext") or {}).get("authorizer") or {}).get("jwt") or {}).get("claims")
    if not claims:
        return None
    groups = claims.get("cognito:groups", [])
    if isinstance(groups, str):  # the API passes a list claim as text: "[a b]" or '["a","b"]'
        text = groups.strip()
        try:
            groups = json.loads(text) if text.startswith('["') else text.strip("[]").replace(",", " ").split()
        except ValueError:
            groups = text.strip("[]").replace(",", " ").split()
    return [str(g) for g in groups]


def body_of(event):
    raw = event.get("body") or "{}"
    if event.get("isBase64Encoded"):
        import base64

        raw = base64.b64decode(raw).decode()
    try:
        body = json.loads(raw)
    except ValueError:
        raise IntakeError("The request wasn't understood.") from None
    if not isinstance(body, dict):
        raise IntakeError("The request wasn't understood.")
    return body


def create_uploads(store, cfg, body):
    files = body.get("files")
    if not isinstance(files, list) or not files:
        raise IntakeError("Drop the month's two PDF reports first.")
    if len(files) > MAX_FILES:
        raise IntakeError(f"At most {MAX_FILES} PDFs at a time.")
    names = []
    for f in files:
        name = os.path.basename(str((f or {}).get("name", "")))
        if not PDF_NAME.match(name):
            raise IntakeError(f"Only the two PDF reports can be added here ({name or 'a file'} isn't a PDF, "
                              "or its name has unusual characters).")
        size = (f or {}).get("size")
        if not isinstance(size, int) or size <= 0 or size > cfg["max_bytes"]:
            raise IntakeError(f"{name} is empty or larger than {cfg['max_bytes'] // (1024 * 1024)} MB.")
        if name in names:
            raise IntakeError(f"{name} was added twice.")
        names.append(name)
    upload_id = new_id()
    links = []
    for name in names:
        post = store.s3.generate_presigned_post(
            Bucket=cfg["bucket"], Key=f"{cfg['work']}uploads/{upload_id}/{name}",
            Fields={"Content-Type": "application/pdf"},
            Conditions=[{"Content-Type": "application/pdf"}, ["content-length-range", 1, cfg["max_bytes"]]],
            ExpiresIn=UPLOAD_LINK_SECONDS,
        )
        links.append({"name": name, "url": post["url"], "fields": post["fields"]})
    return {"uploadId": upload_id, "uploads": links}


def create_job(store, cfg, body, who):
    action = body.get("action")
    if action not in ACTIONS:
        raise IntakeError("The request wasn't understood.")
    job = {"jobId": new_id(), "action": action, "status": "queued", "by": who,
           "created": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    if action == "check":
        if not ID_PATTERN.match(str(body.get("uploadId", ""))):
            raise IntakeError("Drop the month's two PDF reports first.")
        job.update(uploadId=body["uploadId"], replace=bool(body.get("replace")))
    elif action == "apply":
        if not ID_PATTERN.match(str(body.get("checkJob", ""))):
            raise IntakeError("Check the PDFs again first.")
        job["checkJob"] = body["checkJob"]
    elif action == "undo":
        if not BACKUP_PATTERN.match(str(body.get("backup", ""))):
            raise IntakeError("Press Undo again to see what it would do now.")
        job["backup"] = body["backup"]
    save_job(store, cfg, job)
    clients()[1].invoke(FunctionName=os.environ["AWS_LAMBDA_FUNCTION_NAME"], InvocationType="Event",
                        Payload=json.dumps({"intakeWorker": job["jobId"]}).encode())
    return {"jobId": job["jobId"], "status": "queued"}


def route(event):
    context = event.get("requestContext") or {}
    method = ((context.get("http") or {}).get("method") or event.get("httpMethod") or "").upper()
    path = (event.get("rawPath") or event.get("path") or "").rstrip("/")
    groups = groups_of(event)
    if groups is None:
        return respond(401, {"error": "Sign in again, then try again."})
    cfg = settings()
    if cfg["admin_group"] not in groups:
        return respond(403, {"error": "Only dashboard admins can update the data. Ask the IT/AWS contact to add you."})
    claims = context["authorizer"]["jwt"]["claims"]
    who = claims.get("email") or claims.get("sub") or "unknown"
    store = Store(cfg)
    try:
        if method == "POST" and path.endswith("/intake/uploads"):
            return respond(200, create_uploads(store, cfg, body_of(event)))
        if method == "POST" and path.endswith("/intake/jobs"):
            return respond(200, create_job(store, cfg, body_of(event), who))
        match = re.search(r"/intake/jobs/([^/]+)$", path)
        if method == "GET" and match:
            job_id = match.group(1)
            job = store.get_json(job_key(cfg, job_id)) if ID_PATTERN.match(job_id) else None
            return respond(200, public(job)) if job else respond(404, {"error": "No such job."})
        return respond(404, {"error": "Not found."})
    except IntakeError as error:
        return respond(400, {"error": error.dashboard})


def lambda_handler(event, _context):
    # A background job comes from this function itself (never through the API, whose events
    # always carry requestContext).
    if "intakeWorker" in event and "requestContext" not in event:
        job_id = str(event["intakeWorker"])
        if ID_PATTERN.match(job_id):
            run_job(job_id)
        return {"ok": True}
    try:
        return route(event)
    except IntakeError as error:
        return respond(500, {"error": error.dashboard})
    except Exception as error:  # noqa: BLE001
        print(f"intake-upload error: {error!r}")
        return respond(500, {"error": "Something went wrong on the server. Ask the IT/AWS contact to check the function's log."})
