"""Full text for doc pages (spec 2026-10-02-realufo-doc-fulltext-design).

    python3 -m ingest.fulltext --dry-run --limit 3   # extract + select only
    python3 -m ingest.fulltext                       # write D1 record_text rows

Every live PDF without a record_text row: download, pdftotext, keep the pages
that read like text (OCR noise dropped), cap at ~30k chars, store as JSON
pages. A PDF with no clean page still gets a row (pages='[]') so it isn't
retried daily; download/pdftotext failures get no row and are retried.
"""
import argparse, json, re, sys, tempfile
from . import d1
from .textindex import pdf_pages, flush

SELECT = """SELECT r.id,
  (SELECT cdn_url FROM assets a WHERE a.record_id=r.id AND a.role='full' LIMIT 1) AS url
FROM records r LEFT JOIN record_text rt ON rt.record_id=r.id
WHERE r.status='live' AND r.kind='pdf' AND rt.record_id IS NULL
  AND EXISTS (SELECT 1 FROM assets a WHERE a.record_id=r.id AND a.role='full')
ORDER BY r.created_at DESC, r.id"""
CAP = 30000
MIN_ALNUM = 200
MIN_RATIO = 0.65  # tuned 2026-10-02: <0.6 unreadable OCR, ~0.7 noisy but readable
FLUSH_EVERY = 25
WORD = re.compile(r"""^[("']?[A-Za-z][a-z]*(?:[-'][a-z]+)?[.,;:)"'?!]*$|^\d[\d,./-]*[.,;:]?$""")

def clean_page(text: str) -> str:
    t = re.sub(r"[ \t]+", " ", text)
    t = re.sub(r" *\n *", "\n", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()

def word_ratio(text: str) -> float:
    toks = text.split()
    return sum(bool(WORD.match(t)) for t in toks) / len(toks) if toks else 0.0

def keep_page(text: str) -> bool:
    return sum(c.isalnum() for c in text) >= MIN_ALNUM and word_ratio(text) >= MIN_RATIO

def _cut(text: str, room: int) -> str:
    # At most `room` chars, ending at a line break or sentence end ("" if neither fits).
    if len(text) <= room:
        return text
    head = text[:room]
    cut = max(head.rfind("\n"), head.rfind(". ") + 1)
    return head[:cut].rstrip() if cut > 0 else ""

def select_pages(pages: list[str], cap: int = CAP) -> tuple[list[dict], bool]:
    kept, total = [], 0
    for n, raw in enumerate(pages, 1):
        text = clean_page(raw)
        if not keep_page(text):
            continue
        piece = _cut(text, cap - total)
        if piece != text:
            if len(piece) >= MIN_ALNUM:
                kept.append({"n": n, "text": piece})
            return kept, True
        kept.append({"n": n, "text": text})
        total += len(text)
    return kept, False

def row_sql(rid: str, kept: list[dict], truncated: bool, total_pages: int) -> str:
    pages = json.dumps(kept, ensure_ascii=False)
    return ("INSERT OR REPLACE INTO record_text(record_id,pages,truncated,total_pages) VALUES("
            f"{d1.sql_q(rid)},{d1.sql_q(pages)},{int(truncated)},{int(total_pages)});")

def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="extract + select only; no D1 writes")
    ap.add_argument("--limit", type=int, default=None, help="max records this run")
    args = ap.parse_args(argv)
    rows = d1._d1_json(" ".join(SELECT.split()))[: args.limit]
    pending, ok, failed = [], 0, 0
    with tempfile.TemporaryDirectory() as work:
        for i, row in enumerate(rows, 1):
            try:
                pages = pdf_pages(row["url"], work)
            except Exception as e:
                failed += 1
                print(f"[{i}/{len(rows)}] FAIL {row['id']}: {e}")
                continue
            kept, truncated = select_pages(pages)
            ok += 1
            chars = sum(len(p["text"]) for p in kept)
            print(f"[{i}/{len(rows)}] ok   {row['id']} pages={len(kept)}/{len(pages)} chars={chars}"
                  f"{' truncated' if truncated else ''}")
            pending.append(row_sql(row["id"], kept, truncated, len(pages)))
            if not args.dry_run and len(pending) >= FLUSH_EVERY:
                flush(pending, work)
                pending = []
        if not args.dry_run and pending:
            flush(pending, work)
    print(f"{'dry-run ' if args.dry_run else ''}fulltext ok={ok} failed={failed}")
    sys.exit(1 if failed else 0)

if __name__ == "__main__":
    main()
