"""
realufo — Python client for the RealUFO Public API v1.
Read-only, keyless. https://realufo.org/developers

    from realufo import RealUFO
    api = RealUFO()
    page = api.records(q="tic tac", per_page=5)
    print(page["meta"]["total"], page["data"][0]["id"])
"""

from __future__ import annotations

import hashlib
import hmac
import json
import urllib.parse
import urllib.request

__version__ = "1.0.0"
BASE = "https://realufo.org/api/v1"


class RealUFOError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


class RealUFO:
    """Thin wrapper over the RealUFO Public API v1."""

    def __init__(self, base: str = BASE, timeout: float = 30.0):
        self.base = base.rstrip("/")
        self.timeout = timeout

    # -- internals -----------------------------------------------------
    def _req(self, path: str, *, method: str = "GET", body=None, headers=None):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(
            self.base + path,
            data=data,
            method=method,
            headers={"Accept": "application/json", **(headers or {})},
        )
        if data:
            req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as res:
                payload = json.loads(res.read().decode())
        except urllib.error.HTTPError as e:
            try:
                payload = json.loads(e.read().decode())
            except Exception:
                payload = {}
            raise RealUFOError(e.code, payload.get("error", f"HTTP {e.code}"))
        if isinstance(payload, dict) and "error" in payload and "data" not in payload:
            raise RealUFOError(0, payload["error"])
        return payload.get("data", payload)

    def _paged(self, path: str, params: dict):
        qs = urllib.parse.urlencode({k: v for k, v in params.items() if v not in (None, "")})
        url = self.base + path + ("?" + qs if qs else "")
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as res:
                payload = json.loads(res.read().decode())
        except urllib.error.HTTPError as e:
            try:
                payload = json.loads(e.read().decode())
            except Exception:
                payload = {}
            raise RealUFOError(e.code, payload.get("error", f"HTTP {e.code}"))
        return {"data": payload.get("data", []), "meta": payload.get("meta", {})}

    # -- endpoints ------------------------------------------------------
    def records(self, **params):
        """Search and filter records. Params: q, archive, type, agency,
        location, year, decade, release, sort, has, page, per_page."""
        return self._paged("/records", params)

    def record(self, id: str):
        """One record, full detail."""
        return self._req("/records/" + urllib.parse.quote(id, safe=""))

    def text(self, id: str):
        """OCR full text pages of a record."""
        return self._req("/records/" + urllib.parse.quote(id, safe="") + "/text")

    def archives(self):
        """Filter facets: releases, kinds, agencies, decades, locations."""
        return self._req("/archives")

    def releases(self):
        """war.gov release list with file counts."""
        return self._req("/releases")

    def cases(self):
        """Case stories (slug + title)."""
        return self._req("/cases")

    def case(self, slug: str):
        """One case story with resolved sources."""
        return self._req("/cases/" + urllib.parse.quote(slug, safe=""))

    def shorts(self, **params):
        """Short clips. Params: q, page, per_page."""
        return self._paged("/shorts", params)

    def hubs(self):
        """Curated hubs."""
        return self._req("/hubs")

    def hub(self, kind: str, slug: str):
        """One hub with its records."""
        return self._req("/hubs/" + urllib.parse.quote(kind, safe="") + "/" + urllib.parse.quote(slug, safe=""))

    def webhook(self, url: str, events=("records.created", "release.created")):
        """Subscribe a URL to archive events. The secret is shown once."""
        return self._req("/webhooks", method="POST", body={"url": url, "events": list(events)})

    def delete_webhook(self, id: str, secret: str):
        """Delete a webhook subscription (needs the creation secret)."""
        return self._req(
            "/webhooks/" + urllib.parse.quote(id, safe=""),
            method="DELETE",
            headers={"X-Webhook-Secret": secret},
        )

    @staticmethod
    def verify_webhook(secret: str, body: bytes, signature: str) -> bool:
        """Verify an incoming webhook's HMAC-SHA256 signature."""
        mac = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
        return hmac.compare_digest(mac, signature.lower())
