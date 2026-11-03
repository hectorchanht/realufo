# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two audiences, served equally (no primary/secondary split):

- **Curious visitors** arriving from Shorts, X and the other social accounts, or search. Mostly on phones. They want to see the real thing quickly: the clip, the scan, the TL;DR (懶人包), and whether a famous story holds up.
- **Serious researchers** (journalists, UFO researchers, academics). They need full-text search across pages, page-level citations, the original files, and stable links they can quote.

Also present, not prioritised: anonymous board participants, and developers/LLMs using `llms.txt`, per-file text endpoints and the Hugging Face dataset.

## Product Purpose

realufo.org is a searchable archive of declassified U.S. government UAP/UFO records (Department of War PURSUE releases, AARO, FBI, CIA, NASA, State, Energy, National Archives) plus key files from other governments (Canada, Spain, New Zealand): original PDFs, videos and images, full text, and page citations. Success = a visitor can go from a claim to the primary document page that supports or contradicts it.

## Positioning

What a neighbouring site (uapbrowser, The Black Vault, forums) can't truthfully copy:

1. **Official documents only, cited to the page.** Every claim traces to a primary file and page (`(p.N)`, `?p=N` deep links); where popular lore differs from the documents, that is flagged.
2. **Video analysis tools** on the records themselves: frame step, slow motion, zoom, reviewed key moments, measured physics in case write-ups.
3. **Ask answers from the files**, with the cited pages (RAG over the archive, not open-web).
4. **Neutral: neither believer nor debunker.** Facts first, verdicts labelled, skeptic voices welcome, no sensationalism.

## Operating Context

- Surfaces: Archive (filters by agency/release/type/decade, full-text search), record pages (file, page text, summary, video tools, related files), Release tracker, Topics, Cold cases, Ask, Shorts, Map, Boards (anonymous threads), Follow/notifications (PWA, Web Push).
- Data is ingested daily from official releases by a crawler; site renders only from what is ingested.
- Social fan-out (X, Bluesky, Facebook, Instagram, Threads, YouTube, TikTok) and a Telegram approval gate drive traffic back to record pages.
- Crawler-readable HTML is served for every page; SEO and AI-crawler readability matter.

## Capabilities and Constraints

- Cloudflare Worker + D1 + R2 + Workers AI/Vectorize; React + Vite + Tailwind SPA. Must work from a 320px phone to wide desktop.
- Page text is machine-extracted (OCR) and can contain errors; originals are always linked.
- Nothing is published (site threads, articles, social posts) without current data support, page-cited quotes and an explicit OK.
- **Open, not yet confirmed:** whether anonymous/no-sign-in use, affiliate book picks + email subscribe, a required accessibility standard, and English-only UI are binding product commitments. The code currently does all four (X-Anon-Id, `affiliate_picks`, subscribe endpoint, text sizer 50–300% + reduced-motion, English UI) — treat as current behaviour, not confirmed principle.

## Brand Commitments

- Name: RealUFO / realufo.org.
- Design style is CRT (phosphor terminal from the original prototype `realufo-handoff/RealUFO.dc.html`); visual rules live in `DESIGN.md`.
- Voice: plain words, sentence case, no jargon, no hype; acronyms written (FBI, UFO), not spelled out.

## Evidence on Hand

- Real archive: records, assets, full text and Shorts in D1/R2; Hugging Face dataset `tung00/realufo-uap-archive`.
- Cold-case write-ups and articles with page citations; Hellfire orb analysis with measured numbers.
- No testimonials, user counts, press coverage or endorsements on hand — do not fabricate any.

## Product Principles

1. **The document is the authority.** Show the primary file and page before any interpretation.
2. **Neutral by default.** Present evidence and labelled verdicts; let the visitor decide.
3. **Fast to the real thing, deep on demand.** A phone visitor sees the clip/scan/TL;DR at once; a researcher can reach full text, citations and originals in one step.
4. **Every claim is checkable.** Citations, deep links and the original file are always one tap away.
