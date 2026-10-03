# RealUFO as an installable app: PWA, offline, push — design

Date: 2026-10-03 · Status: approved in chat, pending spec review

## Goal

realufo.org installs to the home screen and behaves like a mobile app: opens
standalone (no browser bar), opens instantly, reads previously visited pages
offline, queues posts made offline, and sends push notifications the user opts
into (replies, followed records/threads/hubs, new archive files, daily pick).

Success:
- Lighthouse/Chrome reports the site installable; iOS "Add to Home Screen" opens standalone.
- A visited `/doc/:id`, `/thread/:id`, hub or feed reloads with the network off.
- A comment written offline posts automatically when the connection returns.
- A user who followed a thread gets a notification when someone else replies.

## Decisions (from brainstorming)

- Scope = install + offline shell + offline reading + offline post queue + push (all four push types, user chooses what to listen to).
- Approach A: hand-written service worker, hand-rolled Web Push on WebCrypto. **No new dependencies.**
- One spec, two build phases. Phase 1 (PWA core, offline reading, offline queue) ships alone; phase 2 (push) behind `FEATURE_PUSH`.

## Constraints found in the repo

- SPA: Vite + React in `web/`, served by the Worker through `ASSETS`;
  `run_worker_first` covers everything except `/assets/*` and `/robots.txt`.
  Files in `web/public/` are served as-is by `env.ASSETS.fetch` (`worker/lib/meta.ts` `serveWithMeta`).
- `web/public/sw.js` today is a **kill-switch** for the old Astro site's service worker
  (unregisters itself, wipes caches). The new SW replaces it at the same URL, so
  old-Astro visitors upgrade straight to it; it must still delete every cache it does not own.
- All client writes go through `req()` in `web/src/api/client.ts`.
- Identity is anonymous: `X-Anon-Id` (localStorage, `web/src/lib/anon.ts`) → salted hash
  `actor_id` (`worker/lib/anon.ts`). Only `posts` stores `actor_id`; `comments` (record/case) has neither actor nor reply structure.
- `assets.realufo.org` returns `access-control-allow-origin: https://realufo.org`, so the SW can cache thumbnails as CORS (non-opaque) responses.
- `worker/router.ts` handlers receive `(req, env, params)` — no `ExecutionContext`.
- Cron runs every 3 h (`runTick` in `worker/index.ts`: X bot → social → polls).
- Web Push on iOS works only in an installed PWA (iOS 16.4+); iOS has no `beforeinstallprompt`.

---

## Phase 1a — Install

- `web/public/manifest.webmanifest`: `name` "RealUFO — Declassified UAP Archive", `short_name` "RealUFO",
  `start_url` `/`, `scope` `/`, `display` `standalone`, `background_color` and `theme_color` `#07080c`, icons below.
- Icons, rendered once from `favicon.svg` (pixel saucer on `#07080c`) and committed as PNGs (no build step):
  `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` (art inside the 80 % safe zone), `apple-touch-icon.png` (180).
- `web/index.html`: `<link rel="manifest">`, `<link rel="apple-touch-icon">`,
  `<meta name="apple-mobile-web-app-capable" content="yes">`, `apple-mobile-web-app-status-bar-style` `black-translucent`.
  Outside the `<!--META-->` markers so the Worker's meta swap leaves them alone.
- Install entry in `web/src/components/MoreMenu.tsx`: lucide `Download` icon, aria-label/title "Install app", no visible text beyond the menu's existing pattern.
  - Chrome/Edge/Android: capture `beforeinstallprompt`, call `prompt()` on tap.
  - iOS Safari: open a small sheet "Tap Share → Add to Home Screen".
  - Hidden when `matchMedia('(display-mode: standalone)')` or `navigator.standalone`, or when neither path is available.

## Phase 1b — Service worker and offline reading

File `web/public/sw.js` (plain JS, served at `/sw.js`, scope `/`). Registered from
`web/src/main.tsx` after `load`, production builds only (`import.meta.env.PROD`).

Routing decisions live in a pure function `route(url, method, mode)` → strategy name,
kept in `web/public/sw-route.js`, loaded by the SW with `importScripts('/sw-route.js')`. It assigns `self.swRoute = route`
(classic script, no module SW — Firefox/older Safari support is patchy); the vitest test evaluates the file against a fake `self`.

