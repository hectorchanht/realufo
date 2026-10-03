#!/usr/bin/env python3
"""Export the realufo.org archive as an open dataset (Hugging Face).

Reads the live site's own APIs, so the export always matches what the site serves
(including re-OCR'd text): /api/records (paged) for the list, /api/records/<id> for
each record's fields and /doc/<id>/text?format=json for its pages.

Writes <out>/records.jsonl, <out>/pages.jsonl and <out>/README.md (the dataset card).
Only openly licensed records ship (OPEN_LICENSES); e.g. Library and Archives Canada's
non-commercial files stay on the site but out of the dataset.
Official content only: the site's AI summaries, TL;DRs and AI key moments are left out,
so every value is either from the government record or machine-extracted page text.

    python3 scripts/export_dataset.py --out dataset/        # export + self-check
    hf upload <namespace>/<name> dataset/ --repo-type dataset
"""
import argparse
import concurrent.futures as cf
import datetime
import json
import pathlib
import sys
import time
import urllib.parse
import urllib.request

SITE = "https://realufo.org"
UA = {"User-Agent": "realufo-dataset-export/1.0 (+https://realufo.org)"}
RECORD_FIELDS = [
    "id", "title", "agency", "archive", "kind", "incident_date", "location", "doc_date", "release",
    "summary", "source_url", "source_site", "license", "realufo_url", "file_url",
]
OPEN_LICENSES = {"public-domain-usgov", "cc-by-4.0"}


def is_open(row: dict) -> bool:
    return row.get("license") in OPEN_LICENSES


def get_json(path: str, tries: int = 4):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(SITE + path, headers=UA), timeout=60) as r:
                return json.load(r)
        except Exception:
            if i == tries - 1:
                raise
            time.sleep(2 ** i)


def q(record_id: str) -> str:
    return urllib.parse.quote(record_id, safe="")


def record_row(detail: dict) -> dict:
    """One records.jsonl row from /api/records/<id>, official fields only."""
    r = detail["record"]
    rel = detail.get("release")
    return {
        "id": r["id"],
        "title": r.get("title"),
        "agency": r.get("agency_full") or r.get("agency"),
        "archive": r.get("archive"),
        "kind": r.get("kind"),
        "incident_date": r.get("incident_date"),
        "location": r.get("location"),
        "doc_date": r.get("doc_date"),
        "release": rel["no"] if rel else None,
        "summary": r.get("summary"),
        "source_url": r.get("source_url"),
        "source_site": r.get("source_site"),
        "license": r.get("license"),
        "realufo_url": f"{SITE}/doc/{q(r['id'])}",
        "file_url": f"{SITE}/api/file/{q(r['id'])}",
    }


def page_rows(record_id: str, text: dict) -> list:
    """pages.jsonl rows from /doc/<id>/text?format=json; empty pages are skipped."""
    out = []
    for p in text.get("pages") or []:
        t = (p.get("text") or "").strip()
        if t:
            out.append({"id": record_id, "page": int(p["n"]), "text": t})
    return out


def check(records: list, pages: list, expected: int) -> list:
    """Self-check before upload; returns a list of problems (empty = ok)."""
    problems = []
    ids = [r["id"] for r in records]
    if len(records) != expected:
        problems.append(f"{len(records)} records exported, site lists {expected}")
    seen = set()
    for i in ids:
        if i in seen:
            problems.append(f"duplicate record id {i}")
        seen.add(i)
    for r in records:
        if not r["realufo_url"].startswith(f"{SITE}/doc/"):
            problems.append(f"bad realufo_url for {r['id']}")
    last = {}
    for p in pages:
        if p["id"] not in seen:
            problems.append(f"page rows for unknown record {p['id']}")
            continue
        if p["page"] <= last.get(p["id"], 0):
            problems.append(f"pages out of order for {p['id']}")
        last[p["id"]] = p["page"]
    return problems


def list_ids() -> tuple:
    ids, offset, total = [], 0, None
    while True:
        d = get_json(f"/api/records?limit=100&offset={offset}")
        total = d.get("count", total)
        batch = [r["id"] for r in d["records"]]
        ids += batch
        offset += len(batch)
        if not batch or offset >= total:
            return ids, total


