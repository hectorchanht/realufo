"""NARA Catalog API source: UFO/UAP holdings (Blue Book photos/films, etc.).

Uses the NARA Catalog API v2 (https://catalog.archives.gov/api/v2/), no key
required for reads per NARA docs. Discovered via The Black Vault's Blue Book
collection (discovery only — we fetch from NARA directly).

NOTE (2026-10-05): the API returned the catalog SPA HTML instead of JSON from
our dev VM (likely WAF/bot-protection on that IP). This module probes the API
at ingest time and degrades gracefully — the GitHub Actions runner (different
egress IP) may not be blocked. If the probe fails, candidates() returns [] and
ingest reports 0 new, not an error.

If the block persists, request a free API key from Catalog_API@nara.gov or use
the bulk S3 dump (s3://nara-national-archives-catalog/).
"""
from ..models import Candidate, R2_BASE, MIME
from ..mapping import short_agency, derive_id

ARCHIVE_ROW = {"label": "NARA", "flag": "🇺🇸", "accent": "#4df0a6", "coord": "National Archives"}

API_BASE = "https://catalog.archives.gov/api/v2"

# UFO-relevant NARA queries. Blue Book textual records overlap the existing
# topic hub; the digitized photos/films (e.g. RG 341) are the novelty.
QUERIES = [
    # Project Blue Book digitized photos
    {"q": "Project Blue Book photograph", "level": "item"},
    # UFO / UAP keyword across the catalog, items with online objects only
    {"q": "UFO", "online": "true"},
    {"q": "unidentified flying object", "online": "true"},
]


def _api_ok() -> bool:
    """Probe: does the NARA API return JSON from here?"""
    try:
        from curl_cffi import requests
        r = requests.get(f"{API_BASE}/records/search",
                         params={"q": "test", "limit": 1},
                         impersonate="chrome", timeout=30)
        ct = r.headers.get("content-type", "")
        return r.status_code == 200 and "json" in ct
    except Exception:
        return False


def _search(params: dict, limit: int = 50):
    """Yield raw record dicts from the NARA API."""
    from curl_cffi import requests
    page, seen = 1, 0
    while seen < limit:
        r = requests.get(f"{API_BASE}/records/search",
                         params={**params, "limit": min(50, limit - seen), "page": page},
                         impersonate="chrome", timeout=60)
        r.raise_for_status()
        body = r.json()
        hits = ((body.get("body") or {}).get("hits") or {}).get("hits", [])
        if not hits:
            break
        for h in hits:
            yield h.get("_source") or {}
            seen += 1
        page += 1


def _objects(rec: dict):
    """Online object URLs (images/films) from a record."""
    for obj in rec.get("objects") or []:
        # NARA object file URLs
        for f in obj.get("file") or []:
            url = (f.get("@url") or f.get("url") or "").strip()
            if url:
                yield url, (f.get("mime") or "")


def candidates(taken, limit: int = 200):
    if not _api_ok():
        return []  # API blocked from this network; ingest reports 0 new
    out = []
    for q in QUERIES:
        for rec in _search(q, limit=limit // len(QUERIES)):
            na_id = str(rec.get("naId") or rec.get("id") or "")
            title = (rec.get("title") or "").strip()
            if not na_id or not title:
                continue
            for url, mime in _objects(rec):
                kind = "image" if mime.startswith("image") else None
                if not kind and url.lower().endswith((".jpg", ".jpeg", ".png", ".tif", ".tiff")):
                    kind = "image"
                if not kind:
                    continue  # timeline item 1: photos/films first; PDFs later
                base = url.split("?")[0].rsplit("/", 1)[-1]
                r2_key = f"images/nara/{na_id}_{base}"
                cdn = f"{R2_BASE}/{r2_key}"
                if cdn in taken:
                    continue
                rid = derive_id(title, "nara", cdn, taken)
                taken.add(rid)
                c = Candidate(
                    id=rid, archive="nara",
                    agency=short_agency("NARA", "nara"), agency_full="National Archives and Records Administration",
                    title=title,
                    summary=(rec.get("scopeAndContentNote") or rec.get("description") or "").strip()[:500],
                    incident_date="", location="",
                    doc_date=str(rec.get("creationDate") or "")[:10],
                    kind=kind, redacted=0, virin="",
                    r2_key=r2_key, cdn_url=cdn, mime=MIME[kind], thumb_url="",
                )
                c._origin = url
                c._source = f"https://catalog.archives.gov/id/{na_id}"
                out.append(c)
    return out
