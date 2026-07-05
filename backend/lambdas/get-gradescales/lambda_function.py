"""
GET /gradescales               -> list/search
GET /gradescales/{instituteId} -> fetch one

Query params (list):
  q     - matches instituteId exactly OR substring on name (case-insensitive)
  limit - default 50
"""

import json
import boto3
from decimal import Decimal

TABLE_GRADESCALE = "gradescales"
ddb = boto3.resource("dynamodb")
table = ddb.Table(TABLE_GRADESCALE)


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
        institute_id = path_params.get("instituteId")
        if institute_id:
            return _get_one(institute_id)
        return _list(event.get("queryStringParameters") or {})
    except Exception as e:
        print(f"error: {e}")
        return _resp(500, {"error": str(e)})


def _list(qs):
    q = (qs.get("q") or "").strip()
    try:
        limit = min(int(qs.get("limit") or 50), 200)
    except (TypeError, ValueError):
        limit = 50

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
            if it.get("instituteId") == q
            or (isinstance(it.get("name"), str) and lower in it["name"].lower())
        ]

    items.sort(key=lambda it: it.get("updatedAt", 0), reverse=True)
    return _resp(200, {"items": items[:limit]})


def _get_one(institute_id):
    res = table.get_item(Key={"instituteId": institute_id})
    item = res.get("Item")
    if not item:
        return _resp(404, {"error": "Not found"})
    return _resp(200, {"item": item})
