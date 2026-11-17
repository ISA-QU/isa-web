#!/usr/bin/env python3
"""Proves the intake-upload Lambda end to end on the real files, with no AWS: stand-in storage
in dashboard-intake/lambda-proof/ (fake_aws.py) holds copies of the 3 files from dashboard/, and
the real rebuild-dashboard code builds the snapshot there.

    python3 scripts/intake/lambda_proof.py --pdf "<nationality>.pdf" --pdf "<post>.pdf"

With a month that's already in the files (February 2026, say):
1. Check without Replace must be refused as already in the files (the first AWS test).
2. Check with Replace, then Apply: the rebuild must pass, and its snapshot must equal the one
   built from the current files (ignoring build time and file dates).
3. Undo: the 3 files must be byte-identical to the originals, and the snapshot equal again.
dashboard/ is only read.
"""

import argparse
import importlib.util
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import files as F  # noqa: E402
import intake  # noqa: E402
from fake_aws import FakeLambda, FakeS3  # noqa: E402
from lambda_bridge import ROOT, lambda_module  # noqa: E402
from proof import first_difference, normalised  # noqa: E402

HANDLER_PATH = os.path.join(ROOT, "backend", "lambdas", "intake-upload", "lambda_function.py")
WORK = "intake/"


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--pdf", action="append", required=True)
    args = parser.parse_args()

    spec = importlib.util.spec_from_file_location("intake_upload_lambda", HANDLER_PATH)
    handler = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(handler)
    L = lambda_module()
    os.environ.update({"DATA_BUCKET": L.BUCKET, "RAW_PREFIX": L.RAW_PREFIX, "WORK_PREFIX": WORK,
                       "REBUILD_FUNCTION": "rebuild-dashboard", "AWS_LAMBDA_FUNCTION_NAME": "intake-upload"})
    root = os.path.join(intake.DEFAULT_INTAKE, "lambda-proof", intake.stamp())
    s3 = FakeS3(os.path.join(root, "s3"))
    lam = FakeLambda(s3, "rebuild-dashboard", "intake-upload", mode="real")
    handler.CLIENTS = (s3, lam)

    F.check_dashboard_dir(intake.DEFAULT_DASHBOARD)
    original = {}
    for name in F.DATA_FILES:
        with open(os.path.join(intake.DEFAULT_DASHBOARD, name), "rb") as fh:
            original[L.RAW_PREFIX + name] = fh.read()
        s3.write(L.BUCKET, L.RAW_PREFIX + name, original[L.RAW_PREFIX + name])
    raw = lambda: {k: s3.read(L.BUCKET, k) for k in s3.list_keys(L.BUCKET, L.RAW_PREFIX)}  # noqa: E731

    def call(method, path, body=None):
        event = {"rawPath": path, "requestContext": {"http": {"method": method}, "authorizer": {"jwt": {"claims": {
            "sub": "proof", "cognito:groups": "[dashboard-admins]"}}}}}
        if body is not None:
            event["body"] = json.dumps(body)
        answer = handler.lambda_handler(event, None)
        result = json.loads(answer["body"])
        if answer["statusCode"] != 200:
            raise SystemExit(f"{method} {path} answered {answer['statusCode']}: {result}")
        return result

    def job(body):
        started = call("POST", "/intake/jobs", body)
        lam.run_queued(handler)
        done = call("GET", f"/intake/jobs/{started['jobId']}")
        if done["status"] != "done":
            raise SystemExit(f"The {body['action']} job ended {done['status']}: {done.get('result')}")
        return done["result"]

    def check(replace):
        files = [{"name": os.path.basename(p), "size": os.path.getsize(p)} for p in args.pdf]
        links = call("POST", "/intake/uploads", {"files": files})
        for link, path in zip(links["uploads"], args.pdf):
            with open(path, "rb") as fh:
                s3.receive_upload(link, fh.read())
        return job({"action": "check", "uploadId": links["uploadId"], "replace": replace})

    ok = True

    def step(label, passed, detail=""):
        nonlocal ok
        ok = ok and passed
        print(f"{'PASS' if passed else 'FAIL'}  {label}{(': ' + detail) if detail else ''}")

    # The snapshot the current files give, for comparison.
    lam.invoke("rebuild-dashboard")
    before = normalised(lam.snapshot())

    refused = check(replace=False)
    step("Check without Replace is refused", not refused["ok"] and "already in the files" in refused.get("error", ""),
         refused.get("error", "it wasn't refused"))
    checked = check(replace=True)
    step("Check with Replace", checked["ok"], checked.get("error", ""))
    if checked["ok"]:
        print("\n".join("      " + line for line in checked["report"].splitlines() if "F1/J1" in line or line.endswith(":")))
        applied = job({"action": "apply", "checkJob": checked["id"]})
        step("Apply (rebuild-dashboard passes)", applied["ok"], applied["message"])
        after = normalised(lam.snapshot())
        step("The snapshot equals the one from the current files", after == before, first_difference(before[0], after[0]) or "")
        info = job({"action": "undo-info"})
        step("Undo shows what it would do", info["ok"], info.get("error") or info["text"].splitlines()[0])
        undone = job({"action": "undo", "backup": info.get("backup")})
        step("Undo", undone["ok"], undone["message"])
        step("The 3 files are byte-identical to the originals", raw() == original)
        step("The snapshot equals the one from the current files again", normalised(lam.snapshot()) == before)
    print(f"\n{'PASS' if ok else 'FAIL'}: stand-in storage kept in {os.path.relpath(root, ROOT)}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
