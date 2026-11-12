"""Live upload: sends the 3 files to the dashboard's AWS storage and rebuilds the live snapshot.

SWITCHED OFF. TODO: this needs restored AWS access and the IT/AWS contact's setup (where the raw
files go, permission to run the rebuild). Until then the live dashboard is updated by the IT/AWS
contact. No account IDs, bucket names, keys or URLs belong in this public repo: when switched
on, the location comes only from environment variables (INTAKE_RAW_LOCATION,
INTAKE_REBUILD_FUNCTION) and the person's own AWS sign-in.
"""

import os

from files import DATA_FILES, IntakeError

LIVE_UPLOAD_ENABLED = False


def upload(dashboard_dir):
    if not LIVE_UPLOAD_ENABLED:
        raise IntakeError(
            "Live upload is switched off. The live dashboard is updated by the IT/AWS contact: send them "
            "the 3 files from dashboard/ after dashboard:verify passes."
        )
    location = os.environ.get("INTAKE_RAW_LOCATION")
    function = os.environ.get("INTAKE_REBUILD_FUNCTION")
    if not location or not function:
        raise IntakeError("Set INTAKE_RAW_LOCATION and INTAKE_REBUILD_FUNCTION (ask the IT/AWS contact).")
    try:
        import boto3  # only when switched on
    except ImportError:
        raise IntakeError("Live upload needs boto3: python3 -m pip install boto3") from None
    bucket, _, prefix = location.partition("/")
    s3 = boto3.client("s3")
    for name in DATA_FILES:
        s3.upload_file(os.path.join(dashboard_dir, name), bucket, f"{prefix.rstrip('/')}/{name}".lstrip("/"))
    result = boto3.client("lambda").invoke(FunctionName=function, Payload=b"{}")
    return result["Payload"].read().decode()
