# RealUFO — the declassified UAP archive

**[realufo.org](https://realufo.org)** is a searchable archive of declassified U.S. government
UAP/UFO records: the Department of War's PURSUE releases, AARO case files, FBI, CIA, NASA,
State, Energy and National Archives documents, plus key files from other governments (Canada,
Spain, New Zealand), with the original PDFs, videos and images, their full text, and page-level
citations.

## What's on the site

- **[Archive](https://realufo.org/archive)**: every file, filterable by agency, release, type and
  decade, with full-text search across the documents' pages.
- **[Release tracker](https://realufo.org/releases)**: every Pentagon UFO file release, the gaps
  between them and a labelled estimate of the next one.
- **[Topics](https://realufo.org/browse)**: cross-release collections (AAWSAP & the DIRD reports,
  Project Blue Book, the FBI flying-disc file, Apollo crew reports, AARO case resolutions, …)
  with researched, page-cited backgrounds.
- **[Cold cases](https://realufo.org/cases)**: fact-checked long-form stories (Roswell, Socorro,
  Kaikoura, JAL 1628, Tehran, Shag Harbour, …) where every claim cites a primary document.
- **Record pages**: the original file, its full text page by page, official summary, video tools
  (frame step, slow motion, zoom) and links to related files.
- **[Ask](https://realufo.org/ask)**: questions answered from the files, with the cited pages.
- **Shorts**: vertical clips cut from the archive's videos, each linked to its record (the
  [Archive's Shorts filter](https://realufo.org/archive?type=shorts) lists them).
- **[Map](https://realufo.org/map)**: where the files' incidents happened; tap a place to see its
  files. Every agency, place, decade and release also has its own page.
- **[Boards](https://realufo.org/boards)**: anonymous discussion threads, by topic, that can
  quote and embed records.
- **Follow**: follow files and get notified when new ones arrive; the site installs as an app.

## For developers and researchers

- [`llms.txt`](https://realufo.org/llms.txt) and [`llms-full.txt`](https://realufo.org/llms-full.txt):
  a Markdown map of the site and the full text of every file.
- [`sitemap.xml`](https://realufo.org/sitemap.xml) and [`rss.xml`](https://realufo.org/rss.xml).
- Per-file full text: `https://realufo.org/doc/<id>/text` (Markdown) or `?format=json`.
- [Open dataset on Hugging Face](https://huggingface.co/datasets/realufo/realufo-uap-archive):
  record metadata and page text as JSONL, exported by
  [`scripts/export_dataset.py`](scripts/export_dataset.py).

Most records are works of the U.S. government and in the public domain; files from other
governments follow their publishers' terms. Page text is
machine-extracted (OCR) and can contain errors; the original files are always linked.

## How it's built

- **Worker** (`worker/`): a Cloudflare Worker serving the API, the crawler-readable HTML for every
  page, sitemaps and feeds. Data lives in **D1**, files in **R2** (served from
  `assets.realufo.org`), Ask runs on **Workers AI** + **Vectorize**. A cron every 3 hours
  handles social posting and push notifications.
- **Web** (`web/`): the React + Vite + Tailwind single-page app.
- **Crawler** (`crawler/`): Python ingest jobs, run daily by a GitHub Action, that mirror the
  official releases and then extract text (PaddleOCR for scans), make thumbnails and clips, write
  summaries, build the Ask index and ping IndexNow. See [`crawler/ingest/README.md`](crawler/ingest/README.md).

Needs Node 22 and pnpm 8.

```bash
pnpm install && pnpm -C web install
pnpm db:migrate:local && pnpm db:seed:local   # local D1
pnpm dev                                      # builds the web app, runs wrangler dev
pnpm test:worker && pnpm test:web             # worker tests run in workerd with their own D1
cd web && npx tsc -b --noEmit                 # typecheck the web app and its tests
cd crawler && python -m pytest ingest/tests/ -q
```

Releases go through `pnpm run deploy`, which applies D1 migrations before uploading the Worker.
Notes for AI coding agents are in [`CLAUDE.md`](CLAUDE.md).

## Related

- [hectorchanht/gov-ufo-archive](https://github.com/hectorchanht/gov-ufo-archive) powers
  [release.realufo.org](https://release.realufo.org), the companion archive of other countries'
  official UFO files (France's GEIPAN, the UK, Brazil, Canada, Chile and more).
- Follow new files on [X](https://x.com/realufo_org),
  [Bluesky](https://bsky.app/profile/realufo.bsky.social),
  [Facebook](https://www.facebook.com/realufo.org/),
  [Instagram](https://www.instagram.com/realufo_org/),
  [Threads](https://www.threads.com/@realufo_org) and
  [YouTube](https://www.youtube.com/@realufo_org).

## License

The source code in this repository is licensed under the
[GNU Affero General Public License v3.0](LICENSE).

The declassified government documents mirrored by this project are works of
the U.S. federal government and are in the public domain (17 U.S.C. § 105).
Files from other governments follow their publishers' terms, noted per record.

## Contact

- hello@realufo.org
- tips@realufo.org (UAP tips)
- press@realufo.org (media)
