"""realufo Python SDK tests: urlopen is stubbed, so no network. stdlib unittest."""
import hashlib
import hmac
import io
import json
import sys
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from realufo import RealUFO, RealUFOError  # noqa: E402


class FakeResponse:
    def __init__(self, payload, status=200):
        self._body = json.dumps(payload).encode()
        self.status = status

    def read(self):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def make_urlopen(calls, payload, status=200):
    def fake(req, timeout=None):
        calls.append(req)
        if status >= 400:
            raise urllib.error.HTTPError(req.full_url, status, "err", {}, io.BytesIO(json.dumps(payload).encode()))
        return FakeResponse(payload, status)

    return fake


class ClientTest(unittest.TestCase):
    def test_records_builds_query(self):
        calls = []
        with patch.object(urllib.request, "urlopen", make_urlopen(calls, {"data": [{"id": "A"}], "meta": {"total": 1}})):
            r = RealUFO(base="https://x/api/v1").records(q="tic tac", page=2, per_page=5)
        self.assertIn("q=tic+tac", calls[0].full_url)
        self.assertIn("page=2", calls[0].full_url)
        self.assertEqual(r["data"][0]["id"], "A")
        self.assertEqual(r["meta"]["total"], 1)

    def test_record_encodes_id(self):
        calls = []
        with patch.object(urllib.request, "urlopen", make_urlopen(calls, {"data": {"id": "DOW-UAP-PR057a"}})):
            r = RealUFO(base="https://x/api/v1").record("DOW-UAP-PR057a")
        self.assertEqual(r["id"], "DOW-UAP-PR057a")
        self.assertEqual(calls[0].full_url, "https://x/api/v1/records/DOW-UAP-PR057a")

    def test_error_raises_with_status(self):
        with patch.object(urllib.request, "urlopen", make_urlopen([], {"error": "record not found"}, 404)):
            with self.assertRaises(RealUFOError) as cm:
                RealUFO(base="https://x/api/v1").record("NOPE")
        self.assertEqual(cm.exception.status, 404)
        self.assertIn("not found", str(cm.exception))

    def test_webhook_and_delete(self):
        calls = []
        with patch.object(urllib.request, "urlopen", make_urlopen(calls, {"data": {"id": "wh_1", "secret": "s"}})):
            RealUFO(base="https://x/api/v1").webhook("https://example.com/h", events=["release.created"])
        body = json.loads(calls[0].data.decode())
        self.assertEqual(body, {"url": "https://example.com/h", "events": ["release.created"]})
        self.assertEqual(calls[0].get_method(), "POST")

        calls.clear()
        with patch.object(urllib.request, "urlopen", make_urlopen(calls, {"data": {"deleted": True}})):
            RealUFO(base="https://x/api/v1").delete_webhook("wh_1", "s3cret")
        self.assertEqual(calls[0].get_header("X-webhook-secret"), "s3cret")
        self.assertEqual(calls[0].get_method(), "DELETE")

    def test_verify_webhook(self):
        body = b'{"event":"release.created"}'
        sig = hmac.new(b"testsecret", body, hashlib.sha256).hexdigest()
        self.assertTrue(RealUFO.verify_webhook("testsecret", body, sig))
        self.assertFalse(RealUFO.verify_webhook("testsecret", body, "0" * 64))


if __name__ == "__main__":
    unittest.main()
