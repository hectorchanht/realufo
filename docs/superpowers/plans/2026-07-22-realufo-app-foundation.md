# RealUFO App Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a live, mobile-first React SPA on a single Cloudflare Worker (D1 + R2) that matches the `RealUFO.dc.html` prototype exactly and wires anonymous discussion — including comment→board promotion — end-to-end.

**Architecture:** One Cloudflare Worker serves the built Vite SPA via Static Assets and hosts `/api/*` JSON routes backed by D1; media reads come from the existing `realufo` R2 bucket at `assets.realufo.org`. Deep-link routes (`/doc/:id`, `/case/:slug`, `/thread/:id`) get per-route `<meta>`/OG tags injected by the Worker. Develop local-first with `wrangler dev`; provision + deploy once green.

**Tech Stack:** React 18 + Vite + TypeScript + Tailwind + lucide-react + TanStack Query + react-router (web); Cloudflare Workers + D1 + R2 + `@cloudflare/vitest-pool-workers` (backend); pnpm.

## Global Constraints

- Node `>=22 <23`; package manager pnpm.
- Prototype `realufo-handoff/RealUFO.dc.html` is the authoritative source for markup, styling, and interaction. Match the CRT aesthetic exactly. `realufo-handoff/data.js` is the authoritative seed dataset.
- Palette / theme tokens copied verbatim from prototype `:root`, `[data-theme="light"]`, `[data-accent="cyan|amber|violet"]` (plan Task 12).
- Fonts: `Press Start 2P` (pixel logo/section headers, sparingly), `JetBrains Mono` (metadata/chrome), `Space Grotesk` (body). Self-hosted via `@fontsource*` — no runtime Google Fonts fetch.
- Minimum tap target 44px. Respect `prefers-reduced-motion` and `prefers-color-scheme`.
- No AI-slop gradients, no emoji-as-icons (lucide-react + inline pixel saucer SVG only).
- App reads only D1 + `cdn_url` (assets.realufo.org). Never fetch an origin URL at runtime.
- Anonymous by default. Anon identity = localStorage UUID sent as `X-Anon-Id`; server stores only `SHA-256(anon + SALT)` as `actor_id`.
- CF account for deploy: Flow Account `280bedba354e1a13c921727f30686447`. R2 bucket `realufo` (exists). D1 `realufo-db` (create). GitHub: `hectorchanht/realufo` (public).
- `FEATURE_AUTH=false` — login is a stub in this spec.
- TDD: failing test → minimal impl → green → commit. Frequent commits.

---

## File Structure

```
realufo/
  package.json                 # root: pnpm scripts orchestrate web+worker
  wrangler.jsonc               # main=worker/index.ts; assets→web/dist; DB+MEDIA bindings; vars
  tsconfig.json                # base
  .dev.vars                    # local secrets (ANON_SALT); gitignored
  worker/
    index.ts                   # fetch entry: route /api/* else asset+meta
    router.ts                  # tiny method+path matcher
    env.ts                     # Env type
    lib/
      db.ts                    # D1 query helpers, id/no generators, relative-time
      anon.ts                  # actorId(request, salt)
      json.ts                  # json(), error() responses
      meta.ts                  # injectMeta(html, entity)
    routes/
      health.ts  bootstrap.ts  feed.ts  records.ts  comments.ts
      boards.ts  threads.ts  posts.ts  votes.ts  cases.ts  auth.ts
    tests/                     # *.spec.ts (vitest-pool-workers)
  web/
    index.html                 # has <!--META--> placeholder
    vite.config.ts  tailwind.config.ts  postcss.config.js  tsconfig.json
    src/
      main.tsx  App.tsx  router.tsx
      theme/ theme.css  ThemeProvider.tsx  useTheme.ts
      api/ types.ts  client.ts  queries.ts
      lib/ useMediaQuery.ts  time.ts  map.ts
      components/ Saucer.tsx StanceTag.tsx VoteButton.tsx DocCard.tsx
                  ThreadRow.tsx BoardRow.tsx Ticker.tsx AppShell.tsx
                  TopNav.tsx BottomTab.tsx AppBar.tsx
      overlays/ OverlayProvider.tsx Composer.tsx MediaViewer.tsx LoginSheet.tsx Toast.tsx
      screens/ Feed.tsx Archive.tsx Doc.tsx Boards.tsx Board.tsx Thread.tsx Case.tsx Map.tsx
      tests/ *.test.tsx
  db/
    schema.sql
    migrations/0001_init.sql
    seed.ts                    # data.js → local D1 via wrangler d1 execute
    seed.spec.ts
  docs/superpowers/{specs,plans}/
  realufo-handoff/             # prototype + data.js (reference + seed source)
```

---

## Task 1: Repo scaffold + Worker/SPA skeleton

**Files:**
- Create: `package.json`, `wrangler.jsonc`, `tsconfig.json`, `.dev.vars`, `worker/index.ts`, `worker/env.ts`, `worker/router.ts`, `worker/lib/json.ts`, `worker/routes/health.ts`, `worker/tests/health.spec.ts`, `worker/vitest.config.ts`, `web/` (Vite React-TS app), `web/index.html`
- Test: `worker/tests/health.spec.ts`

**Interfaces:**
- Produces: `Env` (`{ DB: D1Database; MEDIA: R2Bucket; ASSETS: Fetcher; ANON_SALT: string; FEATURE_AUTH: string }`); `json(data, init?)`, `error(status, msg)`; `handle(request, env)` fetch entry.

- [ ] **Step 1: Create root `package.json`**
```json
{
  "name": "realufo",
  "private": true,
  "engines": { "node": ">=22 <23" },
  "packageManager": "pnpm@9.15.9",
  "scripts": {
    "dev:web": "pnpm -C web dev",
    "build:web": "pnpm -C web build",
    "dev": "pnpm build:web && wrangler dev",
    "deploy": "pnpm build:web && wrangler deploy",
    "db:migrate:local": "wrangler d1 migrations apply realufo-db --local",
    "db:migrate": "wrangler d1 migrations apply realufo-db --remote",
    "db:seed:local": "tsx db/seed.ts --local",
    "db:seed": "tsx db/seed.ts --remote",
    "test:worker": "vitest run --config worker/vitest.config.ts",
    "test:web": "pnpm -C web test"
  },
  "devDependencies": {
    "wrangler": "^3.90.0",
    "@cloudflare/vitest-pool-workers": "^0.5.0",
    "vitest": "^2.1.0",
    "typescript": "~5.6.0",
    "tsx": "^4.19.0"
  }
}
```

- [ ] **Step 2: Create `wrangler.jsonc`**
```jsonc
{
  "name": "realufo",
  "main": "worker/index.ts",
  "compatibility_date": "2026-07-01",
  "compatibility_flags": ["nodejs_compat"],
  "assets": { "directory": "web/dist", "binding": "ASSETS", "not_found_handling": "single-page-application" },
  "vars": { "FEATURE_AUTH": "false" },
  "d1_databases": [{ "binding": "DB", "database_name": "realufo-db", "database_id": "local", "migrations_dir": "db/migrations" }],
  "r2_buckets": [{ "binding": "MEDIA", "bucket_name": "realufo" }]
}
```
Note: `database_id` gets its real UUID at Task 25 (provisioning). `local` is a placeholder for `--local` dev.

- [ ] **Step 3: Create `.dev.vars`** (gitignored)
```
ANON_SALT=dev-local-salt-change-me
```

- [ ] **Step 4: Scaffold the web app**
```bash
pnpm dlx create-vite@latest web --template react-ts
cd web && pnpm add @tanstack/react-query react-router-dom lucide-react \
  @fontsource/press-start-2p @fontsource/jetbrains-mono @fontsource/space-grotesk
pnpm add -D tailwindcss@^3 postcss autoprefixer @testing-library/react @testing-library/jest-dom jsdom vitest
pnpm dlx tailwindcss init -p
cd ..
```
Edit `web/index.html` `<head>` to include the placeholder comment on its own line: `<!--META-->`.

- [ ] **Step 5: Write `worker/env.ts`, `worker/lib/json.ts`, `worker/router.ts`, `worker/routes/health.ts`**
```typescript
// worker/env.ts
export interface Env {
  DB: D1Database; MEDIA: R2Bucket; ASSETS: Fetcher;
  ANON_SALT: string; FEATURE_AUTH: string;
}
```
```typescript
// worker/lib/json.ts
export const json = (data: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...(init.headers ?? {}) },
  });
export const error = (status: number, message: string) => json({ error: message }, { status });
```
```typescript
// worker/routes/health.ts
import { json } from "../lib/json";
export const health = () => json({ ok: true, service: "realufo" });
```
```typescript
// worker/router.ts
type H = (req: Request, env: import("./env").Env, params: Record<string,string>) => Response | Promise<Response>;
interface Route { method: string; pattern: URLPattern; handler: H; }
const routes: Route[] = [];
export const on = (method: string, path: string, handler: H) =>
  routes.push({ method, pattern: new URLPattern({ pathname: path }), handler });
export async function dispatch(req: Request, env: import("./env").Env): Promise<Response | null> {
  const url = new URL(req.url);
  for (const r of routes) {
    if (r.method !== req.method) continue;
    const m = r.pattern.exec({ pathname: url.pathname });
    if (m) return r.handler(req, env, m.pathname.groups as Record<string,string>);
  }
  return null;
}
```

- [ ] **Step 6: Write `worker/index.ts`**
```typescript
import type { Env } from "./env";
import { on, dispatch } from "./router";
import { error } from "./lib/json";
import { health } from "./routes/health";

on("GET", "/api/health", health);

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) {
      const res = await dispatch(req, env);
      return res ?? error(404, "not found");
    }
    return env.ASSETS.fetch(req); // SPA + assets; meta-injection added in Task 11
  },
};
```

- [ ] **Step 7: Write `worker/vitest.config.ts`**
```typescript
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";
export default defineWorkersConfig({
  test: {
    include: ["worker/tests/**/*.spec.ts"],
    poolOptions: { workers: { wrangler: { configPath: "./wrangler.jsonc" }, miniflare: { compatibilityFlags: ["nodejs_compat"] } } },
  },
});
```

- [ ] **Step 8: Write the failing test `worker/tests/health.spec.ts`**
```typescript
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "../index";

describe("health", () => {
  it("returns ok", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("https://x/api/health"), env as any, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, service: "realufo" });
  });
});
```

- [ ] **Step 9: Install + run test — expect PASS**
Run: `pnpm install && pnpm test:worker`
Expected: `health > returns ok` PASSES.

- [ ] **Step 10: Verify web builds**
Run: `pnpm build:web`
Expected: `web/dist/index.html` exists containing `<!--META-->`.

- [ ] **Step 11: Commit**
```bash
git add -A && git commit -m "feat: scaffold worker + vite SPA skeleton with health route"
```

---

## Task 2: D1 schema + migration

**Files:**
- Create: `db/schema.sql`, `db/migrations/0001_init.sql`, `worker/tests/schema.spec.ts`

