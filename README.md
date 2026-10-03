# RealUFO — the declassified UAP archive

**[realufo.org](https://realufo.org)** is a searchable archive of declassified U.S. government
UAP/UFO records: the Department of War's PURSUE releases, AARO case files, FBI, CIA, NASA,
State, Energy and National Archives documents, with the original PDFs, videos and images,
their full text, and page-level citations.

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

## For developers and researchers

- [`llms.txt`](https://realufo.org/llms.txt) and [`llms-full.txt`](https://realufo.org/llms-full.txt):
  a Markdown map of the site and the full text of every file.
- [`sitemap.xml`](https://realufo.org/sitemap.xml) and [`rss.xml`](https://realufo.org/rss.xml).
- Per-file full text: `https://realufo.org/doc/<id>/text` (Markdown) or `?format=json`.
- Open dataset: record metadata and page text, exported by
  [`scripts/export_dataset.py`](scripts/export_dataset.py).

The records themselves are works of the U.S. government and in the public domain. Page text is
machine-extracted (OCR) and can contain errors; the original files are always linked.

## How it's built

- **Worker** (`worker/`): a Cloudflare Worker serving the API, the crawler-readable HTML for every
  page, sitemaps and feeds. Data lives in **D1**; files in **R2**.
- **Web** (`web/`): the React single-page app.
- **Crawler** (`crawler/`): Python ingest jobs that mirror the official releases, extract text,
  generate thumbnails and summaries, and post new files to social accounts.

```bash
pnpm install && pnpm -C web install
pnpm db:migrate:local && pnpm db:seed:local   # local D1
pnpm dev                                      # builds the web app, runs wrangler dev
pnpm test:worker && pnpm test:web
```

## Related

- [hectorchanht/gov-ufo-archive](https://github.com/hectorchanht/gov-ufo-archive) powers
  [release.realufo.org](https://release.realufo.org), the companion archive of other countries'
  official UFO files (France's GEIPAN, the UK, Brazil, Canada, Chile and more).
- Follow new files on [X](https://x.com/realufo_org) and
  [Bluesky](https://bsky.app/profile/realufo.bsky.social).
