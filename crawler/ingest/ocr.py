"""Re-OCR scanned PDF pages with PaddleOCR (spec 2026-10-03-realufo-paddleocr-reocr-design).

    python -m ingest.ocr --dry-run --limit 3      # OCR + print stats, no writes
    python -m ingest.ocr --ids A,B                # only these records
    python -m ingest.ocr                          # every live PDF without a record_ocr row
    python -m ingest.ocr --fts-only               # rewrite search rows of OCR'd files from R2
    python -m ingest.ocr --shard 0/8              # one of 8 parallel workers (Paddle uses one core)

Pages whose pdftotext layer already reads as text keep it (src "pdf"), unless the
page has redaction bars: those text layers drop whole lines beside the bars
(DOW-UAP-D091 p.2), so they are OCR'd like the rest (src "ocr", rendered with
pdftoppm), which reads exactly what is visible. All pages, uncapped, go to R2
text/<id>.json, then D1 gets a record_ocr marker. When any page was OCR'd, the
record's record_text row is deleted and its text_index row marked failed, so
fulltext / summaries / tldr / cards / textindex rebuild it from the new text.
Needs Paddle (crawler/.venv-ocr or requirements-ocr.txt); nothing else does.
"""
import argparse, json, os, re, subprocess, sys, tempfile, time
from . import d1, fetch, r2
from .chunking import split_pages
from .fulltext import clean_page, keep_page
from .textindex import pdf_pages

SELECT = """SELECT r.id,
  (SELECT cdn_url FROM assets a WHERE a.record_id=r.id AND a.role='full' LIMIT 1) AS url
FROM records r LEFT JOIN record_ocr o ON o.record_id=r.id
WHERE r.status='live' AND r.kind='pdf' AND o.record_id IS NULL
  AND EXISTS (SELECT 1 FROM assets a WHERE a.record_id=r.id AND a.role='full'){ids}
ORDER BY r.created_at DESC, r.id"""
DET, REC, DPI = "PP-OCRv5_mobile_det", "en_PP-OCRv5_mobile_rec", 200  # docs/launch/ocr-bench.md: same text as server det, 3.6x faster
SCORE_MIN = 0.5  # Paddle drops boxes recognised below this, so garbage never becomes text
ENGINE = f"PP-OCRv5:{DET}+{REC}@{DPI}"

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

BAR_DPI = 50  # enough to see a redaction bar; text at this size never fills a solid box

def redaction_bars(png: str) -> int:
    """Solid black boxes on a page render: dark blobs >= 0.2% of the page that fill >= 90% of their bbox."""
    import cv2  # lazy: Paddle's venv has it
    g = cv2.imread(png, cv2.IMREAD_GRAYSCALE)
    _, _, stats, _ = cv2.connectedComponentsWithStats((g < 60).astype("uint8"))
    big = g.shape[0] * g.shape[1] * 0.002
    return sum(1 for _, _, w, h, a in stats[1:] if a >= big and a >= 0.9 * w * h)

def route_pages(texts: list[str], page_count: int, ocr_page, redacted=lambda n: False) -> list[dict]:
    """Pages 1..page_count: clean text layer kept unless redacted(n), else ocr_page(n) -> (text, conf)."""
    out = []
    for n in range(1, page_count + 1):
        text = clean_page(texts[n - 1]) if n <= len(texts) else ""
        if keep_page(text) and not redacted(n):
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
    if ocr_pages:  # text changed: rebuild record_text (summary, TL;DR) and the Ask vectors
        sql += [f"DELETE FROM record_text WHERE record_id={q};",
                f"UPDATE text_index SET status='failed' WHERE record_id={q};"]
    else:  # same text, but a capped record_text summary only saw ~30k chars: redo it over every page
        sql.append(f"UPDATE record_text SET ai_summary=NULL, ai_sections=NULL WHERE record_id={q} AND truncated=1;")
    return "\n".join(sql) + "\n" + fts_sql(rid, pages)

FTS_CAP = 90000  # chars; real pages are far smaller
FTS_MAX_BYTES = 95000  # the quoted body as UTF-8: one D1 statement is capped near 100 KB (SQLITE_TOOBIG)

def _fit(text: str) -> str:
    t = text[:FTS_CAP]
    while len(d1.sql_q(t).encode()) > FTS_MAX_BYTES:  # non-ASCII and doubled quotes grow it
        t = t[: int(len(t) * 0.9)]
    return t

def fts_sql(rid: str, pages: list[dict]) -> str:
    """Search rows for every non-empty page (record_text's triggers skip OCR'd files, migration 0037)."""
    q = d1.sql_q(rid)
    rows = [f"INSERT INTO record_fts(record_id,page,body) VALUES({q},{int(p['n'])},{d1.sql_q(_fit(p['text']))});"
            for p in pages if p["text"].strip()]
    return "\n".join([f"DELETE FROM record_fts WHERE record_id={q};", *rows]) + "\n"