**install**
- `vite.config.ts`: `build.manifest: "asset-manifest.json"` (string form = file name in `dist/`, avoids the `.vite/` dot-directory).
- SW fetches `/asset-manifest.json`, precaches every hashed `/assets/*` file it lists (entries' `file`, `css`, `assets`), plus `/` (shell), `/manifest.webmanifest`, icons. `skipWaiting()`.

**activate**
- Delete every cache whose name is not one of ours (`ru-shell-v<N>`, `ru-assets`, `ru-api`, `ru-img`) — removes old Astro caches.
- Prune `ru-assets` entries not in the current manifest. `clients.claim()`.

**fetch**

| Request | Strategy |
|---|---|
| navigation (`mode === 'navigate'`) | network-first (keeps the Worker's pre-rendered meta/body fresh); offline → cached `/` shell |
| same-origin `/assets/*` | cache-first (`ru-assets`, immutable hashes) |
| same-origin GET `/api/*` | network-first with 5 s timeout → last cached copy (`ru-api`) |
| excluded: `/api/ask*`, `/api/asks/*`, `/api/file/*`, `/api/u/*`, `/api/health`, any non-GET | passthrough |
| `https://assets.realufo.org/` images (`/thumbs/`, share cards) | cache-first (`ru-img`), refetched with `mode: 'cors'`; opaque responses not cached; cap 300 entries, oldest evicted |
| PDFs, video, everything else | passthrough |

- Responses answered from `ru-api` because the network failed carry header `X-SW-Cache: 1`.
  `web/src/api/client.ts` sees it and flags the query client; the app shell shows a thin
  "Offline — showing saved copy" banner (lucide `WifiOff` + short text) until a live response arrives.
- Updates: new SW installs, `skipWaiting`, takes over; the next navigation gets the new shell. No "update available" prompt.

## Phase 1c — Offline post queue

Files: `web/src/api/client.ts` (hook), new `web/src/lib/outbox.ts`. No Background Sync API
(Chrome-only, iOS never fires it); the page flushes instead.

**Queue rule**
- A POST whose `fetch` rejects with a network error (`TypeError`) is stored in localStorage key `outbox`
  as `{ path, body, at }` and `req()` throws `QueuedError` (subclass of `ApiError`, `status: 0`).
  `navigator.onLine` is not used (unreliable).
- Queued paths: `/api/records/:id/comments`, `/api/cases/:slug/comments`, `/api/threads`,
  `/api/threads/:id/posts`, `/api/votes`, `/api/records/:id/verdict`, `/api/articles/:slug/poll`,
  `/api/shorts/:id/like`. Everything else (e.g. `/api/ask/:id/public`) fails normally.
- Body is `FormData` (image attached) → not queued; throw `ApiError(0, "Image posts need a connection")`.
- Caps: 50 items; items older than 7 days are dropped at flush.

**Caller UX**
- Mutation error handlers (`Composer.tsx` and the vote/verdict/poll/like call sites) treat `QueuedError` as success-ish:
  toast "Saved offline — will post when back online", Composer closes and clears the draft.
  New-thread composer does not navigate (no id yet).
- No faked optimistic counts; toggles replay in order on flush, so tap-twice = net zero, same as the server.

**Flush**
- Triggers: `online` event, app start, `visibilitychange` → visible.
- Single-flight (module-level promise), oldest first, sequential, original `X-Anon-Id` (same browser, same id).
- 2xx → remove, invalidate React Query keys for the affected record/thread/case.
  429 → stop, keep the rest for the next trigger. Network error → stop. Other 4xx/5xx → drop the item, collect its error.
- One summary toast: "2 offline posts sent" and/or "1 couldn't post: ‹server error›".
- Known gap: request reached the server but the response was lost → the item is re-sent later, duplicate post.
  Accepted; marked `ponytail:` in code — add an idempotency-key header if duplicates show up.

---

## Phase 2a — Push data model

Migration `db/migrations/0035_push.sql` (latest existing is `0033_*`; re-check before writing, other chats add migrations):

```sql
CREATE TABLE push_subs (
  endpoint TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,           -- salted anon id, same hash as votes/posts
  p256dh TEXT NOT NULL, auth TEXT NOT NULL,
  replies INTEGER NOT NULL DEFAULT 1,
  new_files INTEGER NOT NULL DEFAULT 0,
  daily INTEGER NOT NULL DEFAULT 1,
  fail_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_push_subs_actor ON push_subs(actor_id);
CREATE TABLE follows (
  actor_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('thread','record','case','hub')),
  key TEXT NOT NULL,                -- thread id | record id | case slug | 'agency/<slug>' | 'topic/<slug>' | 'location/<slug>'
  src TEXT NOT NULL CHECK(src IN ('auto','bell')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (actor_id, kind, key)
);
CREATE INDEX idx_follows_target ON follows(kind, key);
CREATE TABLE push_state (k TEXT PRIMARY KEY, v TEXT NOT NULL);   -- watermarks, per-target throttle
```

- Follows are keyed by `actor_id`, not by subscription: posting creates the follow even before push is enabled, and enabling later just works. Multiple devices = one anon id each (current model).
- "Reply to my post/comment" = **auto-follow**: creating a thread, post, record comment or case comment inserts
  `INSERT OR IGNORE … src='auto'` for that target. `src='auto'` rows notify only when the sub's `replies = 1`; `src='bell'` rows always notify.
- A later bell tap upgrades `auto` → `bell`; un-belling deletes the row.
- Release hubs are not followable (new files always arrive under a new release slug); `new_files = 1` covers "everything new".

## Phase 2b — Push API (Worker)

All requests carry `X-Anon-Id`; caller `actor_id` via `actorId()`. Writes rate-limited with `worker/lib/ratelimit.ts`.

- `GET /api/push/config` → `{ publicKey }` from var `VAPID_PUBLIC_KEY`.
- `POST /api/push/subscribe` `{ subscription: {endpoint, keys:{p256dh, auth}}, prefs? }` → upsert.
  Endpoint must be `https:`. Upsert by endpoint sets `actor_id` to the caller: the endpoint is an unguessable capability URL known only to the subscribing browser, so whoever presents it owns it.
- `POST /api/push/prefs` `{ endpoint, replies?, new_files?, daily? }` — caller must own the endpoint.
- `POST /api/push/unsubscribe` `{ endpoint }` — caller must own it; deletes the sub (follows stay; they cost nothing and keep working if re-enabled).
- `GET /api/push/me?endpoint=` → `{ prefs, follows: [{kind, key, title, url}] }` (titles joined from threads/records/cases/hub labels).
- `POST /api/follows` `{ kind, key, on }` → `{ following }`. Unknown target → 404.
- `GET /api/follows?kind=&key=` → `{ following }` (bell state).
- `/api/bootstrap` gains `push: boolean` (`FEATURE_PUSH === 'on'`); the client hides bells/settings when false.
- `worker/router.ts`: `dispatch(req, env, ctx)` passes `ctx` as a 4th handler argument so write routes can `ctx.waitUntil(...)`. Existing handlers ignore it.

## Phase 2c — Push UI (web)

- Bell button (lucide `Bell` / `BellRing`, aria-label + title, no text) in the header of `/doc/:id`, `/thread/:id`, `/case/:slug`, `/agency/:slug`, `/topic/:slug`, location hubs.
- First bell tap or first toggle in settings:
  1. iOS and not standalone → install sheet "Add to Home Screen to get notifications". Stop.
  2. `Notification.requestPermission()` (only ever from a user gesture, never on load).
  3. Denied → toast explaining how to re-enable in browser/OS settings.
  4. Granted → `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` → `/api/push/subscribe` → follow.
- More menu → "Notifications" sheet: enable switch; toggles "Replies to my posts", "All new files", "Daily pick"; list of followed items with remove buttons.
- SW `push` handler: `showNotification(title, { body, icon: '/icon-192.png', badge, tag, data: { url } })`.
  `notificationclick`: focus an open window and navigate it to `url`, else `clients.openWindow(url)`.
  `pushsubscriptionchange`: resubscribe and POST the new subscription.

## Phase 2d — Senders (Worker)

**`worker/lib/webpush.ts`** (WebCrypto only)
- `vapidAuth(endpoint, env)`: ES256 JWT, `aud` = endpoint origin, `exp` now + 12 h, `sub` `mailto:` contact; header `Authorization: vapid t=<jwt>, k=<publicKey>`. Cached per origin per invocation.
- `encrypt(sub, payload)`: RFC 8291 `aes128gcm` — ephemeral ECDH P-256, HKDF-SHA-256 (auth secret, then CEK/nonce), AES-128-GCM, single record.
- `send(sub, json, { ttl, urgency, topic })`. Response 404/410 → delete sub. Other failure → `fail_count + 1`, delete at 5. Success → `fail_count = 0`.

**`worker/lib/push.ts`** — `notify(env, recipients, payload)`: dedupe by endpoint, never the author's own `actor_id`, parallel batches.
Payload `{ title, body, url, tag }`, body ≤ 100 chars. All senders no-op unless `FEATURE_PUSH === 'on'`.

**Triggers**
1. **Activity** (replies + bell follows) — in `createThread`/`createPost` (posts.ts, threads.ts), `addComment` (comments.ts), `addCaseComment` (cases.ts):
   `ctx.waitUntil(pushActivity(env, kind, key, authorActor, snippet))`.
   Recipients: `follows` on `(kind, key)` joined to `push_subs`, excluding the author; `src='auto'` only where `replies = 1`.
   Text "New reply in ‹thread title›" / "New comment on ‹record id›", url `/thread/ID` / `/doc/ID` / `/case/slug`, tag `<kind>:<key>`.
   Throttle: at most one push per target per 10 min (`push_state` key `act:<kind>:<key>`), so a hot thread doesn't buzz phones; the `tag` collapses the rest.
2. **New files** — in `runTick` (every 3 h): `records` with `status = 'live'` and `created_at` > watermark (`push_state` `new_files`).
   Recipients: subs with `new_files = 1`, plus actors following a hub the new records belong to — agency via `AGENCY_HUBS` values, topic via `topicWhere` rules, location via `LOCATION_HUBS`.
   One digest per sub: "12 new files — DOW-UAP, FBI" → `/archive` (a single file → `/doc/ID`). Watermark advances to the newest `created_at` seen.
   First run with no watermark only sets it to now (no backlog flood).
3. **Daily pick** — in `runTick` after the X bot: `x_posts` that became `posted` since watermark `daily` → subs with `daily = 1`; title "RealUFO pick", body = first line of the post text, url = the record/story URL. At most one per tick.

**Limits and rollout**
- Workers cap subrequests per invocation (~1000 on paid). A send covers ~900 recipients; `ponytail:` comment — move fan-out to Cloudflare Queues when subscriptions approach that.
- Flag `FEATURE_PUSH` (`off` | `on`) in `wrangler.jsonc` vars, default `off` until verified live.
- VAPID keys: one-off script `scripts/vapid-keys.mjs` prints a P-256 keypair (WebCrypto); public key → `VAPID_PUBLIC_KEY` var, private (JWK `d`) → `wrangler secret put VAPID_PRIVATE_KEY`.
- `/privacy` page: one line — push endpoint, notification prefs and follows are stored against the anonymous id; unsubscribing deletes the endpoint.

---

## Testing

Phase 1
- vitest: `route()` table (every row above, incl. exclusions and cross-origin images).
- vitest: outbox — queues on `TypeError` only (not on 4xx), rejects `FormData`, caps/expiry, flush order, 429 stops, 4xx drops, single-flight lock.
- Manual in browser pane: manifest + SW registered (DevTools Application), installability; visit a doc page, go offline, reload → page renders with the offline banner; post a comment offline → toast; back online → posted.

Phase 2
- worker vitest: `encrypt` against the RFC 8291 §5 example (fixed salt/ephemeral key injected); VAPID JWT sign → verify with the public key.
- worker vitest (local D1): recipient selection — author excluded, `replies` pref respected for `auto`, `bell` always, hub matching for agency/topic; new-files first run only sets watermark; 410 response deletes the sub; throttle suppresses a second activity push within 10 min.
- Manual: real Chrome subscription in the browser pane with `FEATURE_PUSH=on` locally, reply from a second anon id → notification; `/__tick` → new-files/daily paths. iOS installed-PWA push needs a real device (user).

## Out of scope

- Offline image posts (would need IndexedDB blobs).
- "Save offline" pinning of PDFs/videos.
- Background Sync, periodic sync, app badges, update-available prompt.
- Accounts / cross-device follow sync.
- Queues-based fan-out (until subscriber count requires it).
