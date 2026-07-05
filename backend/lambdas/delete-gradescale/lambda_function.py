"""
DELETE /gradescales/{instituteId}
"""

import json
import boto3

TABLE_GRADESCALE = "gradescales"
ddb = boto3.resource("dynamodb")
table = ddb.Table(TABLE_GRADESCALE)


def _resp(status, body):
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body),
    }


def lambda_handler(event, _context):
    try:
        path_params = event.get("pathParameters") or {}
        institute_id = path_params.get("instituteId")
        if not institute_id:
            return _resp(400, {"error": "instituteId path param required"})

        table.delete_item(Key={"instituteId": institute_id})
        return _resp(200, {"ok": True, "instituteId": institute_id})
    except Exception as e:
        print(f"error: {e}")
        return _resp(500, {"error": str(e)})
