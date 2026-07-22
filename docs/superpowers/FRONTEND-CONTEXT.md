# Frontend Context (shared across web Tasks 12–23)

The backend (Tasks 1–11 + 9b) is complete and lives in `worker/`. The web app in `web/` is a
React 18 + Vite + TypeScript + Tailwind SPA that talks to the same-origin Worker API and matches
the prototype `realufo-handoff/RealUFO.dc.html` exactly.

## Authoritative visual source
`realufo-handoff/RealUFO.dc.html` is the exact target for markup, layout, styling, and interaction.
Screen tasks cite its line ranges — port that markup faithfully (CRT declassified-terminal look).
`realufo-handoff/data.js` was the seed; the running app now reads the D1-backed API, not data.js.

## Toolchain
Per `docs/superpowers/ENV.md`: prepend `export PATH="/Users/laichan/.nvm/versions/node/v22.22.0/bin:$PATH"` to every shell command. Web tests: `pnpm test:web` (vitest + jsdom + Testing Library, `passWithNoTests` currently true — real tests replace that). Web build: `pnpm build:web`.

## API (same-origin; all JSON). Client must send header `X-Anon-Id: <localStorage uuid>` on every request.
- `GET /api/bootstrap` → `{ archives[], boards[], stats, ticker[], sightings[], cases[] }`
  - archive: `{id,label,flag,accent,count,coord}` · board: `{id,slug,name,desc,accent,icon,online,thread_count}`
  - stats: `{records,archives,countries,videos,onlineNow,threads,postsToday,yearsCovered,byDecade:[[label,n]...],topLocations:[[label,n]...]}`
  - ticker: `{kind,board,text,ago}` · sighting: `{id,name,lat,lng,count,accent,case_slug}` · case-lite: `{slug,name,accent,coord}`
- `GET /api/feed` → `{ featured: RecordCard[], hot: ThreadCard[] }`
  - RecordCard(feed): `{id,archive,agency,title,summary,kind,redacted,thumb,credible,commentN}`
  - ThreadCard: `{id,no,board_id,boardSlug,accent,title,op_body,stance,reply_count,img_count,votes,hot,ago,tags?}`
- `GET /api/records?archive=&type=&redacted=1&q=&limit=&offset=` → `{ count, records: RecordCard[] }`
  - RecordCard(list): `{id,archive,agency,title,summary,kind,redacted,location,incident_date,doc_date,thumb}` (NOTE: list card differs from feed card — model both in types.ts)
- `GET /api/records/:id` → `{ record, assets:[{role,cdn_url,mime,width,height}], promotedThreads:[{id,no,title,stance,votes,source_record_id,boardSlug,accent}] }`
  - record has full columns incl. summary, agency, agency_full, incident_date, location, doc_date, virin, kind, redacted, archive
- `GET /api/records/:id/comments` → `{ comments:[{id,no,body,handle,stance,votes,created_at,ago,handleShow}] }`
- `POST /api/records/:id/comments` body `{body,stance?,handle?}` → 201 `{comment}` (same shape as a GET comment item; echoes created_at)
- `GET /api/boards/:id/threads` → `{ board, threads: ThreadCard[] }`  (board id, NOT slug — resolve slug→id via bootstrap boards map)
- `GET /api/threads/:id` → `{ thread, sourceRecord|null, posts:[Post] }`
  - thread: ThreadCard + op_body, op_handle, boardSlug, accent, tags, created_at
  - sourceRecord (the "◂ from record" chip): `{id,agency,title,kind,thumb}` or null
  - Post: `{id,no,body,handle,stance,votes,source_record_id,image_kind,image_label,reply_to:[],is_op,isOp,created_at,ago,handleShow}`
- `POST /api/threads` body `{board,title?,op_body,stance?,handle?,source_record_id?}` → 201 `{thread}` (echoes id,no,board_id,boardSlug,accent,title,stance,op_body,source_record_id,created_at,ago)
- `POST /api/threads/:id/posts` body `{body,stance?,handle?,source_record_id?,image_label?}` → 201 `{post}` (echoes created_at, ago:"now", isOp:false)
- `POST /api/votes` body `{target_type:'thread'|'post'|'comment',target_id}` → `{voted:boolean,votes:number}`
- `GET /api/cases/:slug` → `{ case, relatedThread|null }` (case: slug,name,archive,archive_label,accent,coord,lede,pull,pull_cite,status; relatedThread: {id,title,boardSlug,accent,ago})
- `POST /api/auth/login` body `{method?,handle?}` → stub `{stub:true,me:{handle}}` (FEATURE_AUTH=false)
- write endpoints may return **429** (rate limit) — surface as a toast ("slow down — too many posts").
- error shape: `{ error: string }` with the HTTP status.

## Stance colors (from prototype)
believer=`var(--grn)`, skeptic=`var(--amber)`, analyst=`var(--cyan)`, neutral=`var(--dim)`.

## Theme (Task 12)
CSS variables ported VERBATIM from prototype lines 16–34 (`:root`, `[data-theme="light"]`, `[data-accent="cyan|amber|violet"]`); keyframes 54–62; body/a/scroll rules 35–43; CRT layers 68–70. Tailwind aliases the vars. Fonts self-hosted via `@fontsource/*` (Press Start 2P / JetBrains Mono / Space Grotesk).

## Routing (Task 14) — react-router
`/`=Feed, `/archive`=Archive, `/doc/:id`=Doc, `/boards`=Boards, `/board/:slug`=Board, `/thread/:id`=Thread, `/case/:slug`=Case, `/map`=Map. Overlays (composer/viewer/login/toast) are OverlayProvider state, NOT routes.
Client should set `document.title` per route (default "RealUFO — Declassified UAP Archive") — the Worker injects OG/meta for crawlers; the SPA sets the live tab title. `web/index.html` should carry a sensible default `<title>` (Task 12 sets it; Worker's injectMeta strips it on deep-link routes).

## Dev proxy (nice-to-have)
For interactive `pnpm dev:web` (vite on 5173), add a proxy `/api → http://localhost:8787` in `web/vite.config.ts` so the SPA can reach the Worker. Tests mock the api client, so this is not required for `pnpm test:web`. The production/preview flow (`pnpm dev` → build + wrangler dev on 8787) serves SPA + API same-origin, no proxy needed.

## Query hooks (Task 13 establishes; screens consume)
`useBootstrap, useFeed, useRecords(params), useRecord(id), useComments(id), useBoardThreads(boardId), useThread(id), useCase(slug)`; mutations `useAddComment, useCreateThread, useReply, useVote` (optimistic). Screen tasks import these + the types; never call `fetch` directly.
