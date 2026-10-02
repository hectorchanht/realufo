"""Ask-the-Archive indexer: embed every live record into Vectorize.

    python3 -m ingest.textindex --dry-run --limit 2   # extract + chunk only, no writes
    python3 -m ingest.textindex                       # embed + upsert + D1 status rows

Each record gets a card chunk (title/agency/date/location/summary); PDFs add
their page text. Progress is tracked in D1 `text_index`, written after the
vectors, so a crash means a retry. `failed` records are cleaned up (vectors
deleted, row removed) at the start of the next live run and retried.
"""
import argparse, os, subprocess, sys, tempfile
from . import cfapi, chunking, d1, fetch

SELECT = """SELECT r.id, r.kind, r.title, r.agency, r.incident_date, r.location, r.summary,
  (SELECT cdn_url FROM assets a WHERE a.record_id=r.id AND a.role='full' LIMIT 1) AS url
FROM records r LEFT JOIN text_index ti ON ti.record_id=r.id
WHERE r.status='live' AND ti.record_id IS NULL
ORDER BY r.created_at DESC, r.id"""
FAILED = "SELECT record_id, chunks FROM text_index WHERE status='failed'"
FLUSH_EVERY = 25

def pdf_pages(url: str, work: str) -> list[str]:
    pdf = os.path.join(work, "src.pdf")
    try:
        fetch.download(url, pdf)
        out = subprocess.run(["pdftotext", "-enc", "UTF-8", pdf, "-"],
                             capture_output=True, text=True, check=True).stdout
    finally:
        if os.path.exists(pdf):
            os.remove(pdf)
    return chunking.split_pages(out)

def status_sql(rid: str, status: str, chunks: int, chars: int) -> str:
    return ("INSERT OR REPLACE INTO text_index(record_id,status,chunks,chars,indexed_at) VALUES("
            f"{d1.sql_q(rid)},'{status}',{int(chunks)},{int(chars)},datetime('now'));")

def retry_failed() -> None:
    rows = d1._d1_json(FAILED)
    ids = [chunking.vector_id(r["record_id"], i) for r in rows for i in range(int(r["chunks"]))]
    if ids:
        cfapi.delete(ids)
    if rows:
        d1.execute("DELETE FROM text_index WHERE status='failed';")

def flush(lines: list[str], work: str) -> None:
    path = os.path.join(work, "text_index.sql")
    with open(path, "w") as f:
        f.write("\n".join(lines) + "\n")
    d1.apply_sql(path)

def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="extract + chunk only; no AI/Vectorize/D1 writes")
    ap.add_argument("--limit", type=int, default=None, help="max records this run")
    args = ap.parse_args(argv)
    if not args.dry_run:
        retry_failed()
    rows = d1._d1_json(" ".join(SELECT.split()))[: args.limit]
    pending, ok, failed = [], 0, 0
    with tempfile.TemporaryDirectory() as work:
        for i, row in enumerate(rows, 1):
            chunks, chars = [], 0
            try:
                pages = pdf_pages(row["url"], work) if row["kind"] == "pdf" and row["url"] else []
                chars = sum(len(p) for p in pages)
                chunks = chunking.chunks_for(row, pages)
                if not args.dry_run:
                    vecs = cfapi.embed([c["text"] for c in chunks])
                    cfapi.upsert([{"id": c["id"], "values": v,
                                   "metadata": {"record_id": row["id"], "page": c["page"], "text": c["text"]}}
                                  for c, v in zip(chunks, vecs)])
                status = "empty" if row["kind"] == "pdf" and len(chunks) == 1 else "indexed"
                ok += 1
                print(f"[{i}/{len(rows)}] ok   {status:7} {row['id']} chunks={len(chunks)}")
            except Exception as e:
                status, failed = "failed", failed + 1
                print(f"[{i}/{len(rows)}] FAIL {row['id']}: {e}")
            pending.append(status_sql(row["id"], status, len(chunks), chars))
            if not args.dry_run and len(pending) >= FLUSH_EVERY:
                flush(pending, work)
                pending = []
        if not args.dry_run and pending:
            flush(pending, work)
    if not args.dry_run and ok:
        d1.execute("DELETE FROM ask_cache;")
    print(f"{'dry-run ' if args.dry_run else ''}indexed={ok} failed={failed}")
    sys.exit(1 if failed else 0)

if __name__ == "__main__":
    main()
