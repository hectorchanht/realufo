# RealUFO — Scheduled Auto-Mirror Ingest (Spec 2)

**Date:** 2026-07-25
**Status:** approved-pending-review
**Supersedes:** the CF-Queues ingest pipeline sketched in Spec 1 §13 (dropped — see §2).

---

## 1. Goal

Continuously mirror **US official UFO/UAP content** into RealUFO with no manual
work: on a schedule, crawl the four US sources, detect content not yet mirrored,
copy the files to R2, register them in D1, and let the public read and comment.
Re-running finds only what's new.

Sources (USA only, by influence): **war.gov (wargov), aaro.mil (aaro), NASA
(nasa), NARA (nara)**. Other countries and audio are out of scope for this spec.

## 2. Locked decisions

| Decision | Choice | Why |
|---|---|---|
| Crawler runtime | **GitHub Actions** (scheduled) | war.gov + aaro.mil are behind Akamai; only the `curl_cffi` Chrome-TLS-impersonation crawler gets through. A CF Worker's `fetch()` is fingerprinted and 403s. |
| Pipeline mechanism | **Batch Python script**, not CF Queues | Since the crawl already runs in Actions, a linear crawl→diff→mirror→upsert script is simpler than Queues+DLQ+consumer and needs no Workers Paid plan. |
| R2 + D1 writes | **`wrangler` from the Action**, CF API token secret | No public write endpoint on the Worker; the Action already holds credentials. |
| Worker role | **Unchanged — read/serve only** | Keeps the runtime surface small; the site already renders from D1. |
| Idempotency | Deterministic ids + `INSERT OR IGNORE`; file confirmed in R2 before its record is inserted | Safe to run daily; never a broken card. |
| Audio, FTS/semantic search | **Deferred** | YAGNI for v1 of the scheduler. |

## 3. Architecture

```
official sites (war.gov, aaro.mil, nasa, nara)
        │   GitHub Actions (cron, daily)  ── crawler/ingest.py
        │     1. crawl/scrape each source (curl_cffi for Akamai)
        │     2. normalize → candidate records + R2 target URLs
        │     3. diff vs live D1 (SELECT source_url,id) → NEW only
        ▼
   for each NEW item:
     download original ─▶ wrangler r2 object put ─▶ R2 (assets.realufo.org)
                                                        │ HEAD 200 gate
        ▼
   emit INSERT OR IGNORE (archives, records, assets) ─▶ wrangler d1 execute --remote
        ▼
   Cloudflare D1 (realufo-db)  ◀── Worker /api/* ──▶  realufo.org (read + comment)
```

The Worker and web app are untouched. All new behaviour lives in `crawler/` +
`.github/workflows/`.

## 4. Components

### 4.1 `crawler/ingest.py` (the driver)
CLI: `python ingest.py [--sources wargov,aaro,nasa,nara] [--dry-run] [--limit N]`.

Per source, an adapter returns a list of **candidate records** in the D1 record
shape (matching `db/seed.ts`): `{id, archive, agency, agency_full, title,
summary, incident_date, location, doc_date, kind, redacted, virin, source_url,
assets:[{role, url, mime}]}`.

- **wargov** — reuse `download-war.gov.py` release-page scrape + the
  `uap-data.csv`/`uap-release001.csv` metadata + `dvids-maps` for video ids;
  `_archive_common.rewrite_to_r2` for R2 URLs.
- **aaro / nasa / nara** — per-source scrape of the official pages for file
  links + metadata (adapted from the old repo's per-source builders).
- **Metadata fallback:** when a page yields a file but no rich blurb, derive
  `title` from the filename and `agency` from the source slug (degraded but
  never blank). Rich curation stays possible later.

### 4.2 Diff
`wrangler d1 execute realufo-db --remote --json "SELECT source_url,id FROM
records"` → sets of known R2 URLs + ids. A candidate is **new** iff its R2 URL
is not already registered. Deterministic id derivation (title-code → else
`<SLUG>-<filestem>` → else `<SLUG>-<hash>`), de-colliding against known ids.

### 4.3 Mirror
For each new candidate whose file is not yet in R2 (HEAD 404): download the
original (curl_cffi for Akamai hosts, plain fetch otherwise) → `wrangler r2
object put realufo/<key> --file <tmp> --content-type <ct> --remote` → re-HEAD to
confirm 200. Candidates whose file can't be confirmed in R2 are **dropped from
the D1 write** (logged), so the site never shows a broken card.

### 4.4 Upsert
Emit one SQL file: `INSERT OR IGNORE` for any missing `archives` row (new
source), then records, then `NOT EXISTS`-guarded assets — the exact shape the
2026-07-24 backfills used. Apply with `wrangler d1 execute --remote --file`.
Then update each affected `archives.count`.

### 4.5 `.github/workflows/ingest.yml`
`on: schedule (cron daily ~06:00 UTC) + workflow_dispatch`. Steps: checkout →
setup Python + Node → `pip install curl_cffi` → `npm i -g wrangler` → `python
crawler/ingest.py`. Env: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` from
repo secrets. Uploads a run-summary artifact (new/skipped/failed per source).

## 5. Data flow & idempotency

A candidate becomes live only after: file in R2 (HEAD 200) → record + `full`
asset inserted (kind drives mime). `INSERT OR IGNORE` + URL-based dedup means a
second run with no new content writes nothing. Deterministic ids mean the same
item always maps to the same row.

## 6. Failure handling

Per-item `try/except`; a failure (download 403/timeout, upload error) is logged
and counted, never aborts the batch. The run summary lists failures per source
for retry next run (transient) or investigation (persistent). No dead-letter
infra — the next scheduled run naturally retries anything still missing.

## 7. Testing

- **Unit:** pure functions — id derivation, R2-URL mapping, candidate→SQL
  emission, diff — against small fixtures (a few CSV rows / HTML snippets).
- **Dry-run:** `--dry-run` performs crawl + diff and prints the plan (what would
  upload / insert) with zero writes. Used in CI on PRs.
- **First live run:** manual `workflow_dispatch` with `--limit` small, verify R2
  + D1 + site, then enable the daily `schedule`.

## 8. Human actions required

1. Create a Cloudflare API token scoped to **R2 write + D1 write** for account
   `f1868a071996e836eae6da2b65f37929`.
2. Add repo secrets `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`.
3. Approve enabling the `schedule:` trigger after the first manual run passes.

## 9. Out of scope

- Audio (mp4-packaged, no clean source→file mapping yet).
- Non-US sources (uk, chile, brazil, geipan, …).
- D1 FTS keyword + Vectorize semantic search.
- Poster-frame / thumbnail generation for videos (play-glyph fallback stands).

## 10. Known limitations

- Rich curated metadata (Description Blurbs) exists for the current war.gov
  tranche via the CSVs; genuinely new releases may arrive with thin metadata
  until the source page is parsed or the CSV is refreshed. The filename/agency
  fallback keeps such items visible and correctly filed.
- Scheduling lives in GitHub Actions, not Cloudflare — the mirror updates only
  when the Action runs (daily), not on Worker request.
