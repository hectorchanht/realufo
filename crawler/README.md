# RealUFO crawler + data-linkage reference

Ported from the old archive repo `war-gov-ufo-release` (Astro static site).
This directory holds the crawl + source→R2 mapping logic RealUFO reuses to
mirror government UFO/UAP releases and register them in D1.

## The data linkage (read this first)

```
war.gov / DVIDS / agency sites          ← origins (Akamai-protected)
        │  download-war.gov.py (curl_cffi Chrome TLS impersonation)
        ▼
local mirror (pdfs, videos, slideshow images, bundles)
        │  upload → R2 bucket `realufo`  (+ GitHub release assets)
        ▼
R2 @ https://assets.realufo.org         ← CDN the app reads
        │  seed/backfill → D1 records + assets   (db/seed.ts buildSeedSQL shape)
        ▼
D1 `realufo-db`                         ← THE SITE RENDERS ONLY FROM HERE
        │  /api/* Worker routes
        ▼
realufo.org
```

**Critical:** the site shows a file only if it has a D1 `records` row (+ an
`assets` row for playback). A file in R2 with no D1 record is invisible.

## Source→R2 URL mapping (`_archive_common.py`)

`{R2_BASE}/{asset_type}/{archive_slug}/{basename}`, `R2_BASE=https://assets.realufo.org`

| Type | R2 path | Thumb |
|------|---------|-------|
| PDF  | `pdfs/<slug>/<name>.pdf` | `pdf-thumbs/<slug>/<name>.jpg` (build-pdf-thumbs.py) |
| VIDEO| `videos/<slug>/DOD_<dodAssetId>.mp4` | none at source |
| IMG  | not yet mirrored to R2 | — |
| AUD  | not yet mirrored to R2 (in gov-ufo-archive GH releases) | — |

Videos: CSV `DVIDS Video ID` is a *catalog* id. `resolve-dvids-r0*.py` resolve
it to the *DOD asset* id; the results are cached in `dvids-maps/dvids2dod-r0*.json`.
The R2 mp4 basename is `DOD_<dodAssetId>.mp4`.

## Source-of-truth data

- `uap-data.csv` (334 rows) + `uap-release001.csv` (158 rows) — war.gov releases.
  Columns incl. `Featured, Redaction, Release Date, Title, Type(PDF|VID|IMG|AUD),
  Description Blurb, DVIDS Video ID, Agency, Incident Date, Incident Location,
  PDF | Image Link, Modal Image, Image VIRIN`.
- `release-manifest.json` — `{pdfs, videos}` → GitHub release download URLs.

## Files

- `download-war.gov.py` — the crawler (needs `pip install curl_cffi`).
- `_archive_common.py` — R2 URL mapping helpers (pure stdlib; `rewrite_to_r2`, `pdf_thumb_url`).
- `build-pdf-thumbs.py` — renders + uploads PDF thumbnails.
- `resolve-dvids-r0{1,3,4}.py` + `dvids-maps/` — DVIDS catalog→DOD asset id resolution.

## Backfill recipe (how the 2026-07-24 video backfill worked)

1. Parse CSV VID rows, resolve each via the merged `dvids2dod` maps →
   `videos/wargov/DOD_<id>.mp4`; dedup by DOD id; derive record id from the
   Title code (fallback `WARGOV-VID-<id>`), de-colliding against existing D1 ids.
2. HEAD-verify every URL on the CDN (confirms it's really in R2).
3. Emit `INSERT OR IGNORE` records (`kind='video'`) + guarded `full` `video/mp4`
   assets — records+assets ONLY, never touching live comments/threads.
4. Apply local → verify → `wrangler d1 execute realufo-db --remote --file …`.

## Not yet done

Images (local-only in old repo `slideshow*/`+`assets/`), audio (gov-ufo-archive
GH releases; needs `audio` added to `records.kind` CHECK), and nasa/nara/other
sources are not yet in R2/D1. This is the Spec-2 Queues ingest pipeline work.