def fetch(record_id: str):
    detail = get_json(f"/api/records/{q(record_id)}")
    try:
        text = get_json(f"/doc/{q(record_id)}/text?format=json")
    except Exception:
        text = {"pages": []}  # videos/images have no text
    return record_row(detail), page_rows(record_id, text)


CARD = """---
license: other
license_name: public-domain-us-gov-and-cc-by-4.0
pretty_name: RealUFO declassified UAP archive
language:
- en
tags:
- uap
- ufo
- declassified
- government-records
- foia
- ocr
size_categories:
- {size}
configs:
- config_name: records
  data_files: records.jsonl
- config_name: pages
  data_files: pages.jsonl
---

# RealUFO declassified UAP archive

Metadata and page text for **{n_records} declassified government UAP/UFO records** mirrored by
**[realufo.org](https://realufo.org)**: the Department of War's PURSUE releases, AARO case files,
and FBI, CIA, NASA, State, Energy and National Archives documents ({n_pages} text pages).

Every record links back to its page on realufo.org (`realufo_url`), where you can read the original
PDF or watch the video, browse its full text page by page, and follow related files.

## Files

- `records.jsonl`: one row per record — `id`, `title`, `agency`, `archive`, `kind` (pdf/video/image),
  `incident_date`, `location`, `doc_date` (release date as published), `release` (Pentagon release
  number, when part of one), `summary` (the official summary), `source_url` (the official source),
  `source_site`, `license`, `realufo_url`, `file_url` (the original file).
- `pages.jsonl`: one row per text page — `id`, `page` (1-based PDF page), `text`.

## Source and caveats

- Each row's `license` field gives its license: `public-domain-usgov` (works of the U.S.
  government, public domain) or `cc-by-4.0` (credit the source agency named in `agency`).
  Files under more restrictive terms are on realufo.org but not in this dataset. Dates and locations are
  given as the agencies published them (free text, not normalised).
- Page text is machine-extracted (text layer or OCR) and can contain errors; always check the
  original file (`file_url`) before quoting.
- Official content only: realufo.org's AI-written summaries and notes are not included.
- Exported {date} from the live site by
  [`scripts/export_dataset.py`](https://github.com/hectorchanht/realufo/blob/build/app-foundation/scripts/export_dataset.py).

## Links

- Archive: https://realufo.org/archive · Release tracker: https://realufo.org/releases ·
  Topics: https://realufo.org/browse · Cold cases: https://realufo.org/cases
- Full text for LLMs: https://realufo.org/llms-full.txt
- Source code: https://github.com/hectorchanht/realufo
"""


def size_bucket(n: int) -> str:
    return "n<1K" if n < 1000 else "1K<n<10K" if n < 10000 else "10K<n<100K"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="dataset")
    ap.add_argument("--workers", type=int, default=6)
    args = ap.parse_args()
    out = pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    ids, total = list_ids()
    print(f"{len(ids)} ids (site count {total})", file=sys.stderr)
    with cf.ThreadPoolExecutor(args.workers) as ex:
        results = list(ex.map(fetch, ids))
    results.sort(key=lambda x: x[0]["id"])
    if len(results) != total:
        print(f"{len(results)} records fetched, site lists {total}", file=sys.stderr)
        return 1
    results = [x for x in results if is_open(x[0])]
    records = [r for r, _ in results]
    pages = [p for _, ps in results for p in ps]
    print(f"{total - len(records)} records left out (license not open)", file=sys.stderr)

    problems = check(records, pages, expected=len(records))
    if problems:
        print("\n".join(problems), file=sys.stderr)
        return 1
    with open(out / "records.jsonl", "w") as f:
        for r in records:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    with open(out / "pages.jsonl", "w") as f:
        for p in pages:
            f.write(json.dumps(p, ensure_ascii=False) + "\n")
    (out / "README.md").write_text(CARD.format(
        n_records=len(records), n_pages=len(pages), size=size_bucket(len(records)),
        date=datetime.date.today().isoformat(),
    ))
    print(f"ok: {len(records)} records, {len(pages)} pages -> {out}/", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
