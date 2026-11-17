#!/usr/bin/env python3
"""Builds the intake-upload Lambda's zip: build/intake-upload.zip (build/ is gitignored).

    npm run intake:lambda

The zip holds the function (backend/lambdas/intake-upload/lambda_function.py, at the top as
Lambda expects), the intake engine and rebuild-dashboard's code at their places in the repo (so
lambda_bridge finds the rebuild code the same way it does here, with no copy in the repo), and
the Linux builds of the engine's packages (scripts/intake/requirements.txt) for the Lambda's
Python, plus a pinned boto3: the runtime has its own, but it can be too old for the storage's
"write only if absent" lock the function relies on.
"""

import argparse
import os
import subprocess
import sys
import tempfile
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(ROOT, "build", "intake-upload.zip")

# (file in the repo, path in the zip)
CODE = [
    ("backend/lambdas/intake-upload/lambda_function.py", "lambda_function.py"),
    ("backend/lambdas/rebuild-dashboard/lambda_function.py", "backend/lambdas/rebuild-dashboard/lambda_function.py"),
    *[(f"scripts/intake/{n}.py", f"scripts/intake/{n}.py") for n in ("files", "intake", "lambda_bridge", "pdf_extract", "pdf_spellings")],
]
# Also in the zip (see above).
EXTRA_PACKAGES = ["boto3==1.44.0"]
# Not needed to run (command-line tools, caches).
SKIP_DIRS = {"bin", "__pycache__"}
FIXED_TIME = (2026, 1, 1, 0, 0, 0)  # the same files always give the same zip


def add(z, path, name):
    with open(path, "rb") as fh:
        data = fh.read()
    info = zipfile.ZipInfo(name, FIXED_TIME)
    info.external_attr = 0o644 << 16
    info.compress_type = zipfile.ZIP_DEFLATED
    z.writestr(info, data)


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--python", default="3.12", help="the Lambda's Python version (default 3.12)")
    parser.add_argument("--platform", default="manylinux2014_x86_64",
                        help="manylinux2014_x86_64 for an x86_64 Lambda (default), manylinux2014_aarch64 for arm64")
    args = parser.parse_args()

    with tempfile.TemporaryDirectory() as packages:
        print(f"Fetching the packages for Python {args.python} on {args.platform}…")
        done = subprocess.run(
            [sys.executable, "-m", "pip", "install", "--quiet", "--disable-pip-version-check", "--no-compile",
             "--platform", args.platform, "--implementation", "cp", "--python-version", args.python,
             "--only-binary=:all:", "--target", packages, "-r", os.path.join(HERE, "requirements.txt"), *EXTRA_PACKAGES],
            capture_output=True, text=True,
        )
        if done.returncode != 0:
            print(done.stdout + done.stderr)
            print("Couldn't fetch the packages (pip needs internet access to pypi.org). Nothing was built.")
            return 1
        os.makedirs(os.path.dirname(OUT), exist_ok=True)
        partial = OUT + ".partial"
        count = 0
        with zipfile.ZipFile(partial, "w") as z:
            for path, name in CODE:
                add(z, os.path.join(ROOT, path), name)
                count += 1
            for folder, dirs, names in os.walk(packages):
                dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS)
                for n in sorted(names):
                    full = os.path.join(folder, n)
                    add(z, full, os.path.relpath(full, packages).replace(os.sep, "/"))
                    count += 1
        os.replace(partial, OUT)
    with zipfile.ZipFile(OUT) as z:
        unzipped = sum(i.file_size for i in z.infolist())
    print(f"Built {os.path.relpath(OUT, ROOT)}: {count} files, {os.path.getsize(OUT) / 1e6:.1f} MB "
          f"({unzipped / 1e6:.1f} MB unzipped; Lambda's limits are 50 MB to upload directly and 250 MB unzipped).")
    print("Handler: lambda_function.lambda_handler. See docs/UPLOAD_AWS_SETUP.md.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
