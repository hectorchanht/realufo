import posixpath, re, hashlib
from .models import R2_BASE

_AGENCY = {
    "CIA": "CIA", "FBI": "FBI", "NASA": "NASA", "AARO": "AARO", "NARA": "NARA",
    "Department of War": "DoW", "Department of Defense": "DoD", "Navy": "Navy",
}
_CODE = re.compile(r"^([A-Z0-9]{2,}(?:[-_][A-Z0-9]+){1,5})\b")

def short_agency(ag: str, slug: str) -> str:
    ag = (ag or "").split("/")[0].strip()
    return _AGENCY.get(ag, ag or slug.upper())

def is_r2_hosted(url: str) -> bool:
    return bool(url) and url.startswith(R2_BASE + "/")

def _stem(url: str) -> str:
    return posixpath.splitext(posixpath.basename(url.split("?")[0]))[0]

def derive_id(title: str, slug: str, url: str, taken: set) -> str:
    t = (title or "").strip().lstrip('"\'“” ')
    m = _CODE.match(t)
    cand = m.group(1).rstrip("-_,") if m else ""
    if cand and cand not in taken:
        return cand
    stem = f"{slug.upper()}-{_stem(url)}"[:64]
    if stem not in taken:
        return stem
    # Hash fallback: extend hash until we find one not in taken
    h_hex = hashlib.sha256(url.encode()).hexdigest()
    for i in range(8, len(h_hex) + 1):
        h = h_hex[:i]
        candidate = f"{slug.upper()}-{h}"
        if candidate not in taken:
            return candidate
    # Fallback: use full hash if needed (shouldn't reach here in practice)
    return f"{slug.upper()}-{h_hex}"
