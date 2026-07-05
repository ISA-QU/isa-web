"""
POST /transcripts
Body JSON: {
  studentId, name, cumulativeGpa, totalCredits, college, instituteId,
  schools: [...], snapshot: {...}
}
"""

import json
import time
import boto3
from decimal import Decimal

TABLE_GPA = "gpa"
S3_BUCKET = "isa-transcripts"
S3_PREFIX = "transcripts"

ddb = boto3.resource("dynamodb")
table = ddb.Table(TABLE_GPA)
s3 = boto3.client("s3")


def _resp(status, body):
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body, default=str),
    }


def _to_decimal(obj):
    """DynamoDB rejects floats — convert recursively."""
    if isinstance(obj, float):
        return Decimal(str(obj))
    if isinstance(obj, dict):
        return {k: _to_decimal(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_to_decimal(v) for v in obj]
    return obj


def lambda_handler(event, _context):
    try:
        raw = event.get("body") or "{}"
        body = json.loads(raw) if isinstance(raw, str) else raw

        student_id = (body.get("studentId") or "").strip()
        if not student_id:
            return _resp(400, {"error": "studentId is required"})

        updated_at = int(time.time() * 1000)
        item = {
            "studentId": student_id,
            "name": body.get("name") or "",
            "cumulativeGpa": body.get("cumulativeGpa"),
            "totalCredits": body.get("totalCredits") or 0,
            "college": body.get("college") or "",
            "instituteId": body.get("instituteId") or "",
            "schools": body.get("schools") or [],
            "updatedAt": updated_at,
        }

        table.put_item(Item=_to_decimal(item))

        if body.get("snapshot") is not None:
            key = f"{S3_PREFIX}/{student_id}.json"
            s3.put_object(
                Bucket=S3_BUCKET,
                Key=key,
                Body=json.dumps(body["snapshot"]).encode("utf-8"),
                ContentType="application/json",
            )

        return _resp(200, {"ok": True, "studentId": student_id, "updatedAt": updated_at})
    except Exception as e:
        print(f"error: {e}")
        return _resp(500, {"error": str(e)})
