import json
import boto3
from botocore.exceptions import ClientError
from decimal import Decimal

TABLE_GPA = "gpa"
S3_BUCKET = "isa-transcripts"
S3_PREFIX = "transcripts"

ddb = boto3.resource("dynamodb")
table = ddb.Table(TABLE_GPA)
s3 = boto3.client("s3")


class DecimalEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, Decimal):
            return float(o) if o % 1 else int(o)
        return super().default(o)


def _resp(status, body):
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body, cls=DecimalEncoder),
    }


def lambda_handler(event, _context):
    try:
        path_params = event.get("pathParameters") or {}
        student_id = path_params.get("studentId")
        if student_id:
            return _get_one(student_id)
        return _list(event.get("queryStringParameters") or {})
    except Exception as e:
        print(f"error: {e}")
        return _resp(500, {"error": str(e)})


def _list(qs):
    q = (qs.get("q") or "").strip()
    try:
        limit = min(int(qs.get("limit") or 20), 100)
    except (TypeError, ValueError):
        limit = 20

    items = []
    scan_kwargs = {}
    while True:
        page = table.scan(**scan_kwargs)
        items.extend(page.get("Items", []))
        if "LastEvaluatedKey" not in page:
            break
        scan_kwargs["ExclusiveStartKey"] = page["LastEvaluatedKey"]

    if q:
        lower = q.lower()
        items = [
            it for it in items
            if (isinstance(it.get("studentId"), str) and lower in it["studentId"].lower())
            or (isinstance(it.get("name"), str) and lower in it["name"].lower())
        ]

    items.sort(key=lambda it: it.get("updatedAt", 0), reverse=True)
    return _resp(200, {"items": items[:limit]})


def _get_one(student_id):
    res = table.get_item(Key={"studentId": student_id})
    item = res.get("Item")
    if not item:
        return _resp(404, {"error": "Not found"})

    snapshot = None
    key = f"{S3_PREFIX}/{student_id}.json"
    try:
        obj = s3.get_object(Bucket=S3_BUCKET, Key=key)
        snapshot = json.loads(obj["Body"].read().decode("utf-8"))
    except ClientError as e:
        if e.response["Error"]["Code"] not in ("NoSuchKey", "404"):
            raise

    return _resp(200, {"meta": item, "snapshot": snapshot})