SELECT_MARKED = """SELECT r.id,
  (SELECT cdn_url FROM assets a WHERE a.record_id=r.id AND a.role='full' LIMIT 1) AS url, 1 AS ocr
FROM records r JOIN record_ocr o ON o.record_id=r.id WHERE r.status='live'{ids} ORDER BY r.id"""

def fts_only(ids: list[str], limit, dry_run: bool) -> int:
    where = f" AND r.id IN ({','.join(d1.sql_q(i) for i in ids)})" if ids else ""
    rows = d1._d1_json(" ".join(SELECT_MARKED.format(ids=where).split()))[:limit]
    failed = 0
    with tempfile.TemporaryDirectory() as work:
        for i, row in enumerate(rows, 1):
            try:
                pages = [{"n": n, "text": t} for n, t in enumerate(pdf_pages(row["url"], work, row["id"]), 1)]
                path = os.path.join(work, "fts.sql")
                with open(path, "w", encoding="utf-8") as f:
                    f.write(fts_sql(row["id"], pages))
                if not dry_run:
                    d1.apply_sql(path)
                print(f"[{i}/{len(rows)}] fts  {row['id']} pages={len(pages)}", flush=True)
            except Exception as e:
                failed += 1
                print(f"[{i}/{len(rows)}] FAIL {row['id']}: {e}", flush=True)
    print(f"{'dry-run ' if dry_run else ''}fts-only ok={len(rows) - failed} failed={failed}")
    return 1 if failed else 0

def page_count(pdf: str) -> int:
    out = subprocess.run(["pdfinfo", pdf], capture_output=True, text=True, check=True).stdout
    m = re.search(r"^Pages:\s+(\d+)", out, re.M)
    if not m:
        raise RuntimeError("pdfinfo: no page count")
    return int(m.group(1))

def pdftotext_pages(pdf: str) -> list[str]:
    out = subprocess.run(["pdftotext", "-enc", "UTF-8", pdf, "-"],
                         capture_output=True, text=True, check=True).stdout
    return split_pages(out)

def render(pdf: str, n: int, dpi: int, work: str) -> str:
    base = os.path.join(work, "page")
    subprocess.run(["pdftoppm", "-r", str(dpi), "-f", str(n), "-l", str(n), "-png", "-singlefile", pdf, base],
                   capture_output=True, check=True)
    return base + ".png"

def paddle_engine(det: str = DET, rec: str = REC):
    from paddleocr import PaddleOCR  # lazy: only the OCR venv / GHA ocr step installs Paddle
    model = PaddleOCR(text_detection_model_name=det, text_recognition_model_name=rec,
                      use_doc_orientation_classify=True, use_doc_unwarping=False,
                      use_textline_orientation=False, text_rec_score_thresh=SCORE_MIN)
    def run(png: str) -> tuple[str, float]:
        r = model.predict(png)[0]
        scores = [float(s) for s in r["rec_scores"]]
        items = [(t, tuple(float(v) for v in b)) for t, b in zip(r["rec_texts"], r["rec_boxes"])]
        return lines_from_boxes(items), (sum(scores) / len(scores) if scores else 0.0)
    return run

def ocr_record(row: dict, engine, work: str, dpi: int = DPI) -> list[dict]:
    pdf = os.path.join(work, "src.pdf")
    fetch.download(row["url"], pdf)
    try:
        return route_pages(pdftotext_pages(pdf), page_count(pdf),
                           lambda n: engine(render(pdf, n, dpi, work)),
                           lambda n: redaction_bars(render(pdf, n, BAR_DPI, work)) > 0)
    finally:
        os.remove(pdf)

