"""Pure text -> chunk helpers for the Ask index (no I/O).

pdftotext output is split into pages on form feeds, each page into ~CHUNK-char
chunks with OVERLAP chars of overlap, breaking at a line or sentence end.
Chunks that are mostly OCR noise are dropped.
"""
import hashlib, re

CHUNK = 1500
OVERLAP = 200
MIN_ALNUM = 100

def vector_id(record_id: str, seq: int) -> str:
    # Vectorize ids are capped at 64 bytes; some record ids are ~60 chars.
    return f"{hashlib.sha1(record_id.encode()).hexdigest()[:12]}-{seq}"

def split_pages(text: str) -> list[str]:
    pages = text.split("\f")
    if pages and not pages[-1].strip():
        pages.pop()
    return pages

def _norm(s: str) -> str:
    s = re.sub(r"\n\s*\n+", "\n", s)
    return re.sub(r"[ \t]+", " ", s).strip()

def _alnum(s: str) -> int:
    return sum(c.isalnum() for c in s)

def chunk_page(text: str) -> list[str]:
    t = _norm(text)
    out, start = [], 0
    while start < len(t):
        end = min(len(t), start + CHUNK)
        if end < len(t):
            floor = start + CHUNK // 2
            cut = max(t.rfind("\n", floor, end), t.rfind(". ", floor, end))
            if cut > start:
                end = cut + 1
        piece = t[start:end].strip()
        if _alnum(piece) >= MIN_ALNUM:
            out.append(piece)
        if end >= len(t):
            break
        start = max(end - OVERLAP, start + 1)
    return out

def card_text(r: dict) -> str:
    meta = " · ".join(x for x in (r.get("agency"), r.get("incident_date"), r.get("location")) if x)
    head = f"{r['title']} — {meta}" if meta else r["title"]
    return f"{head}\n{r['summary']}" if r.get("summary") else head

def chunks_for(r: dict, pages: list[str]) -> list[dict]:
    out = [{"page": 0, "text": card_text(r)}]
    for n, page in enumerate(pages, 1):
        out += [{"page": n, "text": f"{r['title']} — p.{n}\n{c}"} for c in chunk_page(page)]
    return [{"id": vector_id(r["id"], i), **c} for i, c in enumerate(out)]
