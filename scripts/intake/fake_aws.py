"""Stand-ins for AWS storage (S3) and Lambda, kept in a local folder, so the intake-upload
function can be tested without AWS. Used only by the tests and lambda_proof.py; never packaged.

FakeS3 does what the function uses: listing, reading, writing (with "only if absent" and "only if
unchanged"), deleting, and one-time upload links (`receive_upload` plays the browser's part).
FakeLambda runs rebuild-dashboard (a stub by default, or the real code on the fake storage) and
queues the function's background jobs until `run_queued()`.
"""

import contextlib
import gzip
import hashlib
import io
import json
import os
import sys
import types
from datetime import datetime, timezone


class FakeClientError(Exception):
    def __init__(self, code, message=""):
        super().__init__(f"{code}: {message}")
        self.response = {"Error": {"Code": code, "Message": message}}


class FakeS3:
    def __init__(self, root):
        self.root = root
        self.deleted = []

    def _path(self, bucket, key):
        if ".." in key.split("/"):
            raise FakeClientError("InvalidKey", key)
        return os.path.join(self.root, bucket, *key.split("/"))

    @staticmethod
    def _etag(data):
        return '"' + hashlib.md5(data).hexdigest() + '"'

    def get_paginator(self, name):
        assert name == "list_objects_v2"
        s3 = self

        class Paginator:
            def paginate(self, Bucket, Prefix=""):
                return [{"Contents": [{"Key": k, "LastModified": s3._modified(Bucket, k)} for k in s3.list_keys(Bucket, Prefix)]}]

        return Paginator()

    def _modified(self, bucket, key):
        return datetime.fromtimestamp(os.path.getmtime(self._path(bucket, key)), timezone.utc)

    def list_keys(self, bucket, prefix=""):
        base = os.path.join(self.root, bucket)
        keys = []
        for folder, _, names in os.walk(base):
            for name in names:
                key = os.path.relpath(os.path.join(folder, name), base).replace(os.sep, "/")
                if key.startswith(prefix):
                    keys.append(key)
        return sorted(keys)

    def read(self, bucket, key):
        with open(self._path(bucket, key), "rb") as fh:
            return fh.read()

    def write(self, bucket, key, data):
        path = self._path(bucket, key)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as fh:
            fh.write(data)

    def get_object(self, Bucket, Key, **_):
        path = self._path(Bucket, Key)
        if not os.path.isfile(path):
            raise FakeClientError("NoSuchKey", Key)
        data = self.read(Bucket, Key)
        return {"Body": io.BytesIO(data), "ETag": self._etag(data), "LastModified": self._modified(Bucket, Key)}

    def put_object(self, Bucket, Key, Body, IfNoneMatch=None, IfMatch=None, **_):
        data = Body if isinstance(Body, bytes) else Body.encode()
        path = self._path(Bucket, Key)
        if IfNoneMatch == "*" and os.path.isfile(path):
            raise FakeClientError("PreconditionFailed", Key)
        if IfMatch is not None and (not os.path.isfile(path) or self._etag(self.read(Bucket, Key)) != IfMatch):
            raise FakeClientError("PreconditionFailed", Key)
        self.write(Bucket, Key, data)
        return {"ETag": self._etag(data)}

    def delete_object(self, Bucket, Key):
        self.deleted.append(Key)
        path = self._path(Bucket, Key)
        if os.path.isfile(path):
            os.remove(path)

    def generate_presigned_post(self, Bucket, Key, Fields=None, Conditions=None, ExpiresIn=None):
        return {"url": "https://upload.example.invalid/", "fields": {**(Fields or {}), "key": Key, "bucket": Bucket,
                                                                      "conditions": json.dumps(Conditions)}}

    def receive_upload(self, link, data):
        """What the browser does with an upload link (checks the size rule like S3 does)."""
        fields = link["fields"]
        for rule in json.loads(fields["conditions"]):
            if isinstance(rule, list) and rule[0] == "content-length-range" and not rule[1] <= len(data) <= rule[2]:
                raise FakeClientError("EntityTooLarge")
        self.write(fields["bucket"], fields["key"], data)


class FakeLambda:
    """rebuild-dashboard: `mode` "stub" (records the call; `fail` (a message, or a list with one
    message or None per call) or `warnings` make it fail or warn), or "real" (the real rebuild-dashboard code, reading and writing the fake storage)."""

    def __init__(self, s3, rebuild_name, self_name, mode="stub"):
        self.s3 = s3
        self.rebuild_name = rebuild_name
        self.self_name = self_name
        self.mode = mode
        self.fail = None
        self.warnings = []
        self.rebuilds = []
        self.queued = []

    def invoke(self, FunctionName, InvocationType="RequestResponse", Payload=b"{}"):
        if FunctionName == self.self_name and InvocationType == "Event":
            self.queued.append(json.loads(Payload))
            return {"StatusCode": 202}
        assert FunctionName == self.rebuild_name, FunctionName
        from lambda_bridge import lambda_module

        L = lambda_module()
        raw = {k: self.s3.read(L.BUCKET, k) for k in self.s3.list_keys(L.BUCKET, L.RAW_PREFIX)}
        self.rebuilds.append(raw)
        if self.mode == "real":
            return self._real(L)
        fail = self.fail.pop(0) if isinstance(self.fail, list) and self.fail else self.fail
        if isinstance(fail, str):
            return {"FunctionError": "Unhandled", "Payload": io.BytesIO(json.dumps({"errorMessage": fail}).encode())}
        summary = {"ok": True, "postsMonthly": "stub", "warnings": list(self.warnings)}
        return {"StatusCode": 200, "Payload": io.BytesIO(json.dumps(summary).encode())}

    def _real(self, L):
        fake_boto3 = types.ModuleType("boto3")
        fake_boto3.client = lambda name, **_: self.s3
        saved = sys.modules.get("boto3")
        sys.modules["boto3"] = fake_boto3
        try:
            with contextlib.redirect_stdout(io.StringIO()):  # it prints its summary, as in AWS logs
                summary = L.lambda_handler({}, None)
            return {"StatusCode": 200, "Payload": io.BytesIO(json.dumps(summary).encode())}
        except Exception as error:  # noqa: BLE001 (as Lambda reports a failed run)
            return {"FunctionError": "Unhandled", "Payload": io.BytesIO(json.dumps({"errorMessage": str(error)}).encode())}
        finally:
            if saved is None:
                del sys.modules["boto3"]
            else:
                sys.modules["boto3"] = saved

    def snapshot(self):
        from lambda_bridge import lambda_module

        L = lambda_module()
        return json.loads(gzip.decompress(self.s3.read(L.BUCKET, L.SNAPSHOT_KEY)))

    def run_queued(self, handler):
        while self.queued:
            handler.lambda_handler(self.queued.pop(0), None)
