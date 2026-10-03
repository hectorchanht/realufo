"""Re-OCR scanned PDF pages with PaddleOCR (spec 2026-10-03-realufo-paddleocr-reocr-design).

    python -m ingest.ocr --dry-run --limit 3      # OCR + print stats, no writes
    python -m ingest.ocr --ids A,B                # only these records
    python -m ingest.ocr                          # every live PDF without a record_ocr row

Pages whose pdftotext layer already reads as text keep it (src "pdf"); the rest
are rendered with pdftoppm and OCR'd (src "ocr"). All pages, uncapped, go to R2
text/<id>.json, then D1 gets a record_ocr marker. When any page was OCR'd, the
record's record_text row is deleted and its text_index row marked failed, so
fulltext / summaries / tldr / cards / textindex rebuild it from the new text.
Needs Paddle (crawler/.venv-ocr or requirements-ocr.txt); nothing else does.
"""
from . import d1
from .fulltext import clean_page, keep_page

def lines_from_boxes(items) -> str:
    """[(text, (x1, y1, x2, y2))] -> lines top-to-bottom, boxes left-to-right in a line."""
    lines = []  # [y_center, height, [(x1, text)]]
    for text, (x1, y1, x2, y2) in sorted(items, key=lambda it: (it[1][1] + it[1][3]) / 2):
        yc, h = (y1 + y2) / 2, y2 - y1
        if lines and abs(yc - lines[-1][0]) <= max(h, lines[-1][1]) / 2:
            lines[-1][2].append((x1, text))
        else:
            lines.append([yc, h, [(x1, text)]])
    return "\n".join(" ".join(t for _, t in sorted(words)) for _, _, words in lines)

def route_pages(texts: list[str], page_count: int, ocr_page) -> list[dict]:
    """Pages 1..page_count: clean text layer kept, else ocr_page(n) -> (text, conf)."""
    out = []
    for n in range(1, page_count + 1):
        text = clean_page(texts[n - 1]) if n <= len(texts) else ""
        if keep_page(text):
            out.append({"n": n, "text": text, "src": "pdf"})
            continue
        try:
            t, conf = ocr_page(n)
            out.append({"n": n, "text": t, "src": "ocr", "conf": round(conf, 2)})
        except Exception as e:
            print(f"  page {n}: {e}", flush=True)
            out.append({"n": n, "text": "", "src": "err"})
    return out

def marker_sql(rid: str, pages: list[dict], engine: str) -> str:
    q = d1.sql_q(rid)
    ocr_pages = sum(p["src"] == "ocr" for p in pages)
    chars = sum(len(p["text"]) for p in pages)
    sql = [f"INSERT OR REPLACE INTO record_ocr(record_id,pages,ocr_pages,chars,engine) "
           f"VALUES({q},{len(pages)},{ocr_pages},{chars},{d1.sql_q(engine)});"]
    if ocr_pages:  # text changed: rebuild record_text (+FTS, summary, TL;DR) and the Ask vectors
        sql += [f"DELETE FROM record_text WHERE record_id={q};",
                f"UPDATE text_index SET status='failed' WHERE record_id={q};"]
    return "\n".join(sql) + "\n"
