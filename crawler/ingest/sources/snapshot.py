import glob, json, os
from ..models import Candidate, R2_BASE, KIND_FROM_TYPE, MIME
from ..mapping import short_agency, derive_id, is_r2_hosted

ARCHIVE_ROWS = {
    "aaro": {"label": "AARO", "flag": "🇺🇸", "accent": "#6ea8ff", "coord": "Pentagon"},
    "nasa": {"label": "NASA", "flag": "🇺🇸", "accent": "#46dfff", "coord": "NASA HQ"},
    "nara": {"label": "NARA", "flag": "🇺🇸", "accent": "#4df0a6", "coord": "National Archives"},
    "congress": {"label": "Congress", "flag": "🇺🇸", "accent": "#f2b84b", "coord": "U.S. Capitol"},
    # DoD FOIA reading-room PDFs the case stories cite (Roswell report, GAO letter, DIA/USAF Tehran files)
    "dod": {"label": "DoD FOIA", "flag": "🇺🇸", "accent": "#ff8a7a", "coord": "Pentagon"},
    # Library and Archives Canada NRC UFO files (non-commercial reuse, attribution in each summary)
    "canada": {"label": "Library and Archives Canada", "flag": "🇨🇦", "accent": "#ff6b6b", "coord": "Ottawa"},
}

def _load(slug, data_dir):
    assets = []
    files = [os.path.join(data_dir, f"{slug}.json")] + sorted(glob.glob(os.path.join(data_dir, f"{slug}-shard-*.json")))
    for f in files:
        if os.path.exists(f):
            assets += json.load(open(f))["v1"].get("assets", [])
    return assets

def candidates(slug, data_dir, taken):
    out, seen = [], set()
    for a in _load(slug, data_dir):
        kind = KIND_FROM_TYPE.get((a.get("t") or "").strip())
        u = (a.get("u") or a.get("l") or "").strip()
        if not kind or not is_r2_hosted(u) or u in seen:
            continue
        seen.add(u)
        th = (a.get("th") or "").strip()
        rid = derive_id((a.get("ti") or "").strip(), slug, u, taken); taken.add(rid)
        # no `date` fallback for incident_date: an undated file is a report/law/hearing, and its
        # publication date sorted it as a 2023 "incident" (sort=old/recent).
        c = Candidate(id=rid, archive=slug, agency=short_agency(a.get("ag"), slug),
                      agency_full=(a.get("ag") or "").strip(), title=(a.get("ti") or "").strip(),
                      summary=(a.get("de") or "").strip(), incident_date=(a.get("idate") or "").strip(),
                      location=(a.get("region") or "").strip(), doc_date=(a.get("date") or "").strip(),
                      kind=kind, redacted=0, virin="", r2_key=u[len(R2_BASE) + 1:], cdn_url=u,
                      mime=MIME[kind], thumb_url=th if is_r2_hosted(th) else "")
        c._origin = u
        # the official page/file it was mirrored from, and its licence when not US-gov public domain
        c._source = (a.get("s") or "").strip()
        c._license = (a.get("lic") or "").strip()
        out.append(c)
    return out
