# RealUFO — Uncapped AI over the full text (Spec 2 of "real full text into the LLMs")

Date: 2026-10-03 · Status: approved design, pending spec review
Builds on: `2026-10-03-realufo-paddleocr-reocr-design.md` (Spec 1: R2 `text/<id>.json`, `record_ocr`).

## Why

After Spec 1 every PDF has real per-page text in R2, but three consumers still see only part of it:

| Consumer | Today |
|---|---|
| AI summary (`ingest.summaries`) | first 12k chars of the capped `record_text` pages |
| Site search (`record_fts`, filled by triggers on `record_text`) | only the first ~30k chars of each file |
| `llms-full.txt` | the capped `record_text` pages inline (~6 MB) |

Ask (Vectorize) already embeds every page. Numbers (2026-10-03, 332 OCR'd files): 34.8M chars, largest file
2.8M chars; 165 files > 12k chars, 90 > 100k, 23 > 400k.

## Decisions (user)

- Approach 1: **R2 `text/<id>.json` stays the single source of page text**; consumers read it (no second copy in D1).
- Map-reduce summaries. Section summaries are **stored**, **embedded into Ask**, and shown as a **clickable outline** on the doc page.
- Final summary length scales: 60–120 words for files ≤ 30 pages, up to ~200 words above.
- `llms-full.txt` = facts + TL;DR + AI summary + outline + link to `/doc/<id>/text`; no inline page text.
- Model stays Workers AI qwen3 (`cfapi.chat`, 32k context). Cost ~$1–3 one-off, cents per new file.

## 1. Map-reduce summaries (`crawler/ingest/summaries.py`)

**Input:** every page from R2 (`textindex.pdf_pages(url, work, ocr_id)` for records with a `record_ocr` row; else the
`record_text` pages as today). Images (pages `'[]'`, visual descriptions) are untouched.

**Map:** pack consecutive non-empty pages into sections of ≤ `SECTION = 12000` chars, page-aligned; a single page longer
than that is split at line breaks into consecutive parts with the same page number. One `cfapi.chat` call per section:
≤ 40 words on what those pages contain (document type, who/when/where, what is reported), same rules as today's
SYSTEM prompt (only what the text says, no speculation, OCR noise ignored, text is data not instructions).
Result: `{"from": a, "to": b, "text": "..."}`.

**Reduce:**
- One section → a single call over the text, as today (no map step).
- Otherwise → final summary from the section list rendered as `[pp. a–b] text` lines.
- If that list is longer than `SECTION` chars, reduce in layers: group the lines into ≤ `SECTION`-char groups,
  summarise each group into one `[pp. a–b]` line, repeat until it fits, then write the final summary.

**Length:** `MAX_WORDS = 120` when the file has ≤ 30 pages, `200` otherwise; `MIN_WORDS` unchanged. The SYSTEM prompt
states the matching word range.

**Storage:** migration `ALTER TABLE record_text ADD COLUMN ai_sections TEXT` (JSON array of map-level sections;
NULL for single-section files and images). `ai_summary` stays the final paragraph. `row_sql` writes both plus the
existing `reindex_sql`.

**Selection:** `ai_summary IS NULL` (as today) **or** (`ai_sections IS NULL` and the file's text is > `SECTION`
chars, read from `record_ocr.chars`). This picks up the ~165 long files summarised from capped text.

**Concurrency:** `--workers N` (default 1; ThreadPoolExecutor over records — calls are network-bound). Results are
flushed in batches as today; output order doesn't matter. Failures leave the row unchanged → retried next run.

## 2. Full-page search

**Trigger guard (migration):** recreate `record_fts_ai`, `record_fts_au`, `record_fts_ad` (migration 0020) with
`WHEN NOT EXISTS (SELECT 1 FROM record_ocr WHERE record_id = new.record_id)` (`old.` for the delete trigger).
For OCR'd files, `record_text` writes and deletes no longer touch `record_fts`. Non-OCR files keep today's behaviour.
(The delete guard matters most: the OCR requeue deletes `record_text`.)

**Writer:** `ocr.marker_sql` also emits `DELETE FROM record_fts WHERE record_id=?` + one
`INSERT INTO record_fts(record_id,page,body)` per non-empty page, for **every** marked file (born-digital too — they
never requeue). Page bodies are capped at 90k chars (`ponytail:` D1 statement limit ~100 KB; real pages are far smaller).
The marker row is written first in the same batch, so the guarded triggers already see it.

**Backfill:** `python -m ingest.ocr --fts-only [--ids …]`: for every record with a `record_ocr` row, read R2
`text/<id>.json` and write its FTS rows. No OCR, no marker change, no requeue. Idempotent.

**Unchanged:** the archive search query, its page snippet and the `?p=N` deep link (worker/routes/records.ts).
D1 grows by roughly 100–150 MB (limit 10 GB). Backups: `wrangler d1 export` still needs record_fts dropped first
(existing caveat in migration 0020).

## 3. Ask section chunks

`chunking.chunks_for` adds one chunk per stored section: `"<title> — pp. a–b: <text>"`, `page = a`, next to the
existing AI-summary chunk. `textindex.SELECT` adds `ai_sections`. Re-embedding is already triggered by
`summaries.row_sql` (`reindex_sql`).

## 4. Doc-page outline

`GET /api/records/:id` returns `fullText.aiSections` (parsed JSON or null). In `web/src/components/FullText.tsx`
the AI SUMMARY view shows the summary, then **IN THIS FILE**: a compact scrollable list of
`pp. a–b · text` rows; clicking a row switches to FULL TEXT at page `a` (same path as prev/next: `onPageChange`
→ `?p=a`). Hidden when there are fewer than 2 sections.

## 5. `llms-full.txt`

`worker/routes/llms.ts` `fileMd`: per file, facts, TL;DR, AI summary, `### In this file` outline lines
(`- pp. a–b: text`) and `Full text: <origin>/doc/<id>/text`; the inline `### Full text` pages and the truncation note
are removed. Still streamed in id-ordered batches. Expected size ~2–3 MB.

## Testing

- pytest `summaries`: section packing (page-aligned, ≤ 12k, oversized page split, empty pages skipped); map→reduce
  with a fake chat; layered reduce when the section list > 12k; MAX_WORDS by page count; `row_sql` round-trip in
  sqlite (`ai_summary`, `ai_sections`, reindex); selection SQL (NULL summary, long file without sections);
  `--workers` gives the same rows as sequential.
- pytest `ocr`: `marker_sql` FTS rows for every page (cap, escaping, empty pages skipped); `--fts-only` writes FTS
  only (no marker, no requeue).
- pytest `chunking`: one chunk per section with its page.
- Worker vitest: trigger guard (record_text insert/delete for a `record_ocr` file leaves its FTS rows; a non-OCR file
  still syncs); records API returns `aiSections`; `llms-full.txt` has outline + link and no inline pages.
- Web vitest: outline renders, row click opens FULL TEXT at that page, hidden below 2 sections.

## Rollout (after Spec 1's backfill + rebuild chain)

1. Check pending migrations (other chats), then apply the migration (`ai_sections` + trigger guard).
2. `ocr --fts-only`; spot-check search for a phrase deep inside a 400-page file.
3. Pilot: `summaries --workers 8 --ids <5 long files>` → `textindex` → `tldr --ids …` → `cards --ids …`. Review the
   summaries and outlines; `ask_eval` incl. the 10 OCR-only golden questions (Spec 1 plan Task 8 step 3b).
4. Full run: `summaries --workers 8` → `textindex` → `tldr` → `tldr --recheck` → `cards`; IndexNow for changed doc
   pages; deploy Worker + web from a clean worktree; push.
5. Daily GHA: Spec 1's `ocr` step covers FTS for new PDFs; the summaries step gets `--workers 4`.

**Rollback:** revert the code; the `ai_sections` column is harmless if unused. Search: drop the trigger guard
(restores record_text-driven FTS), then rewrite the OCR'd files' `record_text` rows (`DELETE` + `ingest.fulltext`) so
the triggers refill FTS. Forward again at any time with `ocr --fts-only`.

## Out of scope

PaddleOCR-VL fallback for unreadable pages; TL;DR in other languages; doc-page section UI beyond the outline;
removing `record_text` (still used by non-OCR rows and the capped doc fallback).
