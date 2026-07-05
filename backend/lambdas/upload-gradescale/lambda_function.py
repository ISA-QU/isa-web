"""
POST /gradescales
Body JSON: {
  instituteId, name, country, foreignKind,
  scale: { foreignGrade: usLetter, ... },
  letterToGpa: { usLetter: gpaPoints, ... }
}
"""

import json
import time
import boto3
from decimal import Decimal

TABLE_GRADESCALE = "gradescales"
ddb = boto3.resource("dynamodb")
table = ddb.Table(TABLE_GRADESCALE)


def _to_decimal(obj):
    if isinstance(obj, float):
        return Decimal(str(obj))
    if isinstance(obj, dict):
        return {k: _to_decimal(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_to_decimal(v) for v in obj]
    return obj


def _resp(status, body):
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body, default=str),
    }


def lambda_handler(event, _context):
    try:
        raw = event.get("body") or "{}"
        body = json.loads(raw) if isinstance(raw, str) else raw

        institute_id = (body.get("instituteId") or "").strip()
        if not institute_id:
            return _resp(400, {"error": "instituteId is required"})

        scale = body.get("scale")
        if not isinstance(scale, dict):
            scale = {}

        letter_to_gpa = body.get("letterToGpa")
        if not isinstance(letter_to_gpa, dict):
            letter_to_gpa = {}

        item = {
            "instituteId": institute_id,
            "name": body.get("name") or "",
            "country": body.get("country") or "",
            "foreignKind": body.get("foreignKind") or "letter",
            "scale": scale,
            "letterToGpa": letter_to_gpa,
            "updatedAt": int(time.time() * 1000),
        }

        table.put_item(Item=_to_decimal(item))
        return _resp(200, {"ok": True, "item": item})
    except Exception as e:
        print(f"error: {e}")
        return _resp(500, {"error": str(e)})
