"""
DELETE /transcripts/{studentId}
"""

import json
import boto3
from botocore.exceptions import ClientError

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
        "body": json.dumps(body),
    }


def lambda_handler(event, _context):
    try:
        path_params = event.get("pathParameters") or {}
        student_id = path_params.get("studentId")
        if not student_id:
            return _resp(400, {"error": "studentId path param required"})

        table.delete_item(Key={"studentId": student_id})

        key = f"{S3_PREFIX}/{student_id}.json"
        try:
            s3.delete_object(Bucket=S3_BUCKET, Key=key)
        except ClientError as e:
            if e.response["Error"]["Code"] not in ("NoSuchKey", "404"):
                raise

        return _resp(200, {"ok": True, "studentId": student_id})
    except Exception as e:
        print(f"error: {e}")
        return _resp(500, {"error": str(e)})
