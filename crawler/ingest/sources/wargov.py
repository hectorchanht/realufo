import csv, posixpath
from ..models import Candidate, R2_BASE, KIND_FROM_TYPE, MIME
from ..mapping import short_agency, derive_id

ARCHIVE_ROW = {"label": "War.gov · PURSUE", "flag": "🇺🇸", "accent": "#9184d9", "coord": "Washington, D.C."}

def _pdf_urls(link: str):
    base = posixpath.basename(link.split("?")[0])
    return (f"{R2_BASE}/pdfs/wargov/{base}",
            f"{R2_BASE}/pdf-thumbs/wargov/{posixpath.splitext(base)[0]}.jpg")

def candidates(csv_paths, dvids_map, taken):
    out, seen = [], set()
    for path in csv_paths:
        for r in csv.DictReader(open(path, encoding="utf-8-sig")):
            t = (r.get("Type") or "").strip()
            kind = KIND_FROM_TYPE.get(t)
            if not kind:
                continue                       # AUD / unknown -> skip
            title = (r.get("Title") or "").strip()
            link = (r.get("PDF | Image Link") or "").strip()
            if kind == "video":
                dod = dvids_map.get((r.get("DVIDS Video ID") or "").strip())
                if not dod:
                    continue                   # unresolved video -> skip
                cdn = f"{R2_BASE}/videos/wargov/DOD_{dod}.mp4"; thumb = ""; origin = cdn
            else:
                if not link:
                    continue
                if kind == "pdf":
                    cdn, thumb = _pdf_urls(link)
                else:
                    base = posixpath.basename(link.split("?")[0])
                    cdn = f"{R2_BASE}/images/wargov/{base}"; thumb = ""
                origin = link
            if cdn in seen:
                continue
            seen.add(cdn)
            rid = derive_id(title, "wargov", cdn, taken); taken.add(rid)
            c = Candidate(id=rid, archive="wargov", agency=short_agency(r.get("Agency"), "wargov"),
                          agency_full=(r.get("Agency") or "").strip(), title=title,
                          summary=(r.get("Description Blurb") or "").strip(),
                          incident_date=(r.get("Incident Date") or "").strip(),
                          location=(r.get("Incident Location") or "").strip(),
                          doc_date=(r.get("Release Date") or "").strip(), kind=kind,
                          redacted=1 if (r.get("Redaction") or "").strip() else 0,
                          virin=(r.get("Image VIRIN") or "").strip(), r2_key=cdn[len(R2_BASE) + 1:],
                          cdn_url=cdn, mime=MIME[kind], thumb_url=thumb)
            c._origin = origin
            out.append(c)
    return out


CSV_URLS = [
    ("https://www.war.gov/Portals/1/Interactive/2026/UFO/uap-data.csv", "uap-data.csv"),
    ("https://www.war.gov/Portals/1/Interactive/2026/UFO/uap-release001.csv", "uap-release001.csv"),
]

def refresh_csvs(dest_dir, fallback_paths):
    """Re-fetch the war.gov CSVs (curl_cffi) so brand-new releases surface as
    new rows. Falls back to the committed CSV for any URL that fails. Network
    wrapper — not unit-tested (like d1/r2 wrappers)."""
    import os, shutil
    from ..fetch import download
    out = []
    for url, name in CSV_URLS:
        dest = os.path.join(dest_dir, name)
        try:
            download(url, dest)
        except Exception:
            fb = next((p for p in fallback_paths if p.endswith(name)), None)
            if not (fb and os.path.exists(fb)):
                continue
            shutil.copy(fb, dest)
        out.append(dest)
    return out
