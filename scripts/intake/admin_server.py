#!/usr/bin/env python3
"""The local intake page: `npm run admin`, then open the address it prints.

Runs only on this computer (127.0.0.1), never on the website. Drop a month's two PDFs → see the
report from the staged files → Apply replaces the 3 files in dashboard/ (after a backup), then
runs dashboard:data and dashboard:verify and shows the result. A one-time token in the address
and a same-origin check stop other web pages from using it.
"""

import hashlib
import json
import os
import secrets
import subprocess
import sys
from email.parser import BytesParser
from email.policy import default as email_policy
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import files as F  # noqa: E402
import intake  # noqa: E402
import pdf_extract  # noqa: E402
from files import IntakeError  # noqa: E402

HOST = "127.0.0.1"
PORT = int(os.environ.get("INTAKE_PORT", "8765"))
TOKEN = secrets.token_urlsafe(24)
PAGE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "admin.html")
MAX_UPLOAD = 50 * 1024 * 1024
PREVIEWS = {}  # staging folder → fingerprint of the 3 originals when the preview was made


def originals_fingerprint(dashboard_dir):
    h = hashlib.sha256()
    for name in F.DATA_FILES:
        with open(os.path.join(dashboard_dir, name), "rb") as fh:
            h.update(hashlib.sha256(fh.read()).digest())
    return h.hexdigest()


def tail(text, lines=25):
    return "\n".join(text.strip().splitlines()[-lines:])


class Handler(BaseHTTPRequestHandler):
    server_version = "intake"

    def log_message(self, fmt, *args):
        sys.stderr.write("  " + fmt % args + "\n")

    def _send(self, status, body, kind="application/json"):
        data = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _allowed(self):
        origin = self.headers.get("Origin")
        return (
            self.headers.get("Host") == f"{HOST}:{PORT}"
            and (origin is None or origin == f"http://{HOST}:{PORT}")
            and secrets.compare_digest(self.headers.get("X-Intake-Token", ""), TOKEN)
        )

    def do_GET(self):
        if self.headers.get("Host") != f"{HOST}:{PORT}" or self.path != f"/?t={TOKEN}":
            return self._send(404, b"Not found", "text/plain")
        with open(PAGE, "rb") as fh:
            html = fh.read().replace(b"__TOKEN__", TOKEN.encode())
        self._send(200, html, "text/html; charset=utf-8")

    def do_POST(self):
        if not self._allowed():
            return self._send(403, {"error": "Not allowed."})
        length = int(self.headers.get("Content-Length", "0"))
        if length > MAX_UPLOAD:
            return self._send(413, {"error": "Too large."})
        body = self.rfile.read(length)
        try:
            if self.path == "/api/preview":
                return self._send(200, self.preview(body))
            if self.path == "/api/apply":
                return self._send(200, self.apply(json.loads(body or b"{}")))
            return self._send(404, {"error": "Not found."})
        except IntakeError as error:
            return self._send(200, {"ok": False, "error": str(error)})

    def preview(self, body):
        message = BytesParser(policy=email_policy).parsebytes(
            f"Content-Type: {self.headers.get('Content-Type')}\r\n\r\n".encode() + body
        )
        upload_dir = os.path.join(intake.DEFAULT_INTAKE, "uploads", intake.stamp())
        os.makedirs(upload_dir, exist_ok=True)
        paths, replace = [], False
        for part in message.iter_parts():
            name = part.get_param("name", header="content-disposition")
            if name == "replace":
                replace = part.get_content().strip() == "1"
                continue
            filename = os.path.basename(part.get_filename() or "")
            if not filename.lower().endswith(".pdf"):
                raise IntakeError(f"Only the two PDF reports can be dropped here ({filename or 'a file'} isn't a PDF).")
            path = os.path.join(upload_dir, filename)
            with open(path, "wb") as fh:
                fh.write(part.get_payload(decode=True))
            paths.append(path)
        if not paths:
            raise IntakeError("Drop the month's two PDF reports first.")
        parsed = []
        for path in paths:
            p = pdf_extract.read_pdf(path)
            p["notes"] = pdf_extract.check_totals(p, os.path.basename(path))
            parsed.append(p)
        report = intake.run(intake.group_reports(parsed), replace=replace)
        report["warnings"] += [n for p in parsed for n in p["notes"]]
        PREVIEWS[report["staging"]] = originals_fingerprint(intake.DEFAULT_DASHBOARD)
        return {"ok": True, "report": intake.report_text(report), "staging": report["staging"]}

    def apply(self, body):
        staging = body.get("staging")
        if staging not in PREVIEWS:
            raise IntakeError("Preview the files again first.")
        if originals_fingerprint(intake.DEFAULT_DASHBOARD) != PREVIEWS.pop(staging):
            raise IntakeError("The files in dashboard/ changed since the preview. Drop the PDFs again.")
        backup = intake.apply_staged(staging, intake.DEFAULT_DASHBOARD, intake.DEFAULT_INTAKE)
        steps = []
        for script in ("dashboard:data", "dashboard:verify"):
            done = subprocess.run(["npm", "run", script], cwd=intake.ROOT, capture_output=True, text=True)
            steps.append({"step": script, "ok": done.returncode == 0, "output": tail(done.stdout + done.stderr)})
            if done.returncode != 0:
                break
        return {"ok": all(s["ok"] for s in steps), "backup": backup, "steps": steps}


def main():
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"\n  Intake page (this computer only): http://{HOST}:{PORT}/?t={TOKEN}\n  Ctrl+C to stop.\n", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