**Interfaces:**
- Produces: tables `archives, boards, cases, records, assets, threads, posts, comments, sightings, users, votes, stats, ticker` (create order respects FKs).

Refines spec §5: `threads` gains `tags TEXT, reply_count INTEGER, img_count INTEGER, mins INTEGER`; `posts` gains `image_kind TEXT, image_label TEXT`; created in FK-safe order.

- [ ] **Step 1: Write the failing test `worker/tests/schema.spec.ts`**
```typescript
import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";

const EXPECTED = ["archives","assets","boards","cases","comments","posts","records","sightings","stats","threads","ticker","users","votes"];
describe("schema", () => {
  it("has all tables", async () => {
    const { results } = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name"
    ).all<{ name: string }>();
    expect(results.map(r => r.name)).toEqual(EXPECTED);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`pnpm test:worker` → no such tables)

- [ ] **Step 3: Write `db/migrations/0001_init.sql`** — full DDL in FK-safe order:
```sql
CREATE TABLE archives (id TEXT PRIMARY KEY, label TEXT, flag TEXT, accent TEXT, count INTEGER, coord TEXT);
CREATE TABLE boards (id TEXT PRIMARY KEY, slug TEXT, name TEXT, desc TEXT, accent TEXT, icon TEXT, online INTEGER DEFAULT 0, thread_count INTEGER DEFAULT 0);
CREATE TABLE cases (slug TEXT PRIMARY KEY, name TEXT, archive TEXT, archive_label TEXT, accent TEXT, coord TEXT, lede TEXT, pull TEXT, pull_cite TEXT, status TEXT);
CREATE TABLE records (
  id TEXT PRIMARY KEY, archive TEXT REFERENCES archives(id), agency TEXT, agency_full TEXT,
  title TEXT, summary TEXT, incident_date TEXT, location TEXT, doc_date TEXT,
  kind TEXT CHECK(kind IN ('pdf','image','video')) DEFAULT 'pdf',
  redacted INTEGER DEFAULT 0, featured INTEGER DEFAULT 0, virin TEXT,
  source_url TEXT, source_site TEXT, retrieved_at TEXT, license TEXT,
  status TEXT CHECK(status IN ('pending','fetched','processed','live','failed')) DEFAULT 'live',
  checksum TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE INDEX idx_records_archive ON records(archive);
CREATE INDEX idx_records_kind ON records(kind);
CREATE TABLE assets (id INTEGER PRIMARY KEY AUTOINCREMENT, record_id TEXT REFERENCES records(id),
  role TEXT CHECK(role IN ('thumb','full','original')), r2_key TEXT, cdn_url TEXT, mime TEXT, width INTEGER, height INTEGER, bytes INTEGER);
CREATE INDEX idx_assets_record ON assets(record_id);
CREATE TABLE threads (
  id TEXT PRIMARY KEY, no INTEGER, board_id TEXT REFERENCES boards(id),
  title TEXT, stance TEXT, op_body TEXT, op_handle TEXT, op_id TEXT, tags TEXT,
  votes INTEGER DEFAULT 0, reply_count INTEGER DEFAULT 0, img_count INTEGER DEFAULT 0, mins INTEGER,
  source_record_id TEXT REFERENCES records(id), case_slug TEXT REFERENCES cases(slug),
  hot INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')));
CREATE INDEX idx_threads_board ON threads(board_id);
CREATE INDEX idx_threads_source ON threads(source_record_id);
CREATE INDEX idx_threads_case ON threads(case_slug);
CREATE TABLE posts (
  id TEXT PRIMARY KEY, no INTEGER, thread_id TEXT REFERENCES threads(id),
  body TEXT, handle TEXT, stance TEXT, votes INTEGER DEFAULT 0,
  source_record_id TEXT REFERENCES records(id), image_r2_key TEXT, image_kind TEXT, image_label TEXT,
  reply_to TEXT, is_op INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')));
CREATE INDEX idx_posts_thread ON posts(thread_id);
CREATE TABLE comments (
  id TEXT PRIMARY KEY, no INTEGER, record_id TEXT REFERENCES records(id),
  body TEXT, handle TEXT, stance TEXT, votes INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')));
CREATE INDEX idx_comments_record ON comments(record_id);
CREATE TABLE sightings (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, lat REAL, lng REAL, count INTEGER, accent TEXT, case_slug TEXT REFERENCES cases(slug));
CREATE TABLE users (id TEXT PRIMARY KEY, handle TEXT, email TEXT, google_sub TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE votes (id INTEGER PRIMARY KEY AUTOINCREMENT, actor_id TEXT, target_type TEXT CHECK(target_type IN ('thread','post','comment')), target_id TEXT, created_at TEXT DEFAULT (datetime('now')), UNIQUE(actor_id, target_type, target_id));
CREATE TABLE stats (id INTEGER PRIMARY KEY CHECK(id=1), json TEXT);
CREATE TABLE ticker (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT, board TEXT, text TEXT, ago TEXT, sort INTEGER);
```
Copy the same content into `db/schema.sql` (reference copy).

- [ ] **Step 4: Apply locally**
Run: `pnpm db:migrate:local`
Expected: "Migrations applied".

- [ ] **Step 5: Run test — expect PASS** (`pnpm test:worker`)
Note: the vitest-pool-workers config auto-applies `migrations_dir` to the test D1. If the test D1 is empty, add to `worker/vitest.config.ts` miniflare: `d1Databases: { DB: ":memory:" }` and apply migrations in a `beforeAll` via `applyD1Migrations` from `cloudflare:test`. Use:
```typescript
// top of schema.spec.ts
import { applyD1Migrations, env } from "cloudflare:test";
import { beforeAll } from "vitest";
beforeAll(async () => { await applyD1Migrations(env.DB, env.TEST_MIGRATIONS); });
```
and in config `miniflare: { d1Migrations: { DB: "./db/migrations" } }` exposing `TEST_MIGRATIONS`. (Follow current `@cloudflare/vitest-pool-workers` migration-testing docs.)

- [ ] **Step 6: Commit**
```bash
git add -A && git commit -m "feat: D1 schema + initial migration"
```

---

## Task 3: Seed script (data.js → D1)

**Files:**
- Create: `db/seed.ts`, `db/seed.spec.ts`
- Read: `realufo-handoff/data.js`

**Interfaces:**
- Produces: a runnable seed that emits SQL and executes via `wrangler d1 execute realufo-db (--local|--remote) --file`. Exposes `buildSeedSQL(D): string` (pure, unit-testable).
- Consumes: `window.UFO_DATA` shape (records/cases/archives/boards/threads/threadPosts/docComments/ticker/mapPoints/stats).

Mapping rules (authoritative):
- **records:** `desc`→`summary`, `type` PDF→`pdf`/VIDEO→`video`/else `image`, `releaseDate`→`doc_date`, bools→0/1, `license='public-domain-usgov'`, `source_site=archive`, `source_url=url`, `status='live'`. Per record create **assets**: `{role:'thumb', cdn_url:thumb}` and `{role:'full', cdn_url:url, mime: kind==='pdf'?'application/pdf':...}` (skip null urls).
- **threads:** `board`→`board_id`, `op`→`op_body`, `opHandle`→`op_handle`, `opId`→`op_id`, `rec`→`source_record_id` (only if in recMap, else null), `caseSlug`→`case_slug`, `tags`→`JSON.stringify`, `replies`→`reply_count`, `imgs`→`img_count`, `mins`→`mins`, `hot`→0/1, `created_at = now - mins minutes`.
- **posts** (from `threadPosts[threadId]`): `op:true`→`is_op=1`; `img`: if `img.rec` in recMap → `source_record_id=img.rec, image_kind=img.kind, image_label=img.label`; else `image_kind=img.kind||'placeholder', image_label=img.label`; `replyTo`→`JSON.stringify(reply_to)`; `created_at` from parsed `ago`.
- **comments** (from `docComments[recordId]`): straight map; `created_at` from `ago`.
- **boards:** `desc`→`desc`, `threads`→`thread_count`, `online`,`accent`,`icon`,`slug`,`name`.
- **cases:** map incl `archiveLabel`→`archive_label`, `pullCite`→`pull_cite`.
- **sightings** (from `mapPoints`): `n`→`count`, `slug`→`case_slug`, keep `lat,lng,name,accent`.
- **stats:** `INSERT INTO stats(id,json) VALUES(1, <JSON.stringify(D.stats)>)`.
- **ticker:** rows with `sort = index`.
- `ago` parser: `now`→0; `(\d+)s`→sec; `(\d+)m`→min; `(\d+)h`→hr; `(\d+)d`→day → minutes offset; `created_at = datetime('now', '-<mins> minutes')`.

- [ ] **Step 1: Write the failing test `db/seed.spec.ts`**
```typescript
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { buildSeedSQL, loadData } from "./seed";

const D = loadData("realufo-handoff/data.js");
describe("buildSeedSQL", () => {
  const sql = buildSeedSQL(D);
  it("inserts every record", () => {
    expect((sql.match(/INSERT INTO records/g) || []).length).toBe(D.records.length);
  });
  it("creates a thumb + full asset per record that has thumb and url", () => {
    const withBoth = D.records.filter((r:any)=>r.thumb && r.url).length;
    expect((sql.match(/INSERT INTO assets.*'thumb'/g) || []).length).toBeGreaterThanOrEqual(withBoth);
  });
  it("maps PDF type to kind pdf and escapes quotes", () => {
    expect(sql).toContain("'pdf'");
    expect(sql).not.toMatch(/[^']'[^',)]/); // naive: no unescaped stray quotes (see escape() )
  });
  it("links a promoted-thread source_record_id for threads with rec", () => {
    const withRec = D.threads.filter((t:any)=>t.rec).length;
    expect((sql.match(/INSERT INTO threads/g)||[]).length).toBe(D.threads.length);
    expect(withRec).toBeGreaterThan(0);
  });
  it("seeds exactly one stats row", () => {
    expect((sql.match(/INSERT INTO stats/g)||[]).length).toBe(1);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`pnpm test:worker` won't run node-fs test; run `pnpm dlx vitest run db/seed.spec.ts` — module not found)

- [ ] **Step 3: Implement `db/seed.ts`** with `loadData`, `escape`, `agoToMinutes`, `buildSeedSQL`, and a CLI tail:
```typescript
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

export function loadData(path: string): any {
  const src = readFileSync(path, "utf8");
  const g: any = {}; const window = g;
  // data.js is `window.UFO_DATA = {...};`
  new Function("window", src)(window);
  return window.UFO_DATA;
}
const q = (v: unknown) => v === null || v === undefined ? "NULL" : `'${String(v).replace(/'/g, "''")}'`;
const n = (v: unknown) => v === null || v === undefined || v === "" ? "NULL" : Number(v);
const b = (v: unknown) => (v ? 1 : 0);
export function agoToMinutes(ago?: string): number {
  if (!ago || ago === "now") return 0;
  const m = /^(\d+)\s*([smhd])$/.exec(ago.trim()); if (!m) return 0;
  const x = +m[1]; return m[2] === "s" ? Math.round(x/60) : m[2] === "m" ? x : m[2] === "h" ? x*60 : x*1440;
}
const kindOf = (t?: string) => t === "VIDEO" ? "video" : t === "IMAGE" ? "image" : "pdf";
const created = (mins: number) => `datetime('now','-${mins} minutes')`;

export function buildSeedSQL(D: any): string {
  const recIds = new Set(D.records.map((r:any)=>r.id));
  const lines: string[] = ["PRAGMA foreign_keys=OFF;", "BEGIN;"];
  for (const a of D.archives) lines.push(`INSERT INTO archives(id,label,flag,accent,count,coord) VALUES(${q(a.id)},${q(a.label)},${q(a.flag)},${q(a.accent)},${n(a.count)},${q(a.coord)});`);
  for (const bd of D.boards) lines.push(`INSERT INTO boards(id,slug,name,desc,accent,icon,online,thread_count) VALUES(${q(bd.id)},${q(bd.slug)},${q(bd.name)},${q(bd.desc)},${q(bd.accent)},${q(bd.icon)},${n(bd.online)},${n(bd.threads)});`);
  for (const c of D.cases) lines.push(`INSERT INTO cases(slug,name,archive,archive_label,accent,coord,lede,pull,pull_cite,status) VALUES(${q(c.slug)},${q(c.name)},${q(c.archive)},${q(c.archiveLabel)},${q(c.accent)},${q(c.coord)},${q(c.lede)},${q(c.pull)},${q(c.pullCite)},${q(c.status)});`);
  for (const r of D.records) {
    lines.push(`INSERT INTO records(id,archive,agency,agency_full,title,summary,incident_date,location,doc_date,kind,redacted,featured,virin,source_url,source_site,license,status) VALUES(${q(r.id)},${q(r.archive)},${q(r.agency)},${q(r.agencyFull)},${q(r.title)},${q(r.desc)},${q(r.incidentDate)},${q(r.location)},${q(r.releaseDate)},${q(kindOf(r.type))},${b(r.redacted)},${b(r.featured)},${q(r.virin)},${q(r.url)},${q(r.archive)},'public-domain-usgov','live');`);
    if (r.thumb) lines.push(`INSERT INTO assets(record_id,role,cdn_url,mime) VALUES(${q(r.id)},'thumb',${q(r.thumb)},'image/jpeg');`);
    if (r.url) lines.push(`INSERT INTO assets(record_id,role,cdn_url,mime) VALUES(${q(r.id)},'full',${q(r.url)},${q(kindOf(r.type)==='pdf'?'application/pdf':kindOf(r.type)==='video'?'video/mp4':'image/jpeg')});`);
  }
  for (const t of D.threads) {
    const rec = t.rec && recIds.has(t.rec) ? t.rec : null;
    lines.push(`INSERT INTO threads(id,no,board_id,title,stance,op_body,op_handle,op_id,tags,votes,reply_count,img_count,mins,source_record_id,case_slug,hot,created_at) VALUES(${q(t.id)},${n(t.no)},${q(t.board)},${q(t.title)},${q(t.stance)},${q(t.op)},${q(t.opHandle)},${q(t.opId)},${q(JSON.stringify(t.tags||[]))},${n(t.votes)},${n(t.replies)},${n(t.imgs)},${n(t.mins)},${q(rec)},${q(t.caseSlug)},${b(t.hot)},${created(agoToMinutes(t.ago)|| (t.mins??0))});`);
  }
  for (const [tid, posts] of Object.entries<any>(D.threadPosts || {})) {
    for (const p of posts as any[]) {
      const rec = p.img && p.img.rec && recIds.has(p.img.rec) ? p.img.rec : null;
      const ik = p.img ? (rec ? p.img.kind : (p.img.kind || "placeholder")) : null;
      const il = p.img ? (p.img.label || null) : null;
      lines.push(`INSERT INTO posts(id,no,thread_id,body,handle,stance,votes,source_record_id,image_kind,image_label,reply_to,is_op,created_at) VALUES(${q(p.id)},${n(p.no)},${q(tid)},${q(p.body)},${q(p.handle)},${q(p.stance)},${n(p.votes)},${q(rec)},${q(ik)},${q(il)},${q(JSON.stringify(p.replyTo||[]))},${b(p.op)},${created(agoToMinutes(p.ago))});`);
    }
  }
  for (const [rid, cs] of Object.entries<any>(D.docComments || {})) {
    for (const c of cs as any[]) lines.push(`INSERT INTO comments(id,no,record_id,body,handle,stance,votes,created_at) VALUES(${q(c.id)},${n(c.no)},${q(rid)},${q(c.body)},${q(c.handle)},${q(c.stance)},${n(c.votes)},${created(agoToMinutes(c.ago))});`);
  }
  for (const p of D.mapPoints || []) lines.push(`INSERT INTO sightings(name,lat,lng,count,accent,case_slug) VALUES(${q(p.name)},${n(p.lat)},${n(p.lng)},${n(p.n)},${q(p.accent)},${q(p.slug)});`);
  for (let i=0;i<(D.ticker||[]).length;i++){ const t=D.ticker[i]; lines.push(`INSERT INTO ticker(kind,board,text,ago,sort) VALUES(${q(t.kind)},${q(t.board)},${q(t.text)},${q(t.ago)},${i});`); }
  lines.push(`INSERT INTO stats(id,json) VALUES(1,${q(JSON.stringify(D.stats||{}))});`);
  lines.push("COMMIT;");
  return lines.join("\n");
}

if (process.argv[1] && process.argv[1].endsWith("seed.ts")) {
  const remote = process.argv.includes("--remote");
  const D = loadData("realufo-handoff/data.js");
  const sql = buildSeedSQL(D);
  writeFileSync("db/.seed.sql", sql);
  execSync(`wrangler d1 execute realufo-db ${remote ? "--remote" : "--local"} --file db/.seed.sql`, { stdio: "inherit" });
}
```
Add `db/.seed.sql` to `.gitignore`.

- [ ] **Step 4: Run — expect PASS** (`pnpm dlx vitest run db/seed.spec.ts`)

- [ ] **Step 5: Seed local D1 + smoke count**
Run: `pnpm db:seed:local && wrangler d1 execute realufo-db --local --command "SELECT (SELECT count(*) FROM records) r,(SELECT count(*) FROM threads) t,(SELECT count(*) FROM comments) c,(SELECT count(*) FROM assets) a;"`
Expected: `r=28`, `t=12`, `c≈15`, `a≈56`.

- [ ] **Step 6: Commit**
```bash
git add -A && git commit -m "feat: data.js → D1 seed builder + local seed"
```

---

## Task 4: Worker lib — db helpers, anon actor, response utils

**Files:**
- Create: `worker/lib/db.ts`, `worker/lib/anon.ts`
- Test: `worker/tests/anon.spec.ts`

**Interfaces:**
- Produces: `actorId(req, salt): Promise<string>` (SHA-256 hex of anon header + salt; `"anon:none"` if no header); `newId(): string` (8-hex uppercase, matches prototype `_newId`); `newNo(): number` (24.4M+random, matches prototype); `relAgo(created_at): string` (server-side "14m"/"2h").

- [ ] **Step 1: Write failing test `worker/tests/anon.spec.ts`**
```typescript
import { describe, it, expect } from "vitest";
import { actorId, newId, newNo } from "../lib/anon";
describe("anon", () => {
  it("hashes the X-Anon-Id header deterministically", async () => {
    const req = new Request("https://x", { headers: { "X-Anon-Id": "abc" } });
    const a = await actorId(req, "salt"); const b = await actorId(req, "salt");
    expect(a).toBe(b); expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
  it("differs by salt and returns sentinel when header missing", async () => {
    const req = new Request("https://x", { headers: { "X-Anon-Id": "abc" } });
    expect(await actorId(req, "s1")).not.toBe(await actorId(req, "s2"));
    expect(await actorId(new Request("https://x"), "s")).toBe("anon:none");
  });
  it("newId is 8 uppercase hex, newNo is a large int", () => {
    expect(newId()).toMatch(/^[0-9A-F]{8}$/);
    expect(newNo()).toBeGreaterThan(24000000);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `worker/lib/anon.ts`**
```typescript
export async function actorId(req: Request, salt: string): Promise<string> {
  const raw = req.headers.get("X-Anon-Id");
  if (!raw) return "anon:none";
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw + salt));
  return [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, "0")).join("");
}
export const newId = () => Array.from({ length: 8 }, () => Math.floor(Math.random()*16).toString(16)).join("").toUpperCase();
export const newNo = () => Math.floor(24419000 + Math.random()*9000);
```

- [ ] **Step 4: Implement `worker/lib/db.ts`**
```typescript
export function relAgo(iso?: string | null): string {
  if (!iso) return "now";
  const then = Date.parse(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  const s = Math.max(0, Math.floor((Date.now() - then)/1000));
  if (s < 60) return s <= 3 ? "now" : s + "s";
  const m = Math.floor(s/60); if (m < 60) return m + "m";
  const h = Math.floor(m/60); if (h < 24) return h + "h";
  return Math.floor(h/24) + "d";
}
export const stanceOK = (x: unknown) => ["neutral","believer","skeptic","analyst"].includes(String(x)) ? String(x) : "neutral";
```

- [ ] **Step 5: Run — expect PASS**

- [ ] **Step 6: Commit** `git add -A && git commit -m "feat: worker lib — anon actor, id/no gen, relative time"`

---

## Task 5: GET /api/bootstrap + /api/feed

**Files:**
- Create: `worker/routes/bootstrap.ts`, `worker/routes/feed.ts`; Modify: `worker/index.ts`
- Test: `worker/tests/bootstrap.spec.ts`

**Interfaces:**
- Produces: `/api/bootstrap` → `{ archives[], boards[], stats, ticker[], sightings[], cases[] }` (cases-lite: slug,name,accent,coord). `/api/feed` → `{ featured: RecordCard[], hot: ThreadCard[] }`.
- `RecordCard` = `{ id, archive, agency, title, summary, kind, redacted, thumb, credible, commentN }`; `ThreadCard` = `{ id, no, board_id, boardSlug, accent, title, op_body, stance, reply_count, img_count, votes, hot, ago }`.

Test uses seeded local D1 (apply migrations + a small inline seed in `beforeAll`, or reuse `buildSeedSQL` against `env.DB` by splitting statements).

- [ ] **Step 1: Write failing test `worker/tests/bootstrap.spec.ts`**
```typescript
import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../index";
import { seedTestDB } from "./helpers"; // create in step 3

beforeAll(() => seedTestDB(env.DB));
const get = (p: string) => worker.fetch(new Request("https://x"+p), env as any, {} as any).then(r=>r.json());

describe("bootstrap+feed", () => {
  it("bootstrap returns archives, boards, stats, ticker, sightings, cases", async () => {
    const b: any = await get("/api/bootstrap");
    expect(b.archives.length).toBe(15);
    expect(b.boards.length).toBe(7);
    expect(b.stats.records).toBe(91808);
    expect(b.sightings.length).toBe(12);
    expect(b.cases[0]).toHaveProperty("slug");
  });
  it("feed returns featured records and hot threads with boardSlug", async () => {
    const f: any = await get("/api/feed");
    expect(f.featured.length).toBeGreaterThan(0);
    expect(f.hot.every((t:any)=>t.boardSlug)).toBe(true);
  });
});
```

- [ ] **Step 2: Create test helper `worker/tests/helpers.ts`**
```typescript
import { buildSeedSQL, loadData } from "../../db/seed";
export async function seedTestDB(DB: D1Database) {
  const sql = buildSeedSQL(loadData("realufo-handoff/data.js"));
  const stmts = sql.split(";\n").map(s=>s.trim()).filter(s=>s && !/^(PRAGMA|BEGIN|COMMIT)/i.test(s));
  await DB.batch(stmts.map(s=>DB.prepare(s)));
}
```
(Ensure migrations applied first — add `applyD1Migrations` in a global setup per Task 2 Step 5 pattern.)

- [ ] **Step 3: Run — expect FAIL**

- [ ] **Step 4: Implement `worker/routes/bootstrap.ts`**
```typescript
import type { Env } from "../env";
import { json } from "../lib/json";
export async function bootstrap(_req: Request, env: Env) {
  const [archives, boards, statsRow, ticker, sightings, cases] = await Promise.all([
    env.DB.prepare("SELECT * FROM archives ORDER BY count DESC").all(),
    env.DB.prepare("SELECT * FROM boards").all(),
    env.DB.prepare("SELECT json FROM stats WHERE id=1").first<{ json: string }>(),
    env.DB.prepare("SELECT kind,board,text,ago FROM ticker ORDER BY sort").all(),
    env.DB.prepare("SELECT id,name,lat,lng,count,accent,case_slug FROM sightings").all(),
    env.DB.prepare("SELECT slug,name,accent,coord FROM cases").all(),
  ]);
  return json({
    archives: archives.results, boards: boards.results,
    stats: statsRow ? JSON.parse(statsRow.json) : {},
    ticker: ticker.results, sightings: sightings.results, cases: cases.results,
  });
}
```

- [ ] **Step 5: Implement `worker/routes/feed.ts`**
```typescript
import type { Env } from "../env";
import { json } from "../lib/json";
import { relAgo } from "../lib/db";
export async function feed(_req: Request, env: Env) {
  const featured = await env.DB.prepare(`
    SELECT r.id,r.archive,r.agency,r.title,r.summary,r.kind,r.redacted,
      (SELECT cdn_url FROM assets a WHERE a.record_id=r.id AND a.role='thumb' LIMIT 1) thumb,
      (SELECT count(*) FROM comments c WHERE c.record_id=r.id) commentN
    FROM records r WHERE r.featured=1 LIMIT 6`).all();
  const hot = await env.DB.prepare(`
    SELECT t.*, b.slug boardSlug, b.accent accent FROM threads t JOIN boards b ON b.id=t.board_id
    WHERE t.hot=1 ORDER BY t.votes DESC LIMIT 4`).all<any>();
  return json({
    featured: featured.results.map((r:any)=>({ ...r, credible: 120 + (r.id.length*7)%380 })),
    hot: hot.results.map((t:any)=>({ ...t, ago: relAgo(t.created_at) })),
  });
}
```

- [ ] **Step 6: Register routes in `worker/index.ts`** (add imports + `on("GET","/api/bootstrap",bootstrap); on("GET","/api/feed",feed);`)

- [ ] **Step 7: Run — expect PASS**

- [ ] **Step 8: Commit** `git commit -am "feat: /api/bootstrap + /api/feed"`

---

## Task 6: GET /api/records + GET /api/records/:id

**Files:**
- Create: `worker/routes/records.ts`; Modify: `worker/index.ts`
- Test: `worker/tests/records.spec.ts`

**Interfaces:**
- `/api/records?archive=&type=&redacted=1&q=&limit=&offset=` → `{ count, records: RecordCard[] }` (count = total matching, records = page, default limit 40).
- `/api/records/:id` → `{ record, assets[], promotedThreads[] }` where `promotedThreads` = threads WHERE `source_record_id = :id` (the ⇄ back-reference).

- [ ] **Step 1: Write failing test `worker/tests/records.spec.ts`**
```typescript
import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../index";
import { seedTestDB } from "./helpers";
beforeAll(() => seedTestDB(env.DB));
const get = (p:string)=>worker.fetch(new Request("https://x"+p), env as any, {} as any);

describe("records", () => {
  it("filters by archive and returns count", async () => {
    const j:any = await (await get("/api/records?archive=wargov")).json();
    expect(j.count).toBeGreaterThan(0);
    expect(j.records.every((r:any)=>r.archive==="wargov")).toBe(true);
  });
  it("full-text-ish q matches title/agency/location", async () => {
    const j:any = await (await get("/api/records?q=harare")).json();
    expect(j.records.some((r:any)=>/harare/i.test(r.title+r.summary))).toBe(true);
  });
  it("detail returns record + assets + promoted threads back-reference", async () => {
    const j:any = await (await get("/api/records/CIA-UAP-017")).json();
    expect(j.record.id).toBe("CIA-UAP-017");
    expect(j.assets.length).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(j.promotedThreads)).toBe(true);
    expect(j.promotedThreads.some((t:any)=>t.source_record_id==="CIA-UAP-017")).toBe(true); // t1 has rec CIA-UAP-017
  });
  it("404s unknown id", async () => { expect((await get("/api/records/NOPE")).status).toBe(404); });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `worker/routes/records.ts`**
```typescript
import type { Env } from "../env";
import { json, error } from "../lib/json";
export async function listRecords(req: Request, env: Env) {
  const u = new URL(req.url);
  const where: string[] = []; const bind: unknown[] = [];
  const arch = u.searchParams.get("archive"); if (arch && arch!=="all"){ where.push("r.archive=?"); bind.push(arch); }
  const type = u.searchParams.get("type"); if (type && type!=="all"){ where.push("r.kind=?"); bind.push(type.toLowerCase()); }
  if (u.searchParams.get("redacted")==="1") where.push("r.redacted=1");
  const q = (u.searchParams.get("q")||"").trim();
  if (q){ where.push("(lower(r.title||' '||r.agency||' '||coalesce(r.location,'')||' '||coalesce(r.summary,'')) LIKE ?)"); bind.push("%"+q.toLowerCase()+"%"); }
  const w = where.length ? "WHERE "+where.join(" AND ") : "";
  const limit = Math.min(100, +(u.searchParams.get("limit")||40)); const offset = +(u.searchParams.get("offset")||0);
  const total = await env.DB.prepare(`SELECT count(*) c FROM records r ${w}`).bind(...bind).first<{c:number}>();
  const rows = await env.DB.prepare(`
    SELECT r.id,r.archive,r.agency,r.title,r.summary,r.kind,r.redacted,r.location,r.incident_date,r.doc_date,
      (SELECT cdn_url FROM assets a WHERE a.record_id=r.id AND a.role='thumb' LIMIT 1) thumb
    FROM records r ${w} ORDER BY r.featured DESC, r.created_at DESC LIMIT ? OFFSET ?`).bind(...bind, limit, offset).all();
  return json({ count: total?.c ?? 0, records: rows.results });
}
export async function getRecord(_req: Request, env: Env, p: Record<string,string>) {
  const record = await env.DB.prepare("SELECT * FROM records WHERE id=?").bind(p.id).first();
  if (!record) return error(404, "record not found");
  const [assets, promoted] = await Promise.all([
    env.DB.prepare("SELECT role,cdn_url,mime,width,height FROM assets WHERE record_id=?").bind(p.id).all(),
    env.DB.prepare(`SELECT t.id,t.no,t.title,t.stance,t.votes,t.source_record_id,b.slug boardSlug,b.accent accent
                    FROM threads t JOIN boards b ON b.id=t.board_id WHERE t.source_record_id=?`).bind(p.id).all(),
  ]);
  return json({ record, assets: assets.results, promotedThreads: promoted.results });
}
```

- [ ] **Step 4: Register** `on("GET","/api/records",listRecords); on("GET","/api/records/:id",getRecord);`

- [ ] **Step 5: Run — expect PASS**

- [ ] **Step 6: Commit** `git commit -am "feat: /api/records list + detail with promoted-thread back-refs"`

---

## Task 7: Comments — GET + POST

**Files:** Create `worker/routes/comments.ts`; Modify `worker/index.ts`; Test `worker/tests/comments.spec.ts`

**Interfaces:**
- `GET /api/records/:id/comments` → `{ comments: Comment[] }` (with `ago`, `handleShow`).
- `POST /api/records/:id/comments` body `{ body, stance?, handle? }` → `{ comment }` (server sets id/no/created_at; 400 if empty body).

- [ ] **Step 1: Failing test**
```typescript
import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../index"; import { seedTestDB } from "./helpers";
beforeAll(() => seedTestDB(env.DB));
const call = (p:string, init?:RequestInit)=>worker.fetch(new Request("https://x"+p, init), env as any, {} as any);
describe("comments", () => {
  it("lists seeded comments for a record", async () => {
    const j:any = await (await call("/api/records/CIA-UAP-017/comments")).json();
    expect(j.comments.length).toBeGreaterThanOrEqual(1);
    expect(j.comments[0]).toHaveProperty("ago");
  });
  it("rejects empty body", async () => {
    expect((await call("/api/records/CIA-UAP-017/comments",{method:"POST",body:JSON.stringify({body:"  "})})).status).toBe(400);
  });
  it("creates a comment and returns it", async () => {
    const r = await call("/api/records/CIA-UAP-017/comments",{method:"POST",headers:{"X-Anon-Id":"u1"},body:JSON.stringify({body:"test read",stance:"analyst"})});
    const j:any = await r.json();
    expect(r.status).toBe(201); expect(j.comment.body).toBe("test read"); expect(j.comment.stance).toBe("analyst");
    const list:any = await (await call("/api/records/CIA-UAP-017/comments")).json();
    expect(list.comments.some((c:any)=>c.body==="test read")).toBe(true);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `worker/routes/comments.ts`**
```typescript
import type { Env } from "../env";
import { json, error } from "../lib/json";
import { relAgo, stanceOK } from "../lib/db";
import { newId, newNo } from "../lib/anon";
export async function listComments(_req: Request, env: Env, p: Record<string,string>) {
  const r = await env.DB.prepare("SELECT id,no,body,handle,stance,votes,created_at FROM comments WHERE record_id=? ORDER BY created_at DESC").bind(p.id).all<any>();
  return json({ comments: r.results.map(c=>({ ...c, ago: relAgo(c.created_at), handleShow: c.handle ? "!"+c.handle : null })) });
}
export async function addComment(req: Request, env: Env, p: Record<string,string>) {
  const exists = await env.DB.prepare("SELECT 1 FROM records WHERE id=?").bind(p.id).first();
  if (!exists) return error(404, "record not found");
  const b = await req.json<any>().catch(()=>({}));
  const body = (b.body||"").trim(); if (!body) return error(400, "empty body");
  const id = newId(), no = newNo(), stance = stanceOK(b.stance), handle = (b.handle||"").trim()||null;
  await env.DB.prepare("INSERT INTO comments(id,no,record_id,body,handle,stance,votes) VALUES(?,?,?,?,?,?,0)")
    .bind(id,no,p.id,body,handle,stance).run();
  return json({ comment: { id, no, record_id: p.id, body, handle, stance, votes: 0, ago: "now", handleShow: handle?"!"+handle:null } }, { status: 201 });
}
```

- [ ] **Step 4: Register** `on("GET","/api/records/:id/comments",listComments); on("POST","/api/records/:id/comments",addComment);`

- [ ] **Step 5: Run — expect PASS**  **Step 6: Commit** `git commit -am "feat: record comments GET/POST (anon)"`

---

## Task 8: Boards, threads, posts — reads + POST thread (promote) + POST reply

**Files:** Create `worker/routes/boards.ts`, `worker/routes/threads.ts`, `worker/routes/posts.ts`; Modify `worker/index.ts`; Test `worker/tests/threads.spec.ts`

**Interfaces:**
- `GET /api/boards/:id/threads` → `{ board, threads: ThreadCard[] }`.
- `GET /api/threads/:id` → `{ thread, sourceRecord|null, posts: Post[] }` (`sourceRecord` = the record chip when `source_record_id` set).
- `POST /api/threads` body `{ board, title?, op_body, stance?, handle?, source_record_id? }` → `{ thread }` (201). Title falls back to first line of body (≤70 chars). Creates the OP post row too.
- `POST /api/threads/:id/posts` body `{ body, stance?, handle?, source_record_id?, image_label? }` → `{ post }` (201); increments `threads.reply_count`.

- [ ] **Step 1: Failing test `worker/tests/threads.spec.ts`**
```typescript
import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../index"; import { seedTestDB } from "./helpers";
beforeAll(() => seedTestDB(env.DB));
const call = (p:string, init?:RequestInit)=>worker.fetch(new Request("https://x"+p, init), env as any, {} as any);
const post = (p:string, body:any)=>call(p,{method:"POST",headers:{"X-Anon-Id":"u1"},body:JSON.stringify(body)});
describe("threads", () => {
  it("lists board threads", async () => {
    const j:any = await (await call("/api/boards/gov/threads")).json();
    expect(j.board.id).toBe("gov"); expect(j.threads.length).toBeGreaterThan(0);
  });
  it("thread detail returns source record chip when promoted", async () => {
    const j:any = await (await call("/api/threads/t1")).json(); // t1.rec = CIA-UAP-017
    expect(j.thread.id).toBe("t1"); expect(j.sourceRecord.id).toBe("CIA-UAP-017");
    expect(j.posts.length).toBeGreaterThanOrEqual(1); expect(j.posts[0].isOp).toBe(true);
  });
  it("promotes: POST /threads with source_record_id creates bidirectional link", async () => {
    const j:any = await (await post("/api/threads",{board:"uap",op_body:"promoted body",source_record_id:"CIA-UAP-017",stance:"believer"})).json();
    const tid = j.thread.id; expect(tid).toBeTruthy();
    const back:any = await (await call("/api/records/CIA-UAP-017")).json();
    expect(back.promotedThreads.some((t:any)=>t.id===tid)).toBe(true);
    const det:any = await (await call("/api/threads/"+tid)).json();
    expect(det.sourceRecord.id).toBe("CIA-UAP-017"); expect(det.thread.title).toBe("promoted body");
  });
  it("reply increments reply_count", async () => {
    const before:any = await (await call("/api/threads/t1")).json();
    await post("/api/threads/t1/posts",{body:"a reply"});
    const after:any = await (await call("/api/threads/t1")).json();
    expect(after.posts.length).toBe(before.posts.length+1);
    expect(after.thread.reply_count).toBe(before.thread.reply_count+1);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `worker/routes/boards.ts`**
```typescript
import type { Env } from "../env";
import { json, error } from "../lib/json";
import { relAgo } from "../lib/db";
export async function boardThreads(_req: Request, env: Env, p: Record<string,string>) {
  const board = await env.DB.prepare("SELECT * FROM boards WHERE id=?").bind(p.id).first();
  if (!board) return error(404, "board not found");
  const t = await env.DB.prepare(`SELECT t.*, b.slug boardSlug, b.accent accent FROM threads t JOIN boards b ON b.id=t.board_id WHERE t.board_id=? ORDER BY t.created_at DESC`).bind(p.id).all<any>();
  return json({ board, threads: t.results.map(x=>({ ...x, ago: relAgo(x.created_at), tags: JSON.parse(x.tags||"[]") })) });
}
```

- [ ] **Step 4: Implement `worker/routes/threads.ts`** (GET detail + POST create)
```typescript
import type { Env } from "../env";
import { json, error } from "../lib/json";
import { relAgo, stanceOK } from "../lib/db";
import { newId, newNo } from "../lib/anon";

export async function getThread(_req: Request, env: Env, p: Record<string,string>) {
  const thread = await env.DB.prepare(`SELECT t.*, b.slug boardSlug, b.accent accent FROM threads t JOIN boards b ON b.id=t.board_id WHERE t.id=?`).bind(p.id).first<any>();
  if (!thread) return error(404, "thread not found");
  thread.tags = JSON.parse(thread.tags||"[]"); thread.ago = relAgo(thread.created_at);
  const sourceRecord = thread.source_record_id
    ? await env.DB.prepare(`SELECT id,agency,title,kind,(SELECT cdn_url FROM assets a WHERE a.record_id=records.id AND a.role='thumb' LIMIT 1) thumb FROM records WHERE id=?`).bind(thread.source_record_id).first()
    : null;
  const rows = await env.DB.prepare("SELECT * FROM posts WHERE thread_id=? ORDER BY is_op DESC, created_at ASC").bind(p.id).all<any>();
  const posts = rows.results.map(x=>({ ...x, isOp: !!x.is_op, ago: relAgo(x.created_at), handleShow: x.handle?"!"+x.handle:null, reply_to: JSON.parse(x.reply_to||"[]") }));
  return json({ thread, sourceRecord, posts });
}

export async function createThread(req: Request, env: Env) {
  const b = await req.json<any>().catch(()=>({}));
  const op_body = (b.op_body||"").trim(); if (!op_body) return error(400, "empty body");
  const board = b.board || "uap";
  const boardExists = await env.DB.prepare("SELECT 1 FROM boards WHERE id=?").bind(board).first();
  if (!boardExists) return error(400, "unknown board");
  const src = b.source_record_id || null;
  const title = (b.title||"").trim() || op_body.split("\n")[0].slice(0,70) || "Untitled thread";
  const id = "ut_"+newId(), no = newNo(), stance = stanceOK(b.stance), handle=(b.handle||"").trim()||null, opId=newId();
  await env.DB.prepare(`INSERT INTO threads(id,no,board_id,title,stance,op_body,op_handle,op_id,tags,votes,reply_count,img_count,source_record_id,hot) VALUES(?,?,?,?,?,?,?,?,'[]',0,0,0,?,0)`)
    .bind(id,no,board,title,stance,op_body,handle,opId,src).run();
  await env.DB.prepare(`INSERT INTO posts(id,no,thread_id,body,handle,stance,votes,source_record_id,is_op) VALUES(?,?,?,?,?,?,0,?,1)`)
    .bind(opId,no,id,op_body,handle,stance,src).run();
  return json({ thread: { id, no, board_id: board, title, stance, op_body, source_record_id: src, ago: "now" } }, { status: 201 });
}
```

- [ ] **Step 5: Implement `worker/routes/posts.ts`**
```typescript
import type { Env } from "../env";
import { json, error } from "../lib/json";
import { stanceOK } from "../lib/db";
import { newId, newNo } from "../lib/anon";
export async function createPost(req: Request, env: Env, p: Record<string,string>) {
  const t = await env.DB.prepare("SELECT 1 FROM threads WHERE id=?").bind(p.id).first();
  if (!t) return error(404, "thread not found");
  const b = await req.json<any>().catch(()=>({}));
  const body = (b.body||"").trim(); if (!body) return error(400, "empty body");
  const id=newId(), no=newNo(), stance=stanceOK(b.stance), handle=(b.handle||"").trim()||null;
  const src=b.source_record_id||null, imgLabel=b.image_label||null, imgKind=imgLabel?"placeholder":null;
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO posts(id,no,thread_id,body,handle,stance,votes,source_record_id,image_kind,image_label,is_op) VALUES(?,?,?,?,?,?,0,?,?,?,0)`).bind(id,no,p.id,body,handle,stance,src,imgKind,imgLabel),
    env.DB.prepare("UPDATE threads SET reply_count=reply_count+1 WHERE id=?").bind(p.id),
  ]);
  return json({ post: { id, no, thread_id: p.id, body, handle, stance, votes: 0, isOp: false, ago: "now" } }, { status: 201 });
}
```

- [ ] **Step 6: Register all** in `worker/index.ts`:
```
on("GET","/api/boards/:id/threads",boardThreads);
on("GET","/api/threads/:id",getThread);
on("POST","/api/threads",createThread);
on("POST","/api/threads/:id/posts",createPost);
```

- [ ] **Step 7: Run — expect PASS**  **Step 8: Commit** `git commit -am "feat: boards/threads/posts reads + promote-to-board + reply"`

---

## Task 9: Votes — toggle + dedup

**Files:** Create `worker/routes/votes.ts`; Modify `worker/index.ts`; Test `worker/tests/votes.spec.ts`

**Interfaces:**
- `POST /api/votes` body `{ target_type: 'thread'|'post'|'comment', target_id }` header `X-Anon-Id` → `{ voted: boolean, votes: number }`. Toggles; dedups on `(actor_id,target_type,target_id)`; updates the target's `votes` column.

- [ ] **Step 1: Failing test**
```typescript
import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../index"; import { seedTestDB } from "./helpers";
beforeAll(() => seedTestDB(env.DB));
const vote = (body:any, anon="v1")=>worker.fetch(new Request("https://x/api/votes",{method:"POST",headers:{"X-Anon-Id":anon},body:JSON.stringify(body)}), env as any, {} as any).then(r=>r.json());
describe("votes", () => {
  it("toggles on then off and adjusts count", async () => {
    const a:any = await vote({target_type:"thread",target_id:"t1"});
    expect(a.voted).toBe(true);
    const b:any = await vote({target_type:"thread",target_id:"t1"});
    expect(b.voted).toBe(false); expect(b.votes).toBe(a.votes-1);
  });
  it("dedups across repeated on-votes from same actor", async () => {
    await vote({target_type:"post",target_id:"t1"},"v2");
    const again:any = await vote({target_type:"post",target_id:"t1"},"v2");
    expect(again.voted).toBe(false); // second call toggles off, not double-count
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `worker/routes/votes.ts`**
```typescript
import type { Env } from "../env";
import { json, error } from "../lib/json";
import { actorId } from "../lib/anon";
const TBL: Record<string,string> = { thread: "threads", post: "posts", comment: "comments" };
export async function toggleVote(req: Request, env: Env) {
  const b = await req.json<any>().catch(()=>({}));
  const table = TBL[b.target_type]; if (!table || !b.target_id) return error(400, "bad target");
  const actor = await actorId(req, env.ANON_SALT);
  const existing = await env.DB.prepare("SELECT id FROM votes WHERE actor_id=? AND target_type=? AND target_id=?").bind(actor,b.target_type,b.target_id).first();
  let voted: boolean;
  if (existing) {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM votes WHERE id=?").bind((existing as any).id),
      env.DB.prepare(`UPDATE ${table} SET votes=votes-1 WHERE id=?`).bind(b.target_id),
    ]); voted = false;
  } else {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO votes(actor_id,target_type,target_id) VALUES(?,?,?)").bind(actor,b.target_type,b.target_id),
      env.DB.prepare(`UPDATE ${table} SET votes=votes+1 WHERE id=?`).bind(b.target_id),
    ]); voted = true;
  }
  const row = await env.DB.prepare(`SELECT votes FROM ${table} WHERE id=?`).bind(b.target_id).first<{votes:number}>();
  return json({ voted, votes: row?.votes ?? 0 });
}
```

- [ ] **Step 4: Register** `on("POST","/api/votes",toggleVote);`  **Step 5: Run — expect PASS**  **Step 6: Commit** `git commit -am "feat: vote toggle with anon dedup"`

---

## Task 10: Cases + auth stub

**Files:** Create `worker/routes/cases.ts`, `worker/routes/auth.ts`; Modify `worker/index.ts`; Test `worker/tests/cases.spec.ts`

**Interfaces:**
- `GET /api/cases/:slug` → `{ case, relatedThread|null }` (relatedThread = thread WHERE `case_slug=:slug`). 404 unknown.
- `POST /api/auth/login` → if `FEATURE_AUTH!=='true'`: `{ stub: true, me: { handle } }` where handle from body or `anon_signal`/`agent_scully` per `method`.

- [ ] **Step 1: Failing test**
```typescript
import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../index"; import { seedTestDB } from "./helpers";
beforeAll(() => seedTestDB(env.DB));
const call=(p:string,init?:RequestInit)=>worker.fetch(new Request("https://x"+p,init), env as any, {} as any);
describe("cases+auth", () => {
  it("returns case + related thread", async () => {
    const j:any = await (await call("/api/cases/roswell")).json();
    expect(j.case.slug).toBe("roswell"); expect("relatedThread" in j).toBe(true);
  });
  it("404 unknown case", async () => { expect((await call("/api/cases/nope")).status).toBe(404); });
  it("auth stub returns fake session", async () => {
    const j:any = await (await call("/api/auth/login",{method:"POST",body:JSON.stringify({method:"google"})})).json();
    expect(j.stub).toBe(true); expect(j.me.handle).toBe("agent_scully");
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement `worker/routes/cases.ts`**
```typescript
import type { Env } from "../env";
import { json, error } from "../lib/json";
import { relAgo } from "../lib/db";
export async function getCase(_req: Request, env: Env, p: Record<string,string>) {
  const c = await env.DB.prepare("SELECT * FROM cases WHERE slug=?").bind(p.slug).first();
  if (!c) return error(404, "case not found");
  const t = await env.DB.prepare(`SELECT t.id,t.title,b.slug boardSlug,b.accent accent,t.created_at FROM threads t JOIN boards b ON b.id=t.board_id WHERE t.case_slug=? LIMIT 1`).bind(p.slug).first<any>();
  return json({ case: c, relatedThread: t ? { ...t, ago: relAgo(t.created_at) } : null });
}
```

- [ ] **Step 4: Implement `worker/routes/auth.ts`**
```typescript
import type { Env } from "../env";
import { json } from "../lib/json";
export async function login(req: Request, env: Env) {
  const b = await req.json<any>().catch(()=>({}));
  if (env.FEATURE_AUTH === "true") return json({ error: "not implemented" }, { status: 501 });
  const handle = (b.handle||"").trim() || (b.method === "google" ? "agent_scully" : "anon_signal");
  return json({ stub: true, me: { handle } });
}
```

- [ ] **Step 5: Register** `on("GET","/api/cases/:slug",getCase); on("POST","/api/auth/login",login);`  **Step 6: PASS**  **Step 7: Commit** `git commit -am "feat: cases detail + stubbed auth behind FEATURE_AUTH"`

---

## Task 11: Meta-injection + SPA serving

**Files:** Create `worker/lib/meta.ts`; Modify `worker/index.ts`; Test `worker/tests/meta.spec.ts`

**Interfaces:**
- `injectMeta(html, { title, description, image, url }): string` replaces `<!--META-->` with title + description + OG/Twitter tags (HTML-escaped).
- `index.ts`: for `GET /doc/:id`, `/case/:slug`, `/thread/:id` (non-api, `Accept: text/html`), fetch asset `index.html`, look up entity in D1, inject; else pass through to `env.ASSETS`.

- [ ] **Step 1: Failing test `worker/tests/meta.spec.ts`**
```typescript
import { describe, it, expect } from "vitest";
import { injectMeta } from "../lib/meta";
describe("injectMeta", () => {
  it("replaces placeholder with escaped OG tags", () => {
    const out = injectMeta("<head><!--META--></head>", { title: 'A "quote"', description: "d", image: "https://c/i.jpg", url: "https://r/doc/1" });
    expect(out).toContain('<title>A &quot;quote&quot;');
    expect(out).toContain('property="og:image" content="https://c/i.jpg"');
    expect(out).not.toContain("<!--META-->");
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement `worker/lib/meta.ts`**
```typescript
const esc = (s: string) => s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
export function injectMeta(html: string, m: { title: string; description: string; image?: string; url: string }): string {
  const t = esc(m.title), d = esc(m.description || ""), u = esc(m.url), img = m.image ? esc(m.image) : "";
  const tags = [
    `<title>${t} · RealUFO</title>`,
    `<meta name="description" content="${d}">`,
    `<meta property="og:type" content="article">`,
    `<meta property="og:title" content="${t}">`,
    `<meta property="og:description" content="${d}">`,
    `<meta property="og:url" content="${u}">`,
    img && `<meta property="og:image" content="${img}">`,
    `<meta name="twitter:card" content="${img ? "summary_large_image" : "summary"}">`,
  ].filter(Boolean).join("\n");
  return html.replace("<!--META-->", tags);
}
```

- [ ] **Step 4: Wire in `worker/index.ts`** — replace the asset fallback:
```typescript
import { injectMeta } from "./lib/meta";
const META_ROUTES = [
  { p: new URLPattern({ pathname: "/doc/:id" }), kind: "doc" },
  { p: new URLPattern({ pathname: "/case/:slug" }), kind: "case" },
  { p: new URLPattern({ pathname: "/thread/:id" }), kind: "thread" },
] as const;
async function serveWithMeta(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  if (req.method === "GET" && (req.headers.get("accept")||"").includes("text/html")) {
    for (const r of META_ROUTES) {
      const m = r.p.exec({ pathname: url.pathname }); if (!m) continue;
      const idx = await env.ASSETS.fetch(new Request(new URL("/index.html", url)));
      let html = await idx.text();
      const g = m.pathname.groups as any;
      let meta: { title: string; description: string; image?: string } | null = null;
      if (r.kind === "doc") { const x:any = await env.DB.prepare(`SELECT r.title,r.summary,(SELECT cdn_url FROM assets a WHERE a.record_id=r.id AND a.role='thumb' LIMIT 1) thumb FROM records r WHERE r.id=?`).bind(g.id).first(); if (x) meta={title:x.title,description:x.summary,image:x.thumb}; }
      else if (r.kind === "case") { const x:any = await env.DB.prepare("SELECT name,lede FROM cases WHERE slug=?").bind(g.slug).first(); if (x) meta={title:x.name,description:(x.lede||"").slice(0,200)}; }
      else { const x:any = await env.DB.prepare("SELECT title,op_body FROM threads WHERE id=?").bind(g.id).first(); if (x) meta={title:x.title,description:(x.op_body||"").slice(0,200)}; }
      if (meta) return new Response(injectMeta(html, { ...meta, url: url.href }), { headers: { "content-type": "text/html;charset=utf-8" } });
      return new Response(html, { headers: { "content-type": "text/html;charset=utf-8" } });
    }
  }
  return env.ASSETS.fetch(req);
}
// in fetch(): replace `return env.ASSETS.fetch(req)` with `return serveWithMeta(req, env);`
```

- [ ] **Step 5: Run — PASS** (`pnpm test:worker` all green)  **Step 6: Commit** `git commit -am "feat: per-route OG/meta injection for deep links"`

---

## Task 12: Theme layer — CSS variables (1:1) + Tailwind + fonts + ThemeProvider

**Files:** Create `web/src/theme/theme.css`, `web/src/theme/ThemeProvider.tsx`, `web/src/theme/useTheme.ts`; Modify `web/tailwind.config.ts`, `web/src/main.tsx`; Test `web/src/tests/theme.test.tsx`

**Interfaces:**
- `ThemeProvider` sets `data-theme`/`data-accent`/`data-scanlines` on `<html>`, persists to `localStorage['ufo_theme']`. `useTheme()` → `{ theme, accent, scanlines, setTheme, setAccent, setScanlines }`.

- [ ] **Step 1: Write `web/src/theme/theme.css`** — copy the token blocks **verbatim** from `realufo-handoff/RealUFO.dc.html` lines 16–34 (`:root`, `[data-theme="light"]`, `[data-accent="cyan|amber|violet"]`), plus keyframes from lines 54–62, plus `body`/`a`/`::selection`/`[data-scroll]` rules from lines 35–43. Add scanline/grain/glow layers as reusable classes (`.crt-grain`, `.crt-scan`) from lines 68–70.

- [ ] **Step 2: Configure `web/tailwind.config.ts`** — alias CSS vars:
```typescript
import type { Config } from "tailwindcss";
export default {
  content: ["./index.html","./src/**/*.{ts,tsx}"],
  theme: { extend: { colors: {
    bg:"var(--bg)", bg2:"var(--bg2)", surface:"var(--surface)", surface2:"var(--surface2)", elev:"var(--elev)",
    ink:"var(--ink)", dim:"var(--dim)", faint:"var(--faint)", line:"var(--line)", line2:"var(--line2)",
    signal:"var(--signal)", grn:"var(--grn)", cyan:"var(--cyan)", amber:"var(--amber)", red:"var(--red)", violet:"var(--violet)",
  }, fontFamily: { pixel:["'Press Start 2P'","monospace"], mono:["'JetBrains Mono'","monospace"], body:["'Space Grotesk'","system-ui","sans-serif"] } } },
  plugins: [],
} satisfies Config;
```

- [ ] **Step 3: Import fonts + theme in `web/src/main.tsx`**
```typescript
import "@fontsource/press-start-2p"; import "@fontsource/jetbrains-mono/400.css"; import "@fontsource/jetbrains-mono/500.css"; import "@fontsource/jetbrains-mono/700.css";
import "@fontsource/space-grotesk/400.css"; import "@fontsource/space-grotesk/500.css"; import "@fontsource/space-grotesk/600.css"; import "@fontsource/space-grotesk/700.css";
import "./theme/theme.css"; import "./index.css";
```

- [ ] **Step 4: Write failing test `web/src/tests/theme.test.tsx`**
```tsx
import { render, screen, act } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ThemeProvider } from "../theme/ThemeProvider";
import { useTheme } from "../theme/useTheme";
function Probe(){ const { accent, setAccent } = useTheme(); return <button onClick={()=>setAccent("cyan")}>{accent}</button>; }
describe("ThemeProvider", () => {
  it("defaults to phosphor and updates html data-accent", () => {
    render(<ThemeProvider><Probe/></ThemeProvider>);
    expect(document.documentElement.getAttribute("data-accent")).toBe("phosphor");
    act(()=>screen.getByRole("button").click());
    expect(document.documentElement.getAttribute("data-accent")).toBe("cyan");
  });
});
```
Add `web/vitest.config.ts` with `environment: "jsdom"`, setup `@testing-library/jest-dom`.

- [ ] **Step 5: Run — FAIL** (`pnpm test:web`)

- [ ] **Step 6: Implement `ThemeProvider.tsx` + `useTheme.ts`** — context holding `theme|accent|scanlines`, effect writes `document.documentElement.dataset.{theme,accent,scanlines}`, reads/writes `localStorage['ufo_theme']`, initial theme from `matchMedia('(prefers-color-scheme: dark)')`.

- [ ] **Step 7: Run — PASS**  **Step 8: Commit** `git commit -am "feat(web): CRT theme tokens + tailwind aliases + ThemeProvider"`

---

## Task 13: API client + types + TanStack Query + anon id

**Files:** Create `web/src/api/types.ts`, `web/src/api/client.ts`, `web/src/api/queries.ts`, `web/src/lib/anon.ts`; Modify `web/src/main.tsx`; Test `web/src/tests/client.test.ts`

**Interfaces:**
- `api.get<T>(path)`, `api.post<T>(path, body)` — inject `X-Anon-Id` header from `web/src/lib/anon.ts` `getAnonId()` (localStorage UUID via `crypto.randomUUID()`).
- Query hooks: `useBootstrap, useFeed, useRecords(params), useRecord(id), useComments(id), useBoardThreads(id), useThread(id), useCase(slug)`; mutations: `useAddComment, usePromote/useCreateThread, useReply, useVote` with optimistic updates + `queryClient` invalidation.
- `types.ts` mirrors API shapes (RecordCard, RecordDetail, ThreadCard, ThreadDetail, Post, Comment, Board, Archive, Sighting, CaseLite, Stats, Bootstrap, Feed).

- [ ] **Step 1: Failing test `web/src/tests/client.test.ts`** — mock `fetch`, assert `X-Anon-Id` header sent and JSON parsed:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { api } from "../api/client";
beforeEach(()=>{ localStorage.clear(); });
describe("api client", () => {
  it("sends X-Anon-Id and parses json", async () => {
    const spy = vi.spyOn(globalThis,"fetch").mockResolvedValue(new Response(JSON.stringify({ok:1}),{status:200}));
    const r = await api.get<{ok:number}>("/api/health");
    expect(r.ok).toBe(1);
    const hdrs = (spy.mock.calls[0][1] as RequestInit).headers as Record<string,string>;
    expect(hdrs["X-Anon-Id"]).toMatch(/[0-9a-f-]{36}/);
  });
  it("throws on non-2xx", async () => {
    vi.spyOn(globalThis,"fetch").mockResolvedValue(new Response("{}",{status:400}));
    await expect(api.post("/api/x",{})).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement `web/src/lib/anon.ts`**
```typescript
export function getAnonId(): string {
  let id = localStorage.getItem("ufo_anon");
  if (!id) { id = crypto.randomUUID(); localStorage.setItem("ufo_anon", id); }
  return id;
}
```

- [ ] **Step 4: Implement `web/src/api/client.ts`**
```typescript
import { getAnonId } from "../lib/anon";
const base = (path: string) => path; // same-origin
async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(base(path), {
    method,
    headers: { "content-type": "application/json", "X-Anon-Id": getAnonId() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}
export const api = { get: <T>(p:string)=>req<T>("GET",p), post: <T>(p:string,b?:unknown)=>req<T>("POST",p,b) };
```

- [ ] **Step 5: Implement `types.ts` + `queries.ts`** (hooks per interface; optimistic `useVote` flips cached `voted`/`votes`; `useAddComment` prepends). Wrap app in `QueryClientProvider` in `main.tsx`.

- [ ] **Step 6: Run — PASS**  **Step 7: Commit** `git commit -am "feat(web): typed api client + query hooks + anon id"`

---

## Task 14: AppShell + router + responsive nav

**Files:** Create `web/src/router.tsx`, `web/src/App.tsx`, `web/src/components/{AppShell,TopNav,BottomTab,AppBar,Saucer}.tsx`, `web/src/lib/useMediaQuery.ts`; Test `web/src/tests/shell.test.tsx`

**Interfaces:**
- Routes (react-router `createBrowserRouter`): `/`→Feed, `/archive`→Archive, `/doc/:id`→Doc, `/boards`→Boards, `/board/:slug`→Board, `/thread/:id`→Thread, `/case/:slug`→Case, `/map`→Map. All inside `AppShell` layout route (`<Outlet/>`).
- `AppShell` renders CRT background layers + `TopNav` (≥900px) / `AppBar`+`BottomTab` (<900px); nav items `[feed,archive,boards,map]` with active state by route; `useMediaQuery("(min-width:900px)")`.
- `Saucer` = inline pixel SVG (port from prototype lines 554–564).

- [ ] **Step 1: Failing test `web/src/tests/shell.test.tsx`** — render router at `/`, assert nav labels present and Feed marked active; use `createMemoryRouter`.
```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { renderAppAt } from "./util"; // helper wrapping ThemeProvider+QueryClient+memory router
describe("AppShell", () => {
  it("shows nav and active feed tab", async () => {
    renderAppAt("/");
    expect(await screen.findByText(/Feed/)).toBeInTheDocument();
    expect(screen.getByText(/Archive/)).toBeInTheDocument();
    expect(screen.getByText(/Boards/)).toBeInTheDocument();
    expect(screen.getByText(/Map/)).toBeInTheDocument();
  });
});
```
Create `web/src/tests/util.tsx` (`renderAppAt(path)` mounts providers + `createMemoryRouter(routes,{initialEntries:[path]})`, mocks `api.get` bootstrap/feed).

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement** `useMediaQuery`, `Saucer`, `AppBar`, `TopNav`, `BottomTab`, `AppShell`, `router.tsx`, `App.tsx`. Match prototype markup: TopNav lines 80–96; AppBar lines 100–108; BottomTab lines 393–401; background layers lines 68–70. Screens render placeholders for now (real screens in later tasks) so router resolves.

- [ ] **Step 4: Run — PASS**  **Step 5: Commit** `git commit -am "feat(web): app shell, router, responsive top/bottom nav"`

---

## Task 15: Reusable content components

**Files:** Create `web/src/components/{StanceTag,VoteButton,DocCard,ThreadRow,BoardRow,Ticker}.tsx`; Test `web/src/tests/components.test.tsx`

**Interfaces:**
- `StanceTag({stance})` → colored dot+label (`stanceC` map: believer=grn, skeptic=amber, analyst=cyan, neutral=dim).
- `VoteButton({targetType,targetId,votes,voted})` → optimistic toggle via `useVote`; renders ▲ + count; `navigator.vibrate(5)` on tap; ≥44px.
- `DocCard({record,onOpen})` → grid card (prototype lines 121–136 / 189–202); thumb with fallback diagonal-hatch; badge=agency; REDACTED chip; video play glyph.
- `ThreadRow({thread})` → vote pillar + title + meta (prototype lines 141–154 / 243–253).
- `BoardRow({board})` → prototype lines 218–228. `Ticker({items})` → marquee (lines 114–117).

- [ ] **Step 1: Failing test** — render `<DocCard>` shows title/agency/REDACTED conditionally; `<VoteButton voted votes={5}>` shows 5 and toggles to 4 optimistically (mock `useVote`); `<StanceTag stance="skeptic">` has amber class.

- [ ] **Step 2: Run — FAIL**  **Step 3: Implement** all six, matching referenced prototype line ranges; thumb fallback replicates `imgErr` hatch. **Step 4: PASS**  **Step 5: Commit** `git commit -am "feat(web): reusable cards, vote button, stance tag, ticker"`

---

## Task 16: Overlays — provider, Composer, MediaViewer, LoginSheet, Toast

**Files:** Create `web/src/overlays/{OverlayProvider,Composer,MediaViewer,LoginSheet,Toast}.tsx`; Modify `web/src/App.tsx`; Test `web/src/tests/composer.test.tsx`

**Interfaces:**
- `useOverlay()` → `{ openComposer(opts), openViewer(opts), openLogin(), toast(msg), close* }`. `ComposerOpts = { mode:'comment'|'reply'|'newThread'; recordId?; threadId?; sourceRecordId?; refLabel?; presetBody?; presetTitle?; boardId? }`.
- `Composer` mirrors prototype sheet (lines 416–434): stance chips, body textarea, handle input, attach-image toggle, file-reference chip when `refLabel`, thread-title input when `newThread`; submit calls the right mutation (`useAddComment`/`useReply`/`useCreateThread`), toasts, navigates to `/thread/:id` on new thread; sheet drag-to-dismiss (port `sheetDown/Move/End`).
- `MediaViewer` (lines 404–414): pdf `<iframe>`, video `<video>`, placeholder tile. `LoginSheet` (lines 436–448) → calls `/api/auth/login` stub + also hosts the theme/accent/scanlines switcher. `Toast` (line 450–452).

- [ ] **Step 1: Failing test `composer.test.tsx`** — open composer in `newThread` mode with `refLabel`, assert file-reference chip + title input render; empty submit → toast "Say something first" (mock mutation/toast); filled submit calls `useCreateThread` with `source_record_id`.

- [ ] **Step 2: Run — FAIL**  **Step 3: Implement** overlays; mount `<OverlayHost/>` in `App`. **Step 4: PASS**  **Step 5: Commit** `git commit -am "feat(web): overlay system — composer, viewer, login, toast"`

---

## Task 17: Feed screen

**Files:** Create `web/src/screens/Feed.tsx`; Test `web/src/tests/feed.test.tsx`

**Interfaces:** consumes `useBootstrap` (ticker) + `useFeed` (featured, hot). Layout = prototype lines 112–164: LIVE ticker, "Hot right now" DocCard grid, "Trending threads" ThreadRow list, archive CTA card. Cards navigate to `/doc/:id`; "all boards" → `/boards`.

- [ ] **Step 1: Failing test** — mock `useFeed` with 2 featured + 1 hot; assert both render, DocCard click navigates to `/doc/:id`. **Step 2: FAIL** **Step 3: Implement** (reuse DocCard/ThreadRow/Ticker). **Step 4: PASS** **Step 5: Commit** `git commit -am "feat(web): Feed screen"`

---

## Task 18: Archive screen (search / filter / grid)

**Files:** Create `web/src/screens/Archive.tsx`; Test `web/src/tests/archive.test.tsx`

**Interfaces:** consumes `useBootstrap` (archives chips) + `useRecords({archive,type,redacted,q})`. Layout = prototype lines 167–205: search input (debounced 250ms → `q`), archive chip row, type chips (All/Docs/Video), "redacted only" toggle, result count, DocCard grid (paged), empty state. Filters live in URL search params (shareable).

- [ ] **Step 1: Failing test** — mock `useRecords`; typing in search updates query param; clicking an archive chip filters; empty result renders "no records match". **Step 2: FAIL** **Step 3: Implement.** **Step 4: PASS** **Step 5: Commit** `git commit -am "feat(web): Archive search/filter grid"`

---

## Task 19: Document detail (swipe, comments, promote, start-thread)

**Files:** Create `web/src/screens/Doc.tsx`; Test `web/src/tests/doc.test.tsx`

**Interfaces:** consumes `useRecord(id)` + `useComments(id)`. Layout = prototype lines 346–388: swipeable media (pointer swipe prev/next through the list from Archive filter, kept in router state or a `useRecords` cache; wrap-around vibrate), agency/archive chips, meta grid (incident/location/released/VIRIN), summary, OPEN ORIGINAL (→ MediaViewer), Discussion header + count, "Add your read" (→ Composer comment mode), comment list (each with VoteButton + "⤴ to a board" → Composer newThread with quoted body + `sourceRecordId`), "Start a board thread about this file" (→ Composer newThread empty body + file chip). Also render `promotedThreads` back-reference chips linking to `/thread/:id`.

- [ ] **Step 1: Failing test** — mock `useRecord`/`useComments`; assert meta grid + comment renders; clicking "⤴ to a board" opens composer in newThread mode with `sourceRecordId` and quoted body (spy on `openComposer`); promoted-thread chip links to `/thread/:id`. **Step 2: FAIL** **Step 3: Implement** (port swipe handlers `docDown/docUp/swipeDoc` from prototype lines 520–522). **Step 4: PASS** **Step 5: Commit** `git commit -am "feat(web): Document detail with promote + start-thread flows"`

---

## Task 20: Boards + Board screens

**Files:** Create `web/src/screens/Boards.tsx`, `web/src/screens/Board.tsx`; Test `web/src/tests/boards.test.tsx`

**Interfaces:** `Boards` consumes `useBootstrap` (boards) → prototype lines 208–231 (anon CTA + NEW button → Composer newThread; BoardRow list → `/board/:slug`). `Board` consumes `useBoardThreads(id)` → prototype lines 233–256 (board header, START NEW THREAD, ThreadRow list → `/thread/:id`). Board route param is `slug` → resolve to board id via bootstrap map.

- [ ] **Step 1: Failing test** — Boards lists 7 boards; clicking one navigates `/board/:slug`; Board shows threads. **Step 2: FAIL** **Step 3: Implement.** **Step 4: PASS** **Step 5: Commit** `git commit -am "feat(web): Boards + Board screens"`

---

## Task 21: Thread screen (posts + reply)

**Files:** Create `web/src/screens/Thread.tsx`; Test `web/src/tests/thread.test.tsx`

**Interfaces:** consumes `useThread(id)`. Layout = prototype lines 258–287: board slug + No., title, `sourceRecord` back-reference chip ("◂ from record" → `/doc/:id`) when present, post list (OP badge, stance color, handle, ID, ago, post image via MediaViewer, VoteButton "credible", reply affordance), sticky bottom "Post a reply" bar → Composer reply mode. New reply appears optimistically.

- [ ] **Step 1: Failing test** — mock `useThread` with `sourceRecord`; assert back-ref chip links `/doc/:id`, OP post shows OP badge, reply bar opens composer reply mode. **Step 2: FAIL** **Step 3: Implement.** **Step 4: PASS** **Step 5: Commit** `git commit -am "feat(web): Thread view with source back-reference + reply"`

---

## Task 22: Cold Case screen

**Files:** Create `web/src/screens/Case.tsx`; Test `web/src/tests/case.test.tsx`

**Interfaces:** consumes `useCase(slug)`. Layout = prototype lines 289–309: coord line, name H1, archive label + status, lede, pull-quote blockquote, "ACTIVE DISCUSSION" card → `/thread/:id` when `relatedThread`.

- [ ] **Step 1: Failing test** — mock `useCase` (roswell + relatedThread); assert name, pull-quote, discussion card link. **Step 2: FAIL** **Step 3: Implement.** **Step 4: PASS** **Step 5: Commit** `git commit -am "feat(web): Cold Case screen"`

---

## Task 23: Sighting Map + stats screen

**Files:** Create `web/src/screens/Map.tsx`, `web/src/lib/map.ts`; Test `web/src/tests/map.test.tsx`

**Interfaces:** consumes `useBootstrap` (sightings, stats). `map.ts` `project(lat,lng)` → `{x,y}` equirectangular (`x=(lng+180)/360`, `y=(90-lat)/180`). Layout = prototype lines 311–343: grid map with twinkling signal dots (positioned via `project`), tap → `/case/:slug` if `case_slug` else toast; 4 stat tiles (records/videos/threads/posts); "Records by decade" bars; "Top locations" bars (from `stats.byDecade`/`stats.topLocations`).

- [ ] **Step 1: Failing test `map.test.tsx`** — `project(33.39,-104.52)` ≈ `{x:0.2097,y:0.3145}` (toBeCloseTo, 3dp); Map renders one dot per sighting; dot with `case_slug` navigates `/case/:slug`. **Step 2: FAIL** **Step 3: Implement.** **Step 4: PASS** **Step 5: Commit** `git commit -am "feat(web): Sighting map + stats"`

---

## Task 24: End-to-end smoke (Playwright)

**Files:** Create `e2e/smoke.spec.ts`, `playwright.config.ts`; Modify root `package.json` (`"test:e2e"`, add `@playwright/test`)

**Interfaces:** boots `pnpm dev` (built SPA + `wrangler dev` on local seeded D1), runs the golden path.

- [ ] **Step 1: Write `e2e/smoke.spec.ts`** — Feed loads → click a hot doc → Doc detail → "Add your read" → type + POST → comment appears → "⤴ to a board" → composer newThread prefilled → POST → lands on Thread with "◂ from record" chip → back to Doc shows the promoted-thread chip. Assert each step's visible text.
- [ ] **Step 2: `playwright.config.ts`** with `webServer: { command: "pnpm dev", url: "http://localhost:8787", reuseExistingServer: true }`, `use.baseURL`.
- [ ] **Step 3: Seed local D1** (`pnpm db:migrate:local && pnpm db:seed:local`), then run `pnpm test:e2e` — expect PASS.
- [ ] **Step 4: Commit** `git commit -am "test(e2e): golden path feed→doc→comment→promote→thread"`

---

## Task 25: Provision live + deploy + GitHub

**Files:** Modify `wrangler.jsonc` (real `database_id`); Create `README.md`

**Preconditions:** all `pnpm test:worker`, `pnpm test:web`, `pnpm test:e2e` green; `pnpm build:web` clean. **Heads-up to user before first push and first deploy (standing authorization granted).**

- [ ] **Step 1: Create GitHub repo + push** (active account `hectorchanht`):
```bash
gh repo create hectorchanht/realufo --public --source=. --remote=origin --push
```
- [ ] **Step 2: Create D1 on the Flow Account**
```bash
wrangler d1 create realufo-db
```
Copy the returned `database_id` into `wrangler.jsonc`. Commit that change.
- [ ] **Step 3: Apply migrations + seed remote**
```bash
pnpm db:migrate && pnpm db:seed
```
Smoke: `wrangler d1 execute realufo-db --remote --command "SELECT count(*) FROM records;"` → 28.
- [ ] **Step 4: Deploy**
```bash
pnpm deploy
```
Confirm the deployed URL serves the SPA and `/api/health` → ok, `/api/bootstrap` → 15 archives.
- [ ] **Step 5: (Optional) custom domain** — add route `app.realufo.org/*` to the Worker in `wrangler.jsonc` `routes` once the user confirms the subdomain.
- [ ] **Step 6: Write `README.md`** — dev setup, `pnpm dev`, migrate/seed, deploy, architecture summary, Spec-2 backlog. **Commit + push.**

---

## Self-Review

**1. Spec coverage:**
- §3 topology → Tasks 1, 11, 25. §3.1 meta-injection → Task 11. §4 layout → Task 1 + all. §5 schema → Tasks 2, 3. §6 API (every endpoint) → Tasks 5–10. §7 anon identity → Tasks 4, 13. §8 frontend (theme/responsive/routing/reuse/data/anon) → Tasks 12–16. §9 flows (comment/promote/start-thread/vote/new-thread/swipe) → Tasks 8, 9, 16, 19, 21. §10 auth stub → Task 10. §11 testing → per-task + Task 24. §12 deploy → Task 25. §13 out-of-scope → untouched. All spec sections mapped.
- Screens: Feed 17, Archive 18, Doc 19, Boards/Board 20, Thread 21, Case 22, Map 23. Overlays (viewer/composer/login/toast) 16. All 7 screens + overlays covered.

**2. Placeholder scan:** Screen tasks (17–23) reference exact prototype line ranges instead of re-pasting inline-styled JSX — intentional (prototype is the in-repo authoritative source; re-transcription risks divergence). Each still has failing-test-first + commit. Backend/seed/theme tasks carry complete code. No "TBD/handle edge cases/similar to Task N".

**3. Type consistency:** `actorId/newId/newNo/relAgo/stanceOK` defined Task 4, used 5–10 with matching signatures. `api.get/post` (Task 13) used by all hooks. `RecordCard/ThreadCard/Post/Comment` shapes consistent between worker routes (5–10) and web types (13). `useVote/useAddComment/useCreateThread/useReply` named identically in Tasks 13, 15, 16, 19, 21. `injectMeta` signature matches Task 11 test and index.ts caller. `source_record_id` used consistently across schema, threads/posts routes, and promote flow.

Plan complete.
