# RealUFO — Full text on doc pages (SEO sub-project 2)

Date: 2026-10-02 · Status: approved design, pending spec review

## Why

Goal (user): better SEO and more traffic, SEO foundation first. Sub-project 1
(crawler-visible HTML, `docs/superpowers/specs/2026-10-02-realufo-crawler-html-design.md`)
made each doc page crawlable, but the page only carries title, facts and a
short summary. The PDFs' own words — names, places, dates, phrases people
actually search for ("flying discs 1947 Kirtland") — exist only as Ask chunks
in Vectorize metadata, never on a page.

Measured 2026-10-02 (remote D1 `text_index`): 546 records with text, ~38 MB.
Average chars per PDF: wargov 55k, aaro 14k, nasa 25k, nara 440k (max 2.8 MB;
58 files > 200k). Old scans are heavy OCR noise in places.

Decision (user): **capped full text on the existing doc page** — no new URLs,
no per-page or transcript pages (thin-content risk on garbled scans).

Out of scope: Archive full-text search, text for images/videos, re-OCR,
hub pages (sub-project 3).

## Storage — D1 `record_text` (approach A, user-approved)

Migration `db/migrations/0011_record_text.sql`:

```sql
CREATE TABLE record_text (
  record_id   TEXT PRIMARY KEY REFERENCES records(id),
  pages       TEXT NOT NULL,              -- JSON [{"n": <pdf page no>, "text": "..."}], quality-filtered, capped
  truncated   INTEGER NOT NULL DEFAULT 0, -- 1 when clean text was cut at the cap
  total_pages INTEGER NOT NULL,           -- pages in the PDF
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

~546 rows × ≤ ~30 KB ≈ 16 MB. A record with no clean page still gets a row
with `pages = '[]'` so it is not retried every day.

## Extraction — `crawler/ingest/fulltext.py`

`python -m ingest.fulltext [--dry-run] [--limit N]`

- Selects live `kind='pdf'` records with a `full` asset and no `record_text`
  row, newest first.
- Downloads + `pdftotext` via the existing `textindex.pdf_pages(url, work)`
  (returns the page list split on form feeds).
- Pure helpers (no I/O) in the same module, unit-tested:
  - `clean_page(text) -> str`: collapse runs of spaces/tabs, collapse 3+
    newlines to one blank line, strip.
  - `word_ratio(text) -> float`: share of whitespace tokens that look like
    words or numbers, regex
    `^[("']?(?:[A-Z]+|[A-Za-z][a-z]*)(?:[-'][A-Za-z]+)?[.,;:)"'?!]*$|^\d[\d,./-]*[.,;:]?$`
    (ALL-CAPS tokens count — teletypes/cables are all caps; amended after
    final review, fixtures then score p3 0.60 / p20 0.72).
  - `keep_page(text) -> bool`: ≥ 200 alphanumeric chars AND
    `word_ratio ≥ 0.65`.
    Tuned on a 2026-10-02 sample (wargov D129, 1963 SP-16, AARO 2025
    workshop paper, NARA Pentagon Papers V-B-2b, 1946-7 AMC general file):
    pages < 0.6 were unreadable OCR; 0.69–0.70 were noisy but readable and
    carried key terms ("Flying Discs", dates, units); born-digital pages
    scored ≥ 0.8.
  - `select_pages(pages: list[str], cap=30000) -> (list[{n,text}], truncated)`:
    keeps clean pages in order with their 1-based PDF page number; stops
    when the running total would pass `cap`, cutting the last page at the
    last line break or `". "` before the cap (whole page dropped if that cut
    leaves < 200 chars); `truncated = True` if any kept-quality text was left
    out.
- Writes `INSERT OR REPLACE INTO record_text(...)` SQL in batches of 25 via
  the existing `d1.apply_sql` (as `textindex.flush` does), JSON via
  `json.dumps(ensure_ascii=False)` quoted with `d1.sql_q`.
- Per-record failures (download, pdftotext) are logged and skipped (no row,
  retried next run); exit code 1 if any failed, like textindex.
- `--dry-run`: extract + select, print per-record kept/total pages and
  chars, write nothing.

Rollout: one local backfill run (`python -m ingest.fulltext`), then a CI
step `fulltext` in `.github/workflows/ingest.yml` after `textindex`, same
LIVE/dry-run pattern.

## Worker

- `loadRecord` (worker/routes/records.ts) adds
  `fullText: { pages: {n:number,text:string}[]; truncated: boolean; total_pages: number } | null`
  (null when no row; `pages` parsed from JSON). One extra single-row query in
  the existing `Promise.all`.
- `docBody` (worker/lib/ssr.ts): when `fullText.pages` is non-empty, a
  `<section><h2>Full text</h2>` with per page `<h3>Page N</h3>` + text as
  escaped paragraphs (split on blank lines; single newlines become `<br>`).
  When `truncated`, a closing paragraph: "Text continues in the original
  file (N pages)." linking `/api/file/<id>`.
- The 1h page-data cache (sub-project 1) already absorbs the extra read.
  Cached page JSON grows to ≤ ~35 KB per doc — fine for the Cache API.

## SPA

- `RecordDetail` type gains the optional `fullText` field.
- `Doc.tsx`: new `FullText` component rendered after the summary/"OPEN
  ORIGINAL" block, only when `fullText?.pages.length`:
  - Heading "FULL TEXT" in the page's existing mono label style, with
    "N of M pages · OCR, may contain errors" hint.
  - First page visible; remaining pages inside a native `<details>`
    ("Show all N pages"). Content stays in the DOM when collapsed, so
    rendered-page indexing still sees it and it matches the pre-render.
  - Page text with `whiteSpace: pre-line`, page labels "PAGE N".
  - When truncated: "Text continues in the original file →" button reusing
    `handleOpenOriginal`.
- No new requests: data comes with the existing `/api/records/:id` call.

## Testing

- Python (`crawler/ingest/tests/test_fulltext.py`): `word_ratio` on clean vs
  garbled samples. Fixtures are two full pages of the 1946-7 AMC general file
  (`https://assets.realufo.org/pdfs/wargov/18_100754_%20general%201946-7_vol_2.pdf`,
  `pdftotext -enc UTF-8`), saved verbatim as
  `crawler/ingest/tests/fixtures/ocr-1946-p3.txt` (ratio ≈ 0.59, unreadable,
  must fail) and `ocr-1946-p20.txt` (ratio ≈ 0.70, "Flying Discs" memo,
  noisy but readable, must pass). Short excerpts are not valid fixtures:
  the ratio is unstable on a few dozen tokens; `keep_page`
  thresholds; `select_pages` keeps page numbers, caps at 30k, cuts at a line
  break, sets `truncated`; all-garbage input → `([], False)`; SQL builder
  escapes quotes.
- Worker: `loadRecord` returns parsed `fullText` for a seeded `record_text`
  row and `null` without one; `docBody` renders Full text section, escapes
  `<script>` in text, shows the continuation link only when truncated; doc
  route pre-render contains a page's text.
- Web (vitest + testing-library, existing `web/src/tests` setup): Doc shows
  FULL TEXT with first page visible and the rest under `<details>`; hidden
  when `fullText` is null or empty.
- Manual after deploy: one wargov and one nara doc via
  `curl -A Googlebot` show the Full text section; SPA doc page shows it
  without console errors.

## Rollout order

1. Migration applied remote (`pnpm db:migrate`) — additive table, safe
   before code.
2. Deploy Worker + SPA (null `fullText` renders nothing — safe before
   backfill).
3. Local backfill `python -m ingest.fulltext`; spot-check pages.
4. CI step merged → new releases get text daily.
5. Page cache means already-cached docs show text within 1h.