def put_text(rid: str, pages: list[dict], work: str) -> None:
    path = os.path.join(work, "text.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(pages, f, ensure_ascii=False)
    r2.put(f"text/{rid}.json", path, "application/json; charset=utf-8")

BENCH = [("PP-OCRv5_mobile_det", "en_PP-OCRv5_mobile_rec"),
         ("PP-OCRv5_server_det", "en_PP-OCRv5_mobile_rec")]
BENCH_DPI = (200, 300)
SNIP = 400

def _readable(t: str) -> bool:
    return keep_page(clean_page(t))

def bench_report(samples, results, today: str) -> str:
    """samples [(id, page, pdftotext text)]; results {(det, rec, dpi): [(text, secs)] per sample}."""
    n = len(samples)
    rows = [f"| pdftotext (today) | – | {sum(_readable(old) for _, _, old in samples)}/{n} |"]
    for (det, rec, dpi), res in results.items():
        rows.append(f"| {det} + {rec} @{dpi} | {sum(s for _, s in res) / n:.1f} | "
                    f"{sum(_readable(t) for t, _ in res)}/{n} |")
    out = [f"# PaddleOCR benchmark ({today})", "",
           f"{n} pages that fail `keep_page` today, from {len({s[0] for s in samples})} files. "
           "Readable = passes `fulltext.keep_page`.", "",
           "| config | s/page | readable |", "|---|---|---|", *rows, ""]
    for i, (rid, page, old) in enumerate(samples):
        out += [f"## {rid} p.{page}", "", "**pdftotext:**", "```", old[:SNIP], "```"]
        for (det, rec, dpi), res in results.items():
            out += [f"**{det} + {rec} @{dpi}:**", "```", res[i][0][:SNIP], "```"]
        out.append("")
    return "\n".join(out)

def bench(rows, per_file: int, out_path: str) -> None:
    samples, pdfs = [], []
    with tempfile.TemporaryDirectory() as work:
        for k, row in enumerate(rows):
            pdf = os.path.join(work, f"{k}.pdf")
            fetch.download(row["url"], pdf)
            texts, count = pdftotext_pages(pdf), page_count(pdf)
            old = [clean_page(texts[n - 1]) if n <= len(texts) else "" for n in range(1, count + 1)]
            for n in [n for n in range(1, count + 1) if not keep_page(old[n - 1])][:per_file]:
                samples.append((row["id"], n, old[n - 1]))
                pdfs.append(pdf)
        results = {}
        for det, rec in BENCH:
            engine = paddle_engine(det, rec)
            for dpi in BENCH_DPI:
                res = []
                for (rid, n, _), pdf in zip(samples, pdfs):
                    t0 = time.time()
                    text, _ = engine(render(pdf, n, dpi, work))
                    res.append((text, time.time() - t0))
                    print(f"{det}+{rec}@{dpi} {rid} p.{n} {res[-1][1]:.1f}s", flush=True)
                results[(det, rec, dpi)] = res
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(bench_report(samples, results, time.strftime("%Y-%m-%d")))
    print(f"wrote {out_path}")

def select_rows(ids: list[str], limit):
    where = f" AND r.id IN ({','.join(d1.sql_q(i) for i in ids)})" if ids else ""
    return d1._d1_json(" ".join(SELECT.format(ids=where).split()))[:limit]

def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="OCR + print stats; no R2/D1 writes")
    ap.add_argument("--limit", type=int, default=None, help="max records this run")
    ap.add_argument("--ids", default=None, help="comma-separated record ids")
    ap.add_argument("--shard", default=None, help="I/N: every Nth record from I (start all N together)")
    ap.add_argument("--fts-only", action="store_true", help="rewrite search rows of OCR'd files from R2; no OCR")
    ap.add_argument("--bench", action="store_true", help="time model/dpi variants on failing pages of --ids")
    ap.add_argument("--bench-pages", type=int, default=3, help="--bench: failing pages per file")
    ap.add_argument("--out", default="../docs/launch/ocr-bench.md", help="--bench report path")
    args = ap.parse_args(argv)
    if args.fts_only:
        sys.exit(fts_only([i for i in (args.ids or "").split(",") if i], args.limit, args.dry_run))
    rows = select_rows([i for i in (args.ids or "").split(",") if i], args.limit)
    if args.bench:
        bench(rows, args.bench_pages, args.out)
        sys.exit(0)
    if args.shard:
        # Round-robin over the shared, ordered work list: balanced on every (re)start.
        # Start all N workers together, so they all see the same list.
        i, n = map(int, args.shard.split("/"))
        rows = rows[i::n]
    engine = paddle_engine() if rows else None
    ok = failed = 0
    with tempfile.TemporaryDirectory() as work:
        for i, row in enumerate(rows, 1):
            t0 = time.time()
            try:
                pages = ocr_record(row, engine, work)
                if not args.dry_run:
                    put_text(row["id"], pages, work)  # before the marker: a crash in between means a retry
                    path = os.path.join(work, "ocr.sql")
                    with open(path, "w", encoding="utf-8") as f:
                        f.write(marker_sql(row["id"], pages, ENGINE))
                    d1.apply_sql(path)
            except Exception as e:
                failed += 1
                print(f"[{i}/{len(rows)}] FAIL {row['id']}: {e}", flush=True)
                continue
            ok += 1
            print(f"[{i}/{len(rows)}] ok   {row['id']} pages={len(pages)} "
                  f"ocr={sum(p['src'] == 'ocr' for p in pages)} err={sum(p['src'] == 'err' for p in pages)} "
                  f"chars={sum(len(p['text']) for p in pages)} {time.time() - t0:.0f}s", flush=True)
    print(f"{'dry-run ' if args.dry_run else ''}ocr ok={ok} failed={failed}")
    sys.exit(1 if failed else 0)

if __name__ == "__main__":
    main()
