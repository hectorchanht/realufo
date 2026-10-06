# Public Developer API v1 — plan

Date: 2026-10-06. Goal: 正式開放 API 俾 developer 用，擴大 archive 嘅影響力。

## Design decisions

- **Versioned, read-only, keyless.** `/api/v1/*`. No API keys for v1 — friction is the enemy of adoption; rate limit per IP instead. Keys reserved for a future v2 if abuse demands it.
- **Reuse, don't fork.** v1 is a thin stable envelope over existing internals (`listRecords`, `loadRecord`, `recordText`, `facetCounts`, `wargovReleases`, `storyView`, `queryShorts`, `listHubs`). Internal `/api/*` keeps its shape; v1 commits to a contract.
- **Stable envelope.** Every v1 response is `{ data, meta }` (list: `meta: { total, page, per_page }`); errors are `{ error }` with the right HTTP status. Fields documented in `openapi.json` are additive-only — new fields may appear, documented ones never disappear or change type.
- **CORS open.** `Access-Control-Allow-Origin: *` on `/api/v1/*` + OPTIONS 204 preflight, so browser apps can call it directly.
- **Rate limit in-memory** (not D1 writes per request): sliding window per IP, default 600 req / 60s, env-overridable (`API_RATE_MAX`, `API_RATE_WINDOW_SEC`). Returns `429` + `Retry-After`, plus `X-RateLimit-Limit/Remaining` headers.
- **Edge-cacheable GETs.** List endpoints `public, s-maxage=300, max-age=60`; detail `public, s-maxage=600`. (Internal json() helper is no-store — v1 uses its own responder.)
- **Pagination:** `page` (1-based) + `per_page` (default 20, max 100); v1 maps them onto the internal `limit`/`offset` of `/api/records`.
- **/ask is NOT in v1.** RAG costs Workers AI neurons per call; it stays behind the site's own key-less-but-site-gated route.

## Endpoints

| Method | Path | Source | Notes |
|---|---|---|---|
| GET | /api/v1/openapi.json | hand-written | machine-readable spec |
| GET | /api/v1/records | listRecords | q, archive, type, agency, location, year, decade, release, sort, has; `data` = card rows + `match` when q |
| GET | /api/v1/records/:id | loadRecord | stable subset: record, assets, release, related ids, fullText (pages+aiSummary, no per-page beyond text), tldr, topics, hubs, citedIn |
| GET | /api/v1/records/:id/text | recordText | raw OCR pages |
| GET | /api/v1/archives | facetCounts | releases, kinds, agencies, decades, locations |
| GET | /api/v1/releases | wargovReleases | release no/date/file counts |
| GET | /api/v1/cases | CASE_STORY_TEXT | slug + title list |
| GET | /api/v1/cases/:slug | storyView | full case with resolved sources |
| GET | /api/v1/shorts | queryShorts | q, limit/offset → page/per_page |
| GET | /api/v1/hubs | listHubs | HubSummary list |
| GET | /api/v1/hubs/:kind/:slug | getHub | re-shaped hub |

Record card fields (locked contract): `id, archive, agency, title, summary, kind, redacted, location, incident_date, doc_date, thumb, duration, crop, oneLiner` + `match` (search excerpt `{page, text}` or null).

## Docs

- `GET /api/v1/openapi.json` (OpenAPI 3.0).
- Human page: web SPA `/developers` — quickstart, curl examples, rate limits, terms (attribute realufo.org; data mirrors official sources; mirrored fields must not be re-presented as a different official value — the site's data-accuracy rule, extended to API consumers). Footer link added.
- `/llms.txt` gets one line pointing at the API.

## Terms / licensing note

Records are declassified public documents; summaries/TL;DR are site-generated. Ask nothing more than attribution + don't misrepresent official values.

## Out of scope

API keys, write endpoints, /ask RAG, webhooks, SDK clients, usage dashboards.
