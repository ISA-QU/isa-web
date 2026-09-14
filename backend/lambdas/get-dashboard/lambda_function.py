import base64
import json
import boto3
from botocore.exceptions import ClientError

BUCKET = "isa-dashboard"
SNAPSHOT_KEY = "snapshot/snapshot.json.gz"

s3 = boto3.client("s3")


def _error(status, message):
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps({"error": message}),
    }


def lambda_handler(event, _context):
    headers = event.get("headers") or {}
    if_none_match = headers.get("if-none-match")
    try:
        kwargs = {"Bucket": BUCKET, "Key": SNAPSHOT_KEY}
        if if_none_match:
            kwargs["IfNoneMatch"] = if_none_match
        obj = s3.get_object(**kwargs)
    except ClientError as e:
        code = e.response["Error"]["Code"]
        if code in ("304", "NotModified"):
            return {"statusCode": 304, "headers": {"ETag": if_none_match}}
        if code in ("NoSuchKey", "404"):
            return _error(404, "No dashboard snapshot yet. Upload the raw files and run rebuild-dashboard.")
        print(f"error: {e}")
        return _error(500, str(e))

    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "application/json",
            "Content-Encoding": "gzip",
            "Cache-Control": "no-cache",
            "ETag": obj["ETag"],
        },
        "isBase64Encoded": True,
        "body": base64.b64encode(obj["Body"].read()).decode("ascii"),
    }
