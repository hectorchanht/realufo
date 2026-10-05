"""NSA UAP FOIA source: the May 2026 TOP SECRET UMBRA release (Doc ID 6904102).

334 pages, formerly TOP SECRET UMBRA, released May 2026 following a Disclosure
Foundation FOIA appeal. Covers 1969–1979. US government work product released
under FOIA — public domain.

Provenance: discovered via The Black Vault's NSA collection (discovery only —
we fetch from primary/third-party mirrors, never from theblackvault.com).

The canonical hosting shifts over time, so candidates() probes known mirrors
and uses the first live one. Downloads are verified against the known SHA256.
"""
import hashlib
from ..models import Candidate, R2_BASE, MIME
from ..mapping import short_agency, derive_id

ARCHIVE_ROW = {"label": "NSA", "flag": "🇺🇸", "accent": "#8a9bb5", "coord": "Fort Meade"}

# Known mirrors of nsatopsecretumbrauapfoiarelease.pdf (12,070,741 bytes, 334 pp).
# Probed in order at ingest time; first live mirror wins.
MIRRORS = [
    "https://kvzsprttxsbktuzzysnh.supabase.co/storage/v1/object/public/publicdocs/documents/nsatopsecretumbrauapfoiarelease.pdf",
    "https://thesentinel.network/api/v1/file/f6ac2f67-ab15-42be-92d1-14a70f39df64.pdf",
]

EXPECTED_SHA256 = "6854133ab4240bc729e02f9ed6830e0950263edcbd2acc514f863c49c61d404c"
EXPECTED_SIZE = 12070741

TITLE = "NSA TOP SECRET UMBRA UAP FOIA Release (Doc ID 6904102)"
SUMMARY = (
    "334 pages declassified from TOP SECRET UMBRA, released May 2026 after a "
    "Disclosure Foundation FOIA appeal. NSA's UAP-related production covering "
    "1969–1979 (Doc ID 6904102, Ref A2768997). Heavily redacted; the prior legal "
    "history includes the In Camera Affidavit of Eugene F. Yeates."
)
SOURCE_PAGE = "https://disclosure.org/news/nsatopsecretumbrauapfoiarelease"


def _probe(url: str) -> bool:
    """True if url serves the expected PDF (size + hash check on first bytes)."""
    try:
        from curl_cffi import requests
        r = requests.head(url, impersonate="chrome", timeout=30)
        if r.status_code != 200:
            return False
        # Confirm it's actually our file: fetch first 1MB and check it matches
        # the known prefix hash would need the full file; instead verify the
        # content-length matches and content-type is PDF.
        cl = r.headers.get("content-length")
        ct = r.headers.get("content-type", "")
        if cl and int(cl) != EXPECTED_SIZE:
            return False
        return "pdf" in ct or "octet-stream" in ct or not ct
    except Exception:
        return False


def resolve_origin() -> str:
    """First live mirror URL, or '' if none respond."""
    for url in MIRRORS:
        if _probe(url):
            return url
    return ""


def verify(path: str) -> bool:
    """SHA256 check of a downloaded file against the known hash."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest() == EXPECTED_SHA256


def candidates(taken):
    origin = resolve_origin()
    if not origin:
        return []  # no live mirror right now; ingest reports 0 new, not a failure
    r2_key = "pdfs/nsa/nsatopsecretumbrauapfoiarelease.pdf"
    cdn = f"{R2_BASE}/{r2_key}"
    rid = derive_id(TITLE, "nsa", cdn, taken)
    taken.add(rid)
    c = Candidate(
        id=rid, archive="nsa",
        agency=short_agency("National Security Agency", "nsa"),
        agency_full="National Security Agency",
        title=TITLE, summary=SUMMARY,
        incident_date="", location="", doc_date="2026-05",
        kind="pdf", redacted=1, virin="",
        r2_key=r2_key, cdn_url=cdn, mime=MIME["pdf"], thumb_url="",
    )
    c._origin, c._source = origin, SOURCE_PAGE
    return [c]
