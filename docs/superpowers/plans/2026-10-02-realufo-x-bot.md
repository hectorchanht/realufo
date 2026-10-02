# RealUFO X Bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Worker cron that posts to X automatically: one summary per new release (with link), one daily archive pick (video clip first, no link), one daily community highlight (no link).

**Architecture:** `scheduled()` on the existing Worker runs `tick()` every 3h: resume unfinished posts → pick one candidate → AI copy (qwen3) validated with template fallback → upload clip/thumb from R2 to X (chunked v2 media API) → `POST /2/tweets`, tracked in D1 `x_posts`. Clips are pre-cut by a new Python step in the existing GitHub Actions ingest (Worker can't run ffmpeg).

**Tech Stack:** Cloudflare Workers (D1, R2, Workers AI, cron triggers), TypeScript, vitest + `@cloudflare/vitest-pool-workers`, Python 3.11 + ffmpeg (crawler), X API v2 with OAuth 1.0a (HMAC-SHA1 via WebCrypto, no library).

**Spec:** `docs/superpowers/specs/2026-10-02-realufo-x-bot-design.md`

## Global Constraints

- Prices: post without URL **$0.015**, post with URL **$0.20**. Media upload has no price line on X's rate card → book **+$0.015 per post that carries media** (conservative).
- Only `release` posts may contain a URL. `pick` and `highlight` text must contain **no URL and no bare domain** (X auto-links `war.gov`, `realufo.org`… and bills $0.20).
- `FEATURE_X` = `off` | `dry` | `on`; default `"off"` in `wrangler.jsonc`.
- Vars (strings): `X_DAILY_MAX="3"`, `X_MONTHLY_USD_CAP="10"`, `X_HIGHLIGHT_MIN_VOTES="5"`, `X_SINCE=""` (empty = no release posts at all).
- Secrets: `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET` (OAuth 1.0a user context, never in `wrangler.jsonc`).
- Cron: `"0 */3 * * *"`. At most one *new* candidate per tick.
- Video: X standard limit 0.5–140 s, mp4 H.264 + AAC. Chunks **4 MB**. STATUS `check_after_secs` clamped to 2–20 s; give up waiting after 120 s and resume next tick.
- Images: X limit 5 MB → skip media if the thumb object is larger.
- Clip key: `clips/<archive>/<record_id>.mp4`. CDN base: `https://assets.realufo.org/`.
- Daily slots (UTC): `pick` when hour ≥ 14, `highlight` when hour ≥ 20, one each per UTC day. `release` any tick, newest record of the group ≥ 2 h old.
- Highlights never use user-uploaded images; only the clip/thumb of `threads.source_record_id`.
- Model: reuse `ASK_LLM_MODEL` and `answerText` from `worker/lib/ask.ts`.
- Worker tests: `pnpm test:worker` (Node 22; the shell's default Node may differ — `nvm use 22` if localStorage-style errors appear). Python tests: `cd crawler && python3 -m pytest ingest/tests -q`.
- Other chats share this checkout: stage only files this plan touches; never `git add -A`.

## Review Focus

1. **Bare domain in a title or AI output** (e.g. "war.gov release", "aaro.mil") on a no-link post → must be stripped so the post is billed $0.015, not $0.20. Test in Task 4.
2. **CJK/emoji-heavy or 400-char title** → template must still fit 280 weighted chars and still contain the required id. Test in Task 4.
3. **`X_SINCE` unset at launch** → zero release posts (never announce the 590-record backlog). Test in Task 3.
4. **Same candidate picked twice** (overlapping ticks, retry) → `UNIQUE(stream, ref)` + `ON CONFLICT DO NOTHING` means one row and one X call. Test in Task 5.
5. **`FEATURE_X=on` but secrets missing** → no X calls, no rows, a log line. Test in Task 5.

---

## File Structure

| File | Responsibility |
|---|---|
| `db/migrations/0009_x_posts.sql` (new) | `x_posts` table |
| `worker/env.ts` (modify) | new vars/secrets on `Env` |
| `wrangler.jsonc` (modify) | cron trigger + vars |
| `worker/lib/x.ts` (new) | X API client: OAuth 1.0a signing, `createPost`, chunked `uploadMedia`, `mediaStatus` |
| `worker/lib/xpick.ts` (new) | candidate selection (release/pick/highlight), media lookup, budget |
| `worker/lib/xcopy.ts` (new) | weighted length, URL strip, validation, templates, AI draft |
| `worker/lib/xbot.ts` (new) | `tick()` orchestration: resume, budget gate, insert, upload, post, error states |
| `worker/index.ts` (modify) | `scheduled()` handler |
| `worker/routes/records.ts` (modify) | export `wargovReleases` |
| `crawler/ingest/clips.py` (new) | ffmpeg clip cutter → R2 |
| `.github/workflows/ingest.yml` (modify) | run `ingest.clips` after thumbs |
| tests: `worker/tests/x.spec.ts`, `xpick.spec.ts`, `xcopy.spec.ts`, `xbot.spec.ts`, `schema.spec.ts` (modify), `crawler/ingest/tests/test_clips.py` |

---

### Task 1: Schema, env, config

**Files:**
- Create: `db/migrations/0009_x_posts.sql`
- Modify: `worker/env.ts`, `wrangler.jsonc`, `worker/tests/schema.spec.ts:4`

**Interfaces:**
- Produces: table `x_posts(id, stream, ref, text, ai, media, media_id, cost_usd, status, tweet_id, error, attempts, created_at)`; `Env` fields `FEATURE_X`, `X_DAILY_MAX`, `X_MONTHLY_USD_CAP`, `X_HIGHLIGHT_MIN_VOTES`, `X_SINCE`, `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET` (all `string | undefined`).

- [ ] **Step 1: Write the failing test** — in `worker/tests/schema.spec.ts`, add `"x_posts"` to `EXPECTED` (alphabetical, after `"votes"`), and add inside `describe("schema", …)`:

```ts
  it("x_posts dedupes on (stream, ref) and checks status", async () => {
    const ins = (ref: string, status = "draft") =>
      env.DB.prepare("INSERT INTO x_posts(stream,ref,text,ai,cost_usd,status) VALUES ('pick',?,'t',0,0.015,?)").bind(ref, status).run();
    await ins("S-1");
    await expect(ins("S-1")).rejects.toThrow(/UNIQUE/);
    await expect(ins("S-2", "bogus")).rejects.toThrow(/CHECK/);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:worker -- worker/tests/schema.spec.ts`
Expected: FAIL — table list lacks `x_posts` / `no such table: x_posts`.

- [ ] **Step 3: Write the migration** — `db/migrations/0009_x_posts.sql`:

```sql
-- Spec 4: X bot. One row per (stream, ref) ever attempted; the UNIQUE is the
-- double-post guard (row is inserted BEFORE X is called).
CREATE TABLE x_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stream TEXT NOT NULL CHECK(stream IN ('release','pick','highlight')),
  ref TEXT NOT NULL,
  text TEXT NOT NULL,
  ai INTEGER NOT NULL,
  media TEXT,
  media_id TEXT,
  cost_usd REAL NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('draft','pending','processing','posted','failed')),
  tweet_id TEXT,
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(stream, ref)
);
CREATE INDEX idx_x_posts_created ON x_posts(created_at);
```

- [ ] **Step 4: Env + config** — append to the `Env` interface in `worker/env.ts`:

```ts
  FEATURE_X?: string; // off | dry | on (Spec 4)
  X_DAILY_MAX?: string;
  X_MONTHLY_USD_CAP?: string;
  X_HIGHLIGHT_MIN_VOTES?: string;
  X_SINCE?: string; // "YYYY-MM-DD"; empty = no release posts
  X_API_KEY?: string; // secrets: OAuth 1.0a user context for the bot account
  X_API_SECRET?: string;
  X_ACCESS_TOKEN?: string;
  X_ACCESS_SECRET?: string;
```

In `wrangler.jsonc`, extend `"vars"` (keep existing keys) with:

```jsonc
    // X bot (Spec 4): off | dry (drafts to x_posts, no X calls) | on
    "FEATURE_X": "off", "X_DAILY_MAX": "3", "X_MONTHLY_USD_CAP": "10", "X_HIGHLIGHT_MIN_VOTES": "5", "X_SINCE": ""
```

and add a top-level key after `"routes"`:

```jsonc
  "triggers": { "crons": ["0 */3 * * *"] }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test:worker -- worker/tests/schema.spec.ts`
Expected: PASS. Then `pnpm test:worker` — whole suite still green.

- [ ] **Step 6: Commit**

```bash
git add db/migrations/0009_x_posts.sql worker/env.ts wrangler.jsonc worker/tests/schema.spec.ts
git commit -m "feat(xbot): x_posts table, env vars, 3-hourly cron trigger"
```

---

### Task 2: X API client (`worker/lib/x.ts`)

**Files:**
- Create: `worker/lib/x.ts`
- Test: `worker/tests/x.spec.ts`

**Interfaces:**
- Produces:
  - `type XSecrets = { X_API_KEY: string; X_API_SECRET: string; X_ACCESS_TOKEN: string; X_ACCESS_SECRET: string }`
  - `class XError extends Error { status: number; body: string }`
  - `oauth1Header(method: string, url: string, s: XSecrets, form?: Record<string,string>, nonce?: string, ts?: string): Promise<string>`
  - `createPost(s: XSecrets, text: string, mediaIds?: string[]): Promise<string>` → tweet id
  - `type Source = { size: number; read(offset: number, length: number): Promise<ArrayBuffer> }`
  - `type Upload = { mediaId: string; ready: boolean }`
  - `uploadMedia(s: XSecrets, src: Source, mime: string, opts?: { sleep?: (ms: number) => Promise<void>; maxWaitMs?: number }): Promise<Upload>`
  - `mediaStatus(s: XSecrets, mediaId: string): Promise<"succeeded" | "failed" | "pending">`
  - `const CHUNK = 4 * 1024 * 1024`

- [ ] **Step 1: Write the failing tests** — `worker/tests/x.spec.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { oauth1Header, createPost, uploadMedia, mediaStatus, XError, CHUNK, type XSecrets } from "../lib/x";

// X's published "Creating a signature" example (docs.x.com); verified with an
// independent HMAC-SHA1 computation → hCtSmYh+iHYCEqBWrE7C7hYmtUk=
const EX: XSecrets = {
  X_API_KEY: "xvz1evFS4wEEPTGEFPHBog",
  X_API_SECRET: "kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw",
  X_ACCESS_TOKEN: "370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb",
  X_ACCESS_SECRET: "LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE",
};

type Call = { method: string; url: string; body: unknown; auth: string };
let calls: Call[] = [];
function mockX(handler: (c: Call) => { status?: number; json?: unknown }) {
  calls = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any, init: any = {}) => {
    const c = { method: init.method ?? "GET", url: String(input), body: init.body, auth: init.headers?.Authorization ?? "" };
    calls.push(c);
    const r = handler(c);
    return new Response(r.json === undefined ? "" : JSON.stringify(r.json), { status: r.status ?? 200 });
  });
}
afterEach(() => vi.restoreAllMocks());

const src = (size: number) => ({
  size,
  read: async (offset: number, length: number) => new Uint8Array(length).fill(offset % 251).buffer,
});
const noSleep = async () => {};

describe("oauth1Header", () => {
  it("matches X's published signature example", async () => {
    const h = await oauth1Header(
      "POST", "https://api.twitter.com/1.1/statuses/update.json?include_entities=true", EX,
      { status: "Hello Ladies + Gentlemen, a signed OAuth request!" },
      "kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg", "1318622958",
    );
    expect(h).toMatch(/^OAuth /);
    expect(h).toContain('oauth_signature="hCtSmYh%2BiHYCEqBWrE7C7hYmtUk%3D"');
    expect(h).toContain('oauth_consumer_key="xvz1evFS4wEEPTGEFPHBog"');
  });
});

describe("createPost", () => {
  it("posts JSON text + media ids and returns the tweet id", async () => {
    mockX(() => ({ status: 201, json: { data: { id: "777", text: "hi" } } }));
    expect(await createPost(EX, "hi", ["m1"])).toBe("777");
    expect(calls[0].url).toBe("https://api.x.com/2/tweets");
    expect(JSON.parse(calls[0].body as string)).toEqual({ text: "hi", media: { media_ids: ["m1"] } });
    expect(calls[0].auth).toMatch(/^OAuth .*oauth_signature="/);
  });
  it("throws XError with status on 4xx", async () => {
    mockX(() => ({ status: 403, json: { detail: "duplicate content" } }));
    const e = await createPost(EX, "hi").catch((e) => e);
    expect(e).toBeInstanceOf(XError);
    expect(e.status).toBe(403);
    expect(e.body).toContain("duplicate");
  });
});

describe("uploadMedia", () => {
  it("initialize → one append per 4 MB chunk → finalize → status until succeeded", async () => {
    let polls = 0;
    mockX((c) => {
      if (c.url.endsWith("/initialize")) return { json: { data: { id: "M1" } } };
      if (c.url.includes("/append")) return {};
      if (c.url.endsWith("/finalize")) return { json: { data: { id: "M1", processing_info: { state: "pending", check_after_secs: 1 } } } };
      polls++;
      return { json: { data: { processing_info: { state: polls < 2 ? "in_progress" : "succeeded" } } } };
    });
    const up = await uploadMedia(EX, src(CHUNK * 2 + 10), "video/mp4", { sleep: noSleep });
    expect(up).toEqual({ mediaId: "M1", ready: true });
    const init = JSON.parse(calls[0].body as string);
    expect(init).toEqual({ media_type: "video/mp4", total_bytes: CHUNK * 2 + 10, media_category: "tweet_video" });
    const appends = calls.filter((c) => c.url.includes("/append"));
    expect(appends.map((c) => (c.body as FormData).get("segment_index"))).toEqual(["0", "1", "2"]);
    expect(((appends[2].body as FormData).get("media") as Blob).size).toBe(10);
    expect(calls.at(-1)!.url).toBe("https://api.x.com/2/media/upload?command=STATUS&media_id=M1");
  });
  it("images skip STATUS when finalize returns no processing_info", async () => {
    mockX((c) => (c.url.endsWith("/initialize") ? { json: { data: { id: "I1" } } } : { json: { data: { id: "I1" } } }));
    expect(await uploadMedia(EX, src(1000), "image/jpeg", { sleep: noSleep })).toEqual({ mediaId: "I1", ready: true });
    expect(JSON.parse(calls[0].body as string).media_category).toBe("tweet_image");
    expect(calls.some((c) => c.url.includes("STATUS"))).toBe(false);
  });
  it("returns ready:false after maxWaitMs instead of blocking the tick", async () => {
    mockX((c) =>
      c.url.endsWith("/initialize") ? { json: { data: { id: "M2" } } }
      : c.url.includes("/append") ? {}
      : { json: { data: { processing_info: { state: "in_progress", check_after_secs: 20 } } } });
    expect(await uploadMedia(EX, src(10), "video/mp4", { sleep: noSleep, maxWaitMs: 30_000 })).toEqual({ mediaId: "M2", ready: false });
  });
  it("throws when processing fails", async () => {
    mockX((c) =>
      c.url.endsWith("/initialize") ? { json: { data: { id: "M3" } } }
      : c.url.includes("/append") ? {}
      : { json: { data: { processing_info: { state: "failed", error: { message: "bad codec" } } } } });
    await expect(uploadMedia(EX, src(10), "video/mp4", { sleep: noSleep })).rejects.toThrow(/bad codec/);
  });
});

describe("mediaStatus", () => {
  it("maps processing_info.state", async () => {
    mockX(() => ({ json: { data: { processing_info: { state: "in_progress" } } } }));
    expect(await mediaStatus(EX, "M")).toBe("pending");
    mockX(() => ({ json: { data: {} } }));
    expect(await mediaStatus(EX, "M")).toBe("succeeded");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:worker -- worker/tests/x.spec.ts`
Expected: FAIL — `Cannot find module '../lib/x'`.

- [ ] **Step 3: Implement** — `worker/lib/x.ts`:

```ts
// X API v2 client for the bot (Spec 4 §4.6). OAuth 1.0a user context:
// tokens never expire, so there is no refresh state to keep. JSON and
// multipart bodies are not part of the OAuth 1.0a signature; query params are.

export type XSecrets = { X_API_KEY: string; X_API_SECRET: string; X_ACCESS_TOKEN: string; X_ACCESS_SECRET: string };
export type Source = { size: number; read(offset: number, length: number): Promise<ArrayBuffer> };
export type Upload = { mediaId: string; ready: boolean };

const API = "https://api.x.com";
export const CHUNK = 4 * 1024 * 1024;

export class XError extends Error {
  constructor(public status: number, public body: string) {
    super(`X ${status}: ${body.slice(0, 300)}`);
  }
}

// RFC 3986: encodeURIComponent leaves !'()* unescaped.
const pct = (s: string) =>
  encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());

export async function oauth1Header(
  method: string, url: string, s: XSecrets, form: Record<string, string> = {},
  nonce = crypto.randomUUID().replace(/-/g, ""), ts = String(Math.floor(Date.now() / 1000)),
): Promise<string> {
  const u = new URL(url);
  const oauth: Record<string, string> = {
    oauth_consumer_key: s.X_API_KEY, oauth_nonce: nonce, oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: ts, oauth_token: s.X_ACCESS_TOKEN, oauth_version: "1.0",
  };
  const params = [...u.searchParams, ...Object.entries(form), ...Object.entries(oauth)]
    .map(([k, v]) => [pct(k), pct(v)] as const)
    .sort(([a, av], [b, bv]) => (a === b ? (av < bv ? -1 : av > bv ? 1 : 0) : a < b ? -1 : 1));
  const base = [method.toUpperCase(), pct(u.origin + u.pathname), pct(params.map(([k, v]) => `${k}=${v}`).join("&"))].join("&");
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(`${pct(s.X_API_SECRET)}&${pct(s.X_ACCESS_SECRET)}`), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sig = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(base)))));
  return "OAuth " + Object.entries({ ...oauth, oauth_signature: sig }).map(([k, v]) => `${pct(k)}="${pct(v)}"`).join(", ");
}

async function call(s: XSecrets, method: string, path: string, body?: { json?: unknown; form?: FormData }): Promise<any> {
  const url = API + path;
  const headers: Record<string, string> = { Authorization: await oauth1Header(method, url, s) };
  let payload: BodyInit | undefined;
  if (body?.json !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body.json);
  } else if (body?.form) payload = body.form;
  const r = await fetch(url, { method, headers, body: payload });
  const text = await r.text();
  if (!r.ok) throw new XError(r.status, text);
  return text ? JSON.parse(text) : {};
}

export async function createPost(s: XSecrets, text: string, mediaIds: string[] = []): Promise<string> {
  const j = await call(s, "POST", "/2/tweets", {
    json: { text, ...(mediaIds.length ? { media: { media_ids: mediaIds } } : {}) },
  });
  return String(j.data.id);
}

type Info = { state?: string; check_after_secs?: number; error?: { message?: string } } | undefined;
const statusInfo = async (s: XSecrets, id: string): Promise<Info> =>
  (await call(s, "GET", `/2/media/upload?command=STATUS&media_id=${id}`)).data?.processing_info;

export async function mediaStatus(s: XSecrets, mediaId: string): Promise<"succeeded" | "failed" | "pending"> {
  const info = await statusInfo(s, mediaId);
  return !info || info.state === "succeeded" ? "succeeded" : info.state === "failed" ? "failed" : "pending";
}

// Chunked v2 flow for images and video alike (one code path). Video encoding at
// X can outlast a tick: after maxWaitMs return ready:false and let the caller
// resume via mediaStatus() next tick (media ids live 24h).
export async function uploadMedia(
  s: XSecrets, src: Source, mime: string,
  opts: { sleep?: (ms: number) => Promise<void>; maxWaitMs?: number } = {},
): Promise<Upload> {
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const maxWaitMs = opts.maxWaitMs ?? 120_000;
  const media_category = mime.startsWith("video/") ? "tweet_video" : "tweet_image";
  const init = await call(s, "POST", "/2/media/upload/initialize", { json: { media_type: mime, total_bytes: src.size, media_category } });
  const id = String(init.data.id);
  for (let i = 0, off = 0; off < src.size; i++, off += CHUNK) {
    const form = new FormData();
    form.append("segment_index", String(i));
    form.append("media", new Blob([await src.read(off, Math.min(CHUNK, src.size - off))]));
    await call(s, "POST", `/2/media/upload/${id}/append`, { form });
  }
  let info: Info = (await call(s, "POST", `/2/media/upload/${id}/finalize`)).data?.processing_info;
  for (let waited = 0; info && info.state !== "succeeded"; ) {
    if (info.state === "failed") throw new XError(400, `media ${id} failed: ${info.error?.message ?? "unknown"}`);
    const ms = Math.min(20, Math.max(2, info.check_after_secs ?? 5)) * 1000;
    if (waited + ms > maxWaitMs) return { mediaId: id, ready: false };
    await sleep(ms);
    waited += ms;
    info = await statusInfo(s, id);
  }
  return { mediaId: id, ready: true };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:worker -- worker/tests/x.spec.ts`
Expected: PASS (all 8). If `vi.spyOn(globalThis, "fetch")` doesn't intercept inside workerd, switch the mock to `fetchMock` from `cloudflare:test` — do **not** change `x.ts` to take a fetch parameter.

- [ ] **Step 5: Commit**

```bash
git add worker/lib/x.ts worker/tests/x.spec.ts
git commit -m "feat(xbot): X API v2 client — OAuth 1.0a signing, posts, chunked media upload"
```

---

### Task 3: Candidate picker + budget (`worker/lib/xpick.ts`)

**Files:**
- Create: `worker/lib/xpick.ts`
- Modify: `worker/routes/records.ts` (add `export` to `async function wargovReleases`)
- Test: `worker/tests/xpick.spec.ts`

**Interfaces:**
- Consumes: `wargovReleases(env): Promise<{ no: number; date: string; raw: string[]; count: number }[]>` from `worker/routes/records.ts`.
- Produces:
  - `type Media = { key: string; mime: string; size: number } | null`
  - `type PickRecord = { id: string; archive: string; kind: string; title: string | null; agency: string | null; incident_date: string | null; location: string | null; summary: string | null; duration: number | null }`
  - `type Candidate =`
    `| { stream: "release"; ref: string; label: string; link: string; kinds: Record<string, number>; titles: string[]; media: Media }`
    `| { stream: "pick"; ref: string; record: PickRecord; media: Media }`
    `| { stream: "highlight"; ref: string; thread: { id: string; title: string; body: string; votes: number }; media: Media }`
  - `ARCHIVE_NAME: Record<string, string>` (domain-free display names)
  - `sqlTime(d: Date): string` → `"YYYY-MM-DD HH:MM:SS"` (D1 `datetime('now')` format)
  - `costOf(c: Candidate): number`
  - `withinBudget(env: Env, cost: number, now: Date): Promise<boolean>`
  - `nextCandidate(env: Env, now: Date): Promise<Candidate | null>`
  - `mediaFor(env: Env, rec: { id: string; archive: string; kind: string }): Promise<Media>`

- [ ] **Step 1: Write the failing tests** — `worker/tests/xpick.spec.ts`:

```ts
import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { seedTestDB } from "./helpers";
import { nextCandidate, withinBudget, costOf, mediaFor, sqlTime } from "../lib/xpick";

beforeAll(() => seedTestDB(env.DB));

const T = (iso: string) => new Date(iso + "Z");
const NOW = T("2026-10-10T15:00:00"); // pick slot open, highlight slot closed
const E = (extra: Record<string, unknown> = {}) => ({ ...env, X_SINCE: "2026-10-01", ...extra }) as any;

async function rec(id: string, kind: string, opts: { archive?: string; doc_date?: string; created?: string; thumb?: boolean } = {}) {
  const archive = opts.archive ?? "wargov";
  await env.DB.prepare(
    "INSERT INTO records(id,archive,kind,title,doc_date,status,created_at) VALUES (?,?,?,?,?,'live',?)"
  ).bind(id, archive, kind, `Title ${id}`, opts.doc_date ?? null, opts.created ?? "2026-09-01 00:00:00").run();
  if (opts.thumb) {
    await env.DB.prepare("INSERT INTO assets(record_id,role,cdn_url,mime) VALUES (?,'thumb',?,'image/jpeg')")
      .bind(id, `https://assets.realufo.org/thumbs/${archive}/${id}.jpg`).run();
    await env.MEDIA.put(`thumbs/${archive}/${id}.jpg`, new Uint8Array(100));
  }
}
const clip = (id: string, archive = "wargov", bytes = 100) => env.MEDIA.put(`clips/${archive}/${id}.mp4`, new Uint8Array(bytes));
const posted = (stream: string, ref: string, at: Date, cost = 0.015, status = "posted") =>
  env.DB.prepare("INSERT INTO x_posts(stream,ref,text,ai,cost_usd,status,created_at) VALUES (?,?,'t',0,?,?,?)")
    .bind(stream, ref, cost, status, sqlTime(at)).run();

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM x_posts").run();
  await env.DB.prepare("DELETE FROM assets WHERE record_id LIKE 'XT-%'").run();
  await env.DB.prepare("DELETE FROM records WHERE id LIKE 'XT-%'").run();
  await env.DB.prepare("DELETE FROM threads WHERE id LIKE 'XT-%'").run();
  // seed rows get created_at = real now, which would look like fresh releases
  await env.DB.prepare("UPDATE records SET created_at='2020-01-01 00:00:00'").run();
  const listed = await env.MEDIA.list({ prefix: "clips/" });
  for (const o of listed.objects) await env.MEDIA.delete(o.key);
});

describe("release candidates", () => {
  it("one summary per new war.gov release, linked to its archive filter, once settled 2h", async () => {
    await rec("XT-R1", "pdf", { doc_date: "10/8/26", created: "2026-10-10 06:10:00" });
    await rec("XT-R2", "video", { doc_date: "10/8/26", created: "2026-10-10 06:20:00" });
    await clip("XT-R2");
    expect((await nextCandidate(E(), T("2026-10-10T07:00:00")))?.stream).not.toBe("release"); // < 2h old
    const c = await nextCandidate(E(), T("2026-10-10T09:00:00"));
    expect(c).toMatchObject({ stream: "release", kinds: { pdf: 1, video: 1 } });
    if (c?.stream !== "release") throw 0;
    expect(c.ref).toMatch(/^wargov:R\d+$/);
    expect(c.link).toMatch(/^https:\/\/realufo\.org\/archive\?release=\d+$/);
    expect(c.media).toEqual({ key: "clips/wargov/XT-R2.mp4", mime: "video/mp4", size: 100 });
  });
  it("never announces releases when X_SINCE is unset, or ones older than X_SINCE", async () => {
    await rec("XT-R3", "pdf", { doc_date: "10/9/26", created: "2026-10-10 06:00:00" });
    expect((await nextCandidate(E({ X_SINCE: "" }), NOW))?.stream).not.toBe("release");
    expect((await nextCandidate(E({ X_SINCE: "2026-10-11" }), NOW))?.stream).not.toBe("release");
  });
  it("groups other archives by archive + ingest day", async () => {
    await rec("XT-A1", "image", { archive: "aaro", created: "2026-10-10 06:00:00" });
    const c = await nextCandidate(E(), NOW);
    expect(c).toMatchObject({ stream: "release", ref: "aaro:2026-10-10", link: "https://realufo.org/archive?archive=aaro" });
  });
  it("skips a release already in x_posts", async () => {
    await rec("XT-A2", "pdf", { archive: "aaro", created: "2026-10-10 06:00:00" });
    await posted("release", "aaro:2026-10-10", NOW);
    expect((await nextCandidate(E(), NOW))?.stream).not.toBe("release");
  });
});

describe("daily pick", () => {
  it("prefers a video that has a clip, once per UTC day after 14:00", async () => {
    await rec("XT-V1", "video");
    await clip("XT-V1");
    expect(await nextCandidate(E(), T("2026-10-10T13:00:00"))).toBeNull();
    const c = await nextCandidate(E(), NOW);
    expect(c).toMatchObject({ stream: "pick", ref: "XT-V1", media: { key: "clips/wargov/XT-V1.mp4", mime: "video/mp4" } });
    await posted("pick", "XT-V1", NOW);
    expect(await nextCandidate(E(), T("2026-10-10T18:00:00"))).toBeNull();
  });
  it("falls back to an image/pdf with its thumb when no clip is left", async () => {
    await rec("XT-I1", "image", { thumb: true });
    const c = await nextCandidate(E(), NOW);
    expect(c?.stream).toBe("pick");
    if (c?.stream !== "pick") throw 0;
    expect(["image", "pdf"]).toContain(c.record.kind);
  });
});

describe("highlight", () => {
  it("top-voted recent thread after 20:00, media only from its source record", async () => {
    await posted("pick", "already", T("2026-10-10T14:00:00"));
    await rec("XT-V2", "video");
    await clip("XT-V2");
    await env.DB.prepare(
      "INSERT INTO threads(id,title,op_body,votes,source_record_id,created_at) VALUES ('XT-T1','Odd lights','body text',99999,'XT-V2',?)"
    ).bind(sqlTime(T("2026-10-09T10:00:00"))).run();
    expect(await nextCandidate(E(), T("2026-10-10T19:00:00"))).toBeNull();
    const c = await nextCandidate(E(), T("2026-10-10T21:00:00"));
    expect(c).toMatchObject({ stream: "highlight", ref: "XT-T1", thread: { title: "Odd lights", votes: 99999 }, media: { key: "clips/wargov/XT-V2.mp4" } });
  });
});

describe("mediaFor", () => {
  it("skips thumbs over X's 5 MB image limit", async () => {
    await rec("XT-BIG", "image", { thumb: true });
    await env.MEDIA.put("thumbs/wargov/XT-BIG.jpg", new Uint8Array(5 * 1024 * 1024 + 1));
    expect(await mediaFor(E(), { id: "XT-BIG", archive: "wargov", kind: "image" })).toBeNull();
  });
});

describe("budget", () => {
  it("costs: URL $0.20, plain $0.015, +$0.015 with media", () => {
    const m = { key: "k", mime: "video/mp4", size: 1 };
    expect(costOf({ stream: "release", ref: "r", label: "", link: "", kinds: {}, titles: [], media: null })).toBeCloseTo(0.2);
    expect(costOf({ stream: "pick", ref: "p", record: {} as any, media: m })).toBeCloseTo(0.03);
  });
  it("enforces the daily max and monthly cap; failed rows don't count", async () => {
    await posted("pick", "a", NOW);
    await posted("pick", "b", NOW);
    await posted("pick", "f", NOW, 5, "failed");
    expect(await withinBudget(E(), 0.015, NOW)).toBe(true);
    await posted("pick", "c", NOW);
    expect(await withinBudget(E(), 0.015, NOW)).toBe(false); // 3/day
    expect(await withinBudget(E({ X_DAILY_MAX: "10", X_MONTHLY_USD_CAP: "0.05" }), 0.015, NOW)).toBe(false); // 0.045+0.015 > 0.05
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:worker -- worker/tests/xpick.spec.ts`
Expected: FAIL — `Cannot find module '../lib/xpick'`.

- [ ] **Step 3: Export `wargovReleases`** — in `worker/routes/records.ts` change `async function wargovReleases(env: Env)` to `export async function wargovReleases(env: Env)`.

- [ ] **Step 4: Implement** — `worker/lib/xpick.ts`:

```ts
import type { Env } from "../env";
import { wargovReleases } from "../routes/records";

// What the bot posts next (Spec 4 §4.2–4.4) and whether it can afford it.

export type Media = { key: string; mime: string; size: number } | null;
export type PickRecord = {
  id: string; archive: string; kind: string; title: string | null; agency: string | null;
  incident_date: string | null; location: string | null; summary: string | null; duration: number | null;
};
export type Candidate =
  | { stream: "release"; ref: string; label: string; link: string; kinds: Record<string, number>; titles: string[]; media: Media }
  | { stream: "pick"; ref: string; record: PickRecord; media: Media }
  | { stream: "highlight"; ref: string; thread: { id: string; title: string; body: string; votes: number }; media: Media };

// No dots: X auto-links bare domains like war.gov and bills them as URLs.
export const ARCHIVE_NAME: Record<string, string> = { wargov: "Dept. of War", aaro: "AARO", nara: "National Archives", nasa: "NASA" };

const CDN = "https://assets.realufo.org/";
const SITE = "https://realufo.org";
const IMAGE_MAX = 5 * 1024 * 1024; // X image limit
const SETTLE_MS = 2 * 3600_000; // ingest may still be adding files to a release

export const sqlTime = (d: Date) => d.toISOString().slice(0, 19).replace("T", " ");

export const costOf = (c: Candidate) => (c.stream === "release" ? 0.2 : 0.015) + (c.media ? 0.015 : 0); // ponytail: media upload unpriced on X's card; assume one post-create charge

// Rows that may have cost money: everything but failed.
export async function withinBudget(env: Env, cost: number, now: Date): Promise<boolean> {
  const t = sqlTime(now);
  const r = await env.DB.prepare(
    `SELECT sum(date(created_at)=date(?1)) today, coalesce(sum(CASE WHEN strftime('%Y-%m',created_at)=strftime('%Y-%m',?1) THEN cost_usd END),0) month
     FROM x_posts WHERE status!='failed'`
  ).bind(t).first<{ today: number | null; month: number }>();
  return (r?.today ?? 0) < Number(env.X_DAILY_MAX ?? 3) && (r?.month ?? 0) + cost <= Number(env.X_MONTHLY_USD_CAP ?? 10) + 1e-9;
}

export async function mediaFor(env: Env, rec: { id: string; archive: string; kind: string }): Promise<Media> {
  if (rec.kind === "video") {
    const key = `clips/${rec.archive}/${rec.id}.mp4`;
    const o = await env.MEDIA.head(key);
    if (o) return { key, mime: "video/mp4", size: o.size };
  }
  const t = await env.DB.prepare("SELECT cdn_url, mime FROM assets WHERE record_id=? AND role='thumb' LIMIT 1")
    .bind(rec.id).first<{ cdn_url: string; mime: string | null }>();
  if (!t?.cdn_url.startsWith(CDN)) return null;
  const key = t.cdn_url.slice(CDN.length);
  const o = await env.MEDIA.head(key);
  return o && o.size <= IMAGE_MAX ? { key, mime: t.mime ?? "image/jpeg", size: o.size } : null;
}

const postedToday = async (env: Env, stream: string, now: Date) =>
  !!(await env.DB.prepare("SELECT 1 FROM x_posts WHERE stream=? AND status!='failed' AND date(created_at)=date(?) LIMIT 1")
    .bind(stream, sqlTime(now)).first());
const isPosted = async (env: Env, stream: string, ref: string) =>
  !!(await env.DB.prepare("SELECT 1 FROM x_posts WHERE stream=? AND ref=?").bind(stream, ref).first());

type GroupRow = { id: string; archive: string; kind: string; title: string | null; created_at: string };

async function releaseFrom(env: Env, ref: string, label: string, link: string, rows: GroupRow[], now: Date): Promise<Candidate | null> {
  if (!rows.length || (await isPosted(env, "release", ref))) return null;
  const since = env.X_SINCE ?? "";
  const first = rows.reduce((a, r) => (r.created_at < a ? r.created_at : a), rows[0].created_at);
  const last = rows.reduce((a, r) => (r.created_at > a ? r.created_at : a), rows[0].created_at);
  if (!since || first < since || last > sqlTime(new Date(now.getTime() - SETTLE_MS))) return null;
  const kinds: Record<string, number> = {};
  for (const r of rows) kinds[r.kind] = (kinds[r.kind] ?? 0) + 1;
  let media: Media = null;
  for (const r of [...rows].sort((a, b) => Number(b.kind === "video") - Number(a.kind === "video")).slice(0, 5))
    if ((media = await mediaFor(env, r))) break;
  return { stream: "release", ref, label, link, kinds, titles: rows.slice(0, 5).map((r) => r.title ?? r.id), media };
}

async function releaseCandidate(env: Env, now: Date): Promise<Candidate | null> {
  if (!env.X_SINCE) return null;
  const cols = "id, archive, kind, title, created_at";
  for (const rel of (await wargovReleases(env)).reverse()) {
    const rows = await env.DB.prepare(
      `SELECT ${cols} FROM records WHERE archive='wargov' AND status='live' AND doc_date IN (${rel.raw.map(() => "?").join(",")}) ORDER BY id`
    ).bind(...rel.raw).all<GroupRow>();
    const no = String(rel.no).padStart(2, "0");
    const c = await releaseFrom(env, `wargov:R${rel.no}`, `${ARCHIVE_NAME.wargov} UAP Release ${no}`, `${SITE}/archive?release=${rel.no}`, rows.results, now);
    if (c) return c;
  }
  const groups = await env.DB.prepare(
    `SELECT archive, date(created_at) d FROM records WHERE archive!='wargov' AND status='live' AND date(created_at)>=?
     GROUP BY archive, d ORDER BY d DESC`
  ).bind(env.X_SINCE).all<{ archive: string; d: string }>();
  for (const g of groups.results) {
    const rows = await env.DB.prepare(`SELECT ${cols} FROM records WHERE archive=? AND status='live' AND date(created_at)=? ORDER BY id`)
      .bind(g.archive, g.d).all<GroupRow>();
    const name = ARCHIVE_NAME[g.archive] ?? g.archive.toUpperCase();
    const c = await releaseFrom(env, `${g.archive}:${g.d}`, `New ${name} files`, `${SITE}/archive?archive=${g.archive}`, rows.results, now);
    if (c) return c;
  }
  return null;
}

const PICK_COLS = `r.id, r.archive, r.kind, r.title, r.agency, r.incident_date, r.location, r.summary,
  (SELECT duration FROM assets d WHERE d.record_id=r.id AND d.role='full' AND d.duration IS NOT NULL LIMIT 1) duration`;
const UNPOSTED = "r.status='live' AND NOT EXISTS (SELECT 1 FROM x_posts p WHERE p.stream='pick' AND p.ref=r.id)";

async function clipIds(env: Env): Promise<string[]> {
  const ids: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.MEDIA.list({ prefix: "clips/", cursor });
    for (const o of page.objects) ids.push(o.key.split("/").pop()!.replace(/\.mp4$/, ""));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return ids;
}

async function pickCandidate(env: Env): Promise<Candidate | null> {
  // Videos with a clip first ("people need videos to keep watching"), then image/pdf with a thumb.
  let r = await env.DB.prepare(`SELECT ${PICK_COLS} FROM records r WHERE r.kind='video' AND r.id IN (SELECT value FROM json_each(?)) AND ${UNPOSTED} ORDER BY random() LIMIT 1`)
    .bind(JSON.stringify(await clipIds(env))).first<PickRecord>();
  r ??= await env.DB.prepare(
    `SELECT ${PICK_COLS} FROM records r WHERE r.kind IN ('image','pdf') AND ${UNPOSTED}
     AND EXISTS (SELECT 1 FROM assets a WHERE a.record_id=r.id AND a.role='thumb') ORDER BY r.kind='image' DESC, random() LIMIT 1`
  ).first<PickRecord>();
  return r ? { stream: "pick", ref: r.id, record: r, media: await mediaFor(env, r) } : null;
}

async function highlightCandidate(env: Env, now: Date): Promise<Candidate | null> {
  const t = await env.DB.prepare(
    `SELECT t.id, t.title, t.op_body, t.votes, t.source_record_id, r.archive, r.kind FROM threads t
     LEFT JOIN records r ON r.id=t.source_record_id
     WHERE t.votes>=? AND t.created_at>=datetime(?,'-7 days')
       AND NOT EXISTS (SELECT 1 FROM x_posts p WHERE p.stream='highlight' AND p.ref=t.id)
     ORDER BY t.votes DESC LIMIT 1`
  ).bind(Number(env.X_HIGHLIGHT_MIN_VOTES ?? 5), sqlTime(now))
    .first<{ id: string; title: string | null; op_body: string | null; votes: number; source_record_id: string | null; archive: string | null; kind: string | null }>();
  if (!t) return null;
  // Never user uploads: media only from the official record the thread is about.
  const media = t.source_record_id && t.archive && t.kind ? await mediaFor(env, { id: t.source_record_id, archive: t.archive, kind: t.kind }) : null;
  return { stream: "highlight", ref: t.id, thread: { id: t.id, title: t.title ?? "", body: (t.op_body ?? "").slice(0, 500), votes: t.votes }, media };
}

export async function nextCandidate(env: Env, now: Date): Promise<Candidate | null> {
  const h = now.getUTCHours();
  return (
    (await releaseCandidate(env, now)) ??
    (h >= 14 && !(await postedToday(env, "pick", now)) ? await pickCandidate(env) : null) ??
    (h >= 20 && !(await postedToday(env, "highlight", now)) ? await highlightCandidate(env, now) : null)
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test:worker -- worker/tests/xpick.spec.ts` then `pnpm test:worker -- worker/tests/records.spec.ts`
Expected: PASS. If a seed record outranks a test fixture (e.g. a seed thread with huge votes), raise the fixture value — do not filter seed ids in production SQL.

- [ ] **Step 6: Commit**

```bash
git add worker/lib/xpick.ts worker/tests/xpick.spec.ts worker/routes/records.ts
git commit -m "feat(xbot): candidate picker (release summary, video-first daily pick, highlight) + budget"
```

---

### Task 4: Copy — AI draft, validation, templates (`worker/lib/xcopy.ts`)

**Files:**
- Create: `worker/lib/xcopy.ts`
- Test: `worker/tests/xcopy.spec.ts`

**Interfaces:**
- Consumes: `Candidate`, `ARCHIVE_NAME` from `worker/lib/xpick.ts`; `ASK_LLM_MODEL`, `answerText` from `worker/lib/ask.ts`.
- Produces:
  - `weightedLength(text: string): number`
  - `stripLinks(text: string): string`
  - `mustContain(c: Candidate): string`
  - `template(c: Candidate): string`
  - `finalize(c: Candidate, raw: string, trusted?: boolean): string | null`
  - `draft(env: Env, c: Candidate): Promise<{ text: string; ai: boolean }>`

- [ ] **Step 1: Write the failing tests** — `worker/tests/xcopy.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { weightedLength, stripLinks, finalize, template, draft, mustContain } from "../lib/xcopy";
import type { Candidate, PickRecord } from "../lib/xpick";

const record = (over: Partial<PickRecord> = {}): PickRecord => ({
  id: "DOW-UAP-D012", archive: "wargov", kind: "video", title: "Object over Gulf", agency: "Navy",
  incident_date: "2019", location: "Gulf of Mexico", summary: "FLIR footage.", duration: 42, ...over,
});
const pick = (over: Partial<PickRecord> = {}): Candidate => ({ stream: "pick", ref: "DOW-UAP-D012", record: record(over), media: null });
const release: Candidate = {
  stream: "release", ref: "wargov:R7", label: "Dept. of War UAP Release 07", link: "https://realufo.org/archive?release=7",
  kinds: { pdf: 24, video: 5 }, titles: ["A", "B"], media: null,
};
const highlight: Candidate = { stream: "highlight", ref: "T1", thread: { id: "T1", title: "Odd lights", body: "b", votes: 9 }, media: null };
const fakeAI = (out: unknown) => ({ AI: { run: async () => (out instanceof Error ? Promise.reject(out) : out) } }) as any;

describe("weightedLength", () => {
  it("counts URLs as 23 and CJK/emoji as 2", () => {
    expect(weightedLength("abc")).toBe(3);
    expect(weightedLength("see https://realufo.org/archive?release=7")).toBe(4 + 23);
    expect(weightedLength("不明")).toBe(4);
    expect(weightedLength("👽")).toBe(2);
  });
});

describe("stripLinks", () => {
  it("removes scheme URLs, www, and bare domains X would auto-link", () => {
    expect(stripLinks("Files from war.gov and aaro.mil, see https://x.co/a or www.realufo.org now"))
      .toBe("Files from and, see or now");
    expect(stripLinks("U.S. Navy, Fig. 3, DOW-UAP-D012")).toBe("U.S. Navy, Fig. 3, DOW-UAP-D012");
  });
});

describe("finalize", () => {
  it("no-link streams never contain a URL or domain", () => {
    const t = finalize(pick(), "Navy FLIR clip DOW-UAP-D012 from realufo.org https://realufo.org/doc/x #UAP #aliens @someone")!;
    expect(t).not.toMatch(/https?:|\.org|@someone|#aliens/);
    expect(t).toContain("#UAP");
  });
  it("release posts get exactly their link appended", () => {
    const t = finalize(release, "Release 07 is out: 29 new files")!;
    expect(t.endsWith("\nhttps://realufo.org/archive?release=7")).toBe(true);
    expect(t.match(/https:\/\//g)).toHaveLength(1);
  });
  it("rejects AI text missing the required token, over length, or with banned claims", () => {
    expect(finalize(pick(), "A cool video")).toBeNull();
    expect(finalize(pick(), "DOW-UAP-D012 " + "x".repeat(300))).toBeNull();
    expect(finalize(pick(), "DOW-UAP-D012 is proof of alien craft")).toBeNull();
    expect(finalize(pick(), "DOW-UAP-D012 cover-up exposed")).toBeNull();
  });
});

describe("template", () => {
  it.each([
    ["pick", pick()],
    ["pick, 400-char title", pick({ title: "Very long title ".repeat(25) })],
    ["pick, CJK title", pick({ title: "未確認飛行物体".repeat(40) })],
    ["pick, title with a domain", pick({ title: "Video posted on war.gov" })],
    ["release", release],
    ["highlight", highlight],
  ])("%s always passes finalize", (_n, c) => {
    const t = finalize(c, template(c), true)!;
    expect(t).not.toBeNull();
    expect(t).toContain(mustContain(c));
    expect(weightedLength(t)).toBeLessThanOrEqual(280);
    if (c.stream !== "release") expect(t).not.toMatch(/https?:|\b[a-z0-9-]+\.(gov|mil|org|com)\b/i);
  });
});

describe("draft", () => {
  it("uses AI copy when it validates", async () => {
    const d = await draft(fakeAI({ response: "Navy FLIR clip DOW-UAP-D012, Gulf of Mexico, 2019. #UAP" }), pick());
    expect(d).toEqual({ text: "Navy FLIR clip DOW-UAP-D012, Gulf of Mexico, 2019. #UAP", ai: true });
  });
  it("falls back to template on bad AI output or AI error", async () => {
    expect((await draft(fakeAI({ response: "aliens!" }), pick())).ai).toBe(false);
    const d = await draft(fakeAI(new Error("AI down")), pick());
    expect(d.ai).toBe(false);
    expect(d.text).toContain("DOW-UAP-D012");
  });
  it("strips qwen3 <think> blocks", async () => {
    const d = await draft(fakeAI({ response: "<think>hmm</think>Clip DOW-UAP-D012 from 2019." }), pick());
    expect(d).toEqual({ text: "Clip DOW-UAP-D012 from 2019.", ai: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:worker -- worker/tests/xcopy.spec.ts`
Expected: FAIL — `Cannot find module '../lib/xcopy'`.

- [ ] **Step 3: Implement** — `worker/lib/xcopy.ts`:

```ts
import type { Env } from "../env";
import { ASK_LLM_MODEL, answerText } from "./ask";
import { ARCHIVE_NAME, type Candidate } from "./xpick";

// Post text (Spec 4 §4.5). AI writes, code guarantees: no stray URLs (billing),
// required id present, ≤280 weighted chars, no "proof of aliens" claims.

const TLD = "com|org|net|gov|mil|edu|io|co|us|uk|info|me|ai|app|dev|tv|ly|xyz";
const LINK_RE = new RegExp(String.raw`\bhttps?:\/\/\S+|\bwww\.\S+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:${TLD})\b\S*`, "gi");
const BANNED = [/\bconfirmed alien/i, /\bproof\b/i, /\bproves?\b/i, /cover[- ]?up/i, /\bexposed\b/i, /\bshocking\b/i, /\bnon-?human\b/i];

export function weightedLength(text: string): number {
  let n = 0;
  const rest = text.replace(/https?:\/\/\S+/g, () => ((n += 23), ""));
  for (const ch of rest) {
    const c = ch.codePointAt(0)!;
    n += c <= 0x10ff || (c >= 0x2000 && c <= 0x200d) || (c >= 0x2010 && c <= 0x201f) || (c >= 0x2032 && c <= 0x2037) ? 1 : 2;
  }
  return n;
}

export const stripLinks = (t: string) => t.replace(LINK_RE, "").replace(/[ \t]{2,}/g, " ").replace(/ ([,.;:!?])/g, "$1").trim();

export const mustContain = (c: Candidate) =>
  c.stream === "pick" ? c.record.id : c.stream === "release" ? c.label : "RealUFO";

const fit = (s: string, max: number) => {
  if (weightedLength(s) <= max) return s;
  let out = "";
  for (const ch of s) {
    if (weightedLength(out + ch) > max - 1) break;
    out += ch;
  }
  return out.trimEnd() + "…";
};

const kindsText = (k: Record<string, number>) =>
  Object.entries(k).map(([kind, n]) => `${n} ${kind === "pdf" ? "PDF" : kind}${n > 1 && kind !== "pdf" ? "s" : ""}`).join(", ");

export function template(c: Candidate): string {
  if (c.stream === "release") {
    const n = Object.values(c.kinds).reduce((a, b) => a + b, 0);
    return `NEW: ${c.label}. ${n} file${n === 1 ? "" : "s"} (${kindsText(c.kinds)}), mirrored and searchable. #UAP`;
  }
  if (c.stream === "pick") {
    const r = c.record;
    const meta = [ARCHIVE_NAME[r.archive] ?? r.archive, r.agency, r.location, r.incident_date].filter(Boolean).join(" · ");
    return `${r.id}: ${fit(stripLinks(r.title ?? ""), 120)}\n${fit(meta, 80)}\nFull file on RealUFO: ${r.id} #UAP`;
  }
  return `Top thread on RealUFO this week (${c.thread.votes} votes): ${fit(stripLinks(c.thread.title), 160)} #UAP`;
}

// trusted = template text (metadata verbatim), so skip the banned-claims check:
// a real file title may contain words like "proof".
export function finalize(c: Candidate, raw: string, trusted = false): string | null {
  let t = stripLinks(raw)
    .replace(/(^|\s)@\w+/g, "$1")
    .replace(/#(?!UAP\b)\w+/g, "")
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +\n/g, "\n")
    .trim();
  if (!t || !t.includes(mustContain(c))) return null;
  if (!trusted && BANNED.some((re) => re.test(t))) return null;
  if (c.stream === "release") t += "\n" + c.link;
  return weightedLength(t) <= 280 ? t : null;
}

const SYSTEM = (must: string) =>
  `You write posts for the RealUFO X account, a public archive of declassified government UAP/UFO files. ` +
  `Write ONE post under 220 characters. Say what the file is, where and when, in plain neutral language. ` +
  `Never claim it proves anything, never speculate about aliens. No URLs, no website names, no @mentions, ` +
  `at most one hashtag: #UAP. It must include this exact text: "${must}". Output only the post text.`;

function facts(c: Candidate) {
  if (c.stream === "release") return { release: c.label, files: c.kinds, sample_titles: c.titles };
  if (c.stream === "pick") {
    const r = c.record;
    return { id: r.id, title: r.title, source: ARCHIVE_NAME[r.archive] ?? r.archive, agency: r.agency, kind: r.kind,
      incident_date: r.incident_date, location: r.location, duration_s: r.duration, summary: r.summary?.slice(0, 500) };
  }
  return { community_thread_title: c.thread.title, thread_excerpt: c.thread.body, votes: c.thread.votes, site: "RealUFO" };
}

export async function draft(env: Env, c: Candidate): Promise<{ text: string; ai: boolean }> {
  try {
    const out = await env.AI.run(ASK_LLM_MODEL as any, {
      messages: [{ role: "system", content: SYSTEM(mustContain(c)) }, { role: "user", content: JSON.stringify(facts(c)) }],
      max_tokens: 200, temperature: 0.7, chat_template_kwargs: { enable_thinking: false },
    } as any);
    const t = finalize(c, answerText(out));
    if (t) return { text: t, ai: true };
  } catch {
    // AI down → template; the bot never skips a slot because of AI
  }
  return { text: finalize(c, template(c), true)!, ai: false };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:worker -- worker/tests/xcopy.spec.ts`
Expected: PASS. If `stripLinks` leaves different spacing than the expected string in the first `stripLinks` test, fix the regex cleanup, not the expectation's intent (no domains, single spaces, no space before punctuation).

- [ ] **Step 5: Commit**

```bash
git add worker/lib/xcopy.ts worker/tests/xcopy.spec.ts
git commit -m "feat(xbot): AI post copy with link-stripping validator and template fallback"
```

---

### Task 5: Bot tick + cron handler (`worker/lib/xbot.ts`)

**Files:**
- Create: `worker/lib/xbot.ts`
- Modify: `worker/index.ts` (add `scheduled`)
- Test: `worker/tests/xbot.spec.ts`

**Interfaces:**
- Consumes: `createPost`, `uploadMedia`, `mediaStatus`, `XError`, `XSecrets`, `Source` (Task 2); `nextCandidate`, `withinBudget`, `costOf`, `sqlTime`, `Candidate`, `Media` (Task 3); `draft` (Task 4).
- Produces: `tick(env: Env, now?: Date, sleep?: (ms: number) => Promise<void>): Promise<void>`; `scheduled` export on the worker default object.

- [ ] **Step 1: Write the failing tests** — `worker/tests/xbot.spec.ts`:

```ts
import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { seedTestDB } from "./helpers";
import { tick } from "../lib/xbot";
import { sqlTime } from "../lib/xpick";

beforeAll(() => seedTestDB(env.DB));

const NOW = new Date("2026-10-10T15:00:00Z"); // pick slot
const SECRETS = { X_API_KEY: "k", X_API_SECRET: "s", X_ACCESS_TOKEN: "t", X_ACCESS_SECRET: "ts" };
const AI = { run: async () => ({ response: "Clip XT-V1 from the Gulf. #UAP" }) };
const E = (extra: Record<string, unknown> = {}) => ({ ...env, ...SECRETS, AI, FEATURE_X: "on", X_SINCE: "", ...extra }) as any;
const noSleep = async () => {};

let xCalls: string[] = [];
let tweetStatus = 201;
let finalizeState: string | null = "succeeded";
beforeEach(async () => {
  await env.DB.prepare("DELETE FROM x_posts").run();
  await env.DB.prepare("DELETE FROM records WHERE id LIKE 'XT-%'").run();
  for (const o of (await env.MEDIA.list({ prefix: "clips/" })).objects) await env.MEDIA.delete(o.key);
  await env.DB.prepare("INSERT INTO records(id,archive,kind,title,status) VALUES ('XT-V1','wargov','video','Gulf object','live')").run();
  await env.MEDIA.put("clips/wargov/XT-V1.mp4", new Uint8Array(5 * 1024 * 1024)); // 2 chunks
  xCalls = []; tweetStatus = 201; finalizeState = "succeeded";
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any) => {
    const u = String(input);
    xCalls.push(u.replace("https://api.x.com", ""));
    const json = (j: unknown, status = 200) => new Response(JSON.stringify(j), { status });
    if (u.endsWith("/initialize")) return json({ data: { id: "M1" } });
    if (u.includes("/append")) return new Response(null, { status: 204 });
    if (u.endsWith("/finalize")) return json({ data: { id: "M1", ...(finalizeState ? { processing_info: { state: finalizeState, check_after_secs: 20 } } : {}) } });
    if (u.includes("command=STATUS")) return json({ data: { processing_info: { state: finalizeState ?? "succeeded" } } });
    if (u.endsWith("/2/tweets")) return tweetStatus < 300 ? json({ data: { id: "T99" } }, tweetStatus) : json({ title: "err" }, tweetStatus);
    throw new Error("unexpected fetch " + u);
  });
});
afterEach(() => vi.restoreAllMocks());

const rows = async () => (await env.DB.prepare("SELECT * FROM x_posts ORDER BY id").all<any>()).results;

describe("tick", () => {
  it("off: does nothing", async () => {
    await tick(E({ FEATURE_X: "off" }), NOW, noSleep);
    expect(await rows()).toEqual([]);
    expect(xCalls).toEqual([]);
  });
  it("dry: writes a draft row and calls no X endpoint", async () => {
    await tick(E({ FEATURE_X: "dry" }), NOW, noSleep);
    const r = await rows();
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ stream: "pick", ref: "XT-V1", status: "draft", ai: 1, media: "clip:clips/wargov/XT-V1.mp4" });
    expect(r[0].cost_usd).toBeCloseTo(0.03);
    expect(xCalls).toEqual([]);
  });
  it("on: uploads the clip in chunks and posts with its media id", async () => {
    await tick(E(), NOW, noSleep);
    expect(xCalls).toEqual(["/2/media/upload/initialize", "/2/media/upload/M1/append", "/2/media/upload/M1/append", "/2/media/upload/M1/finalize", "/2/tweets"]);
    expect((await rows())[0]).toMatchObject({ status: "posted", tweet_id: "T99", media_id: "M1" });
  });
  it("on without secrets: no X calls, no rows", async () => {
    await tick(E({ X_API_KEY: undefined }), NOW, noSleep);
    expect(xCalls).toEqual([]);
    expect(await rows()).toEqual([]);
  });
  it("overlapping ticks on the same candidate → one row, one post", async () => {
    // both ticks can pick XT-V1 before either inserts; ON CONFLICT DO NOTHING makes one a no-op
    await Promise.all([tick(E(), NOW, noSleep), tick(E(), NOW, noSleep)]);
    expect(xCalls.filter((u) => u === "/2/tweets")).toHaveLength(1);
    expect(await rows()).toHaveLength(1);
  });
  it("video still encoding → processing, then resumed and posted next tick", async () => {
    finalizeState = "in_progress";
    await tick(E(), NOW, noSleep);
    expect((await rows())[0]).toMatchObject({ status: "processing", media_id: "M1" });
    finalizeState = "succeeded";
    xCalls = [];
    await tick(E(), new Date("2026-10-10T18:00:00Z"), noSleep);
    expect(xCalls).toContain("/2/tweets");
    expect((await rows())[0]).toMatchObject({ status: "posted", tweet_id: "T99" });
  });
  it("403 → failed, no retry; 429 → pending with attempts, retried next tick", async () => {
    tweetStatus = 403;
    await tick(E(), NOW, noSleep);
    expect((await rows())[0]).toMatchObject({ status: "failed" });
    await env.DB.prepare("DELETE FROM x_posts").run();
    tweetStatus = 429;
    await tick(E(), NOW, noSleep);
    expect((await rows())[0]).toMatchObject({ status: "pending", attempts: 1 });
    tweetStatus = 201;
    await tick(E(), new Date("2026-10-10T18:00:00Z"), noSleep);
    expect((await rows())[0]).toMatchObject({ status: "posted" });
  });
  it("media upload failure still posts, without media", async () => {
    finalizeState = "failed";
    await tick(E(), NOW, noSleep);
    expect(xCalls.at(-1)).toBe("/2/tweets");
    expect((await rows())[0]).toMatchObject({ status: "posted", media_id: null });
  });
  it("crashed pending row (attempts=0) is left alone", async () => {
    await env.DB.prepare("INSERT INTO x_posts(stream,ref,text,ai,cost_usd,status,created_at) VALUES ('pick','XT-V1','t',0,0.03,'pending',?)")
      .bind(sqlTime(NOW)).run();
    await tick(E(), new Date("2026-10-11T15:00:00Z"), noSleep);
    // may post some other pick, but never retries the crashed row (X may have created it)
    const r = await env.DB.prepare("SELECT status, attempts FROM x_posts WHERE ref='XT-V1'").first();
    expect(r).toEqual({ status: "pending", attempts: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:worker -- worker/tests/xbot.spec.ts`
Expected: FAIL — `Cannot find module '../lib/xbot'`.

- [ ] **Step 3: Implement** — `worker/lib/xbot.ts`:

```ts
import type { Env } from "../env";
import { createPost, uploadMedia, mediaStatus, XError, type XSecrets, type Source } from "./x";
import { nextCandidate, withinBudget, costOf, sqlTime, type Media } from "./xpick";
import { draft } from "./xcopy";

// One cron tick (Spec 4 §3, §6). Row goes in BEFORE X is called: UNIQUE(stream, ref)
// makes a second attempt at the same candidate a no-op.

type Row = { id: number; text: string; media_id: string | null; attempts: number; created_at: string };
const MAX_ATTEMPTS = 3;
const log = (o: Record<string, unknown>) => console.log(JSON.stringify({ xbot: true, ...o }));

const secretsOf = (env: Env): XSecrets | null =>
  env.X_API_KEY && env.X_API_SECRET && env.X_ACCESS_TOKEN && env.X_ACCESS_SECRET
    ? { X_API_KEY: env.X_API_KEY, X_API_SECRET: env.X_API_SECRET, X_ACCESS_TOKEN: env.X_ACCESS_TOKEN, X_ACCESS_SECRET: env.X_ACCESS_SECRET }
    : null;

const r2Source = (env: Env, key: string, size: number): Source => ({
  size,
  read: async (offset, length) => (await env.MEDIA.get(key, { range: { offset, length } }))!.arrayBuffer(),
});

async function post(env: Env, s: XSecrets, row: Row, mediaIds: string[]) {
  try {
    const tweet = await createPost(s, row.text, mediaIds);
    await env.DB.prepare("UPDATE x_posts SET status='posted', tweet_id=?, error=NULL WHERE id=?").bind(tweet, row.id).run();
    log({ posted: row.id, tweet });
  } catch (e) {
    const status = e instanceof XError ? e.status : 0; // 0 = network error: X likely created nothing
    const retry = status === 0 || status === 429 || status >= 500;
    const attempts = row.attempts + 1;
    const final = !retry || attempts >= MAX_ATTEMPTS;
    await env.DB.prepare("UPDATE x_posts SET status=?, attempts=?, error=? WHERE id=?")
      .bind(final ? "failed" : "pending", attempts, String(e).slice(0, 500), row.id).run();
    log({ error: row.id, status, final });
  }
}

async function resume(env: Env, s: XSecrets, now: Date) {
  const { results } = await env.DB.prepare(
    "SELECT id, text, media_id, attempts, created_at, status FROM x_posts WHERE status='processing' OR (status='pending' AND attempts>0)"
  ).all<Row & { status: string }>();
  const hourAgo = sqlTime(new Date(now.getTime() - 3600_000));
  for (const row of results) {
    if (row.status === "pending") {
      await post(env, s, row, row.media_id ? [row.media_id] : []);
      continue;
    }
    const st = await mediaStatus(s, row.media_id!).catch(() => "failed" as const);
    if (st === "pending" && row.created_at > hourAgo) continue; // still encoding; check next tick
    await env.DB.prepare("UPDATE x_posts SET status='pending' WHERE id=?").bind(row.id).run();
    await post(env, s, row, st === "succeeded" ? [row.media_id!] : []);
  }
}

async function upload(env: Env, s: XSecrets, rowId: number, media: Media, sleep?: (ms: number) => Promise<void>) {
  if (!media) return { ids: [] as string[], processing: false };
  try {
    const up = await uploadMedia(s, r2Source(env, media.key, media.size), media.mime, { sleep });
    await env.DB.prepare("UPDATE x_posts SET media_id=? WHERE id=?").bind(up.mediaId, rowId).run();
    return { ids: up.ready ? [up.mediaId] : [], processing: !up.ready };
  } catch (e) {
    log({ mediaFailed: rowId, error: String(e).slice(0, 200) }); // post goes out without media
    return { ids: [], processing: false };
  }
}

export async function tick(env: Env, now = new Date(), sleep?: (ms: number) => Promise<void>) {
  const mode = env.FEATURE_X ?? "off";
  if (mode !== "dry" && mode !== "on") return;
  const s = secretsOf(env);
  if (mode === "on" && !s) return log({ skipped: "missing X secrets" });
  if (s && mode === "on") await resume(env, s, now);

  const c = await nextCandidate(env, now);
  if (!c) return log({ idle: true });
  const cost = costOf(c);
  if (!(await withinBudget(env, cost, now))) return log({ budget: c.stream, ref: c.ref });

  const { text, ai } = await draft(env, c);
  const media = c.media ? `${c.media.mime.startsWith("video/") ? "clip" : "thumb"}:${c.media.key}` : null;
  const ins = await env.DB.prepare(
    `INSERT INTO x_posts(stream,ref,text,ai,media,cost_usd,status,created_at) VALUES (?,?,?,?,?,?,?,?)
     ON CONFLICT(stream, ref) DO NOTHING RETURNING id`
  ).bind(c.stream, c.ref, text, ai ? 1 : 0, media, cost, mode === "dry" ? "draft" : "pending", sqlTime(now)).first<{ id: number }>();
  if (!ins) return log({ duplicate: c.stream, ref: c.ref });
  log({ stream: c.stream, ref: c.ref, mode, ai, media, cost });
  if (mode === "dry" || !s) return;

  const up = await upload(env, s, ins.id, c.media, sleep);
  if (up.processing) {
    await env.DB.prepare("UPDATE x_posts SET status='processing' WHERE id=?").bind(ins.id).run();
    return;
  }
  await post(env, s, { id: ins.id, text, media_id: null, attempts: 0, created_at: sqlTime(now) }, up.ids);
}
```

Then in `worker/index.ts` add the import and handler:

```ts
import { tick } from "./lib/xbot";
```

```ts
  async scheduled(_c: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(tick(env)); // X bot (Spec 4); FEATURE_X gates it
  },
```

(placed after the `fetch` method inside the default export object).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:worker -- worker/tests/xbot.spec.ts` then `pnpm test:worker`
Expected: all PASS. The "processing" test relies on `maxWaitMs` default 120 s with `check_after_secs: 20` and `noSleep` → loop runs 6 polls then returns `ready:false` instantly.

- [ ] **Step 5: Commit**

```bash
git add worker/lib/xbot.ts worker/tests/xbot.spec.ts worker/index.ts
git commit -m "feat(xbot): cron tick — budget gate, dedupe insert, media upload, post, resume/retry"
```

---

### Task 6: Clip cutter (`crawler/ingest/clips.py`) + workflow step

**Files:**
- Create: `crawler/ingest/clips.py`
- Test: `crawler/ingest/tests/test_clips.py`
- Modify: `.github/workflows/ingest.yml` (new step after `thumbs`)

**Interfaces:**
- Consumes: `d1._d1_json(sql) -> list[dict]`, `r2.put(key, path, content_type)`, `fetch.head_ok(url) -> bool`, `models.R2_BASE`.
- Produces: R2 objects `clips/<archive>/<id>.mp4` (the Worker's only clip signal); CLI `python -m ingest.clips [--dry-run] [--limit N] [--out DIR]`.

- [ ] **Step 1: Write the failing tests** — `crawler/ingest/tests/test_clips.py`:

```python
from ingest.clips import window, ffmpeg_args, todo, key

def test_window_whole_up_to_140s_else_60s_from_35pct():
    assert window(42.0) == (0.0, 140.0)
    assert window(140.0) == (0.0, 140.0)
    assert window(None) == (0.0, 140.0)          # unknown duration: -t 140 caps it
    assert window(600.0) == (210.0, 60.0)
    s, n = window(141.0)
    assert s + n <= 141.0

def test_ffmpeg_args_are_x_compatible():
    a = ffmpeg_args("https://cdn/v.mp4", 210.0, 60.0, "/tmp/o.mp4")
    j = " ".join(a)
    assert a[a.index("-ss") + 1] == "210.00" and a[a.index("-t") + 1] == "60.00"
    assert a.index("-ss") < a.index("-i")        # input seek: fast on CDN range requests
    for flag in ("libx264", "yuv420p", "+faststart", "aac", "0:a:0?", "-fpsmax"):
        assert flag in j
    assert a[-1] == "/tmp/o.mp4"

def test_todo_dedupes_skips_existing_and_limits():
    rows = [{"id": "V1", "archive": "wargov", "cdn_url": "u1", "duration": 10},
            {"id": "V1", "archive": "wargov", "cdn_url": "u1b", "duration": 10},
            {"id": "V2", "archive": "aaro", "cdn_url": "u2", "duration": 200},
            {"id": "V3", "archive": "wargov", "cdn_url": "u3", "duration": 5}]
    exists = lambda url: url.endswith("/clips/aaro/V2.mp4")
    got = todo(rows, exists)
    assert [r["id"] for r in got] == ["V1", "V3"] and got[0]["cdn_url"] == "u1"
    assert [r["id"] for r in todo(rows, exists, limit=1)] == ["V1"]
    assert key(got[0]) == "clips/wargov/V1.mp4"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd crawler && python3 -m pytest ingest/tests/test_clips.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'ingest.clips'`.

- [ ] **Step 3: Implement** — `crawler/ingest/clips.py`:

```python
"""Cut X-ready MP4 clips for live videos (Spec 4 §4.7).

    python3 -m ingest.clips --dry-run --limit 2   # encode locally, no upload
    python3 -m ingest.clips                       # encode + R2 upload

Output: clips/<archive>/<id>.mp4. The Worker bot treats the object's existence
as "this video has a clip", so there is no D1 row. Videos up to 140 s (X's
standard limit) go whole; longer ones get 60 s from 35% in (same offset as
thumbs: skips the DoD "Unclassified" slates). Idempotent: existing clips skipped.
"""
import argparse, os, subprocess, sys, tempfile
from . import d1, fetch, r2
from .models import R2_BASE

MAX_WHOLE = 140.0
WINDOW = 60.0

SELECT = """SELECT r.id, r.archive, a.cdn_url, a.duration FROM records r
JOIN assets a ON a.record_id=r.id AND a.role='full'
WHERE r.status='live' AND a.mime LIKE 'video/%' ORDER BY r.id"""

def key(row) -> str:
    return f"clips/{row['archive']}/{row['id']}.mp4"

def window(duration):
    """(start, length) in seconds."""
    if not duration or duration <= MAX_WHOLE:
        return 0.0, MAX_WHOLE
    return round(duration * 0.35, 2), WINDOW

def ffmpeg_args(url, start, length, out):
    return ["ffmpeg", "-v", "error", "-y", "-ss", f"{start:.2f}", "-i", url, "-t", f"{length:.2f}",
            "-map", "0:v:0", "-map", "0:a:0?",
            "-vf", "scale='trunc(min(1280,iw)/2)*2':-2", "-fpsmax", "30",
            "-c:v", "libx264", "-profile:v", "main", "-pix_fmt", "yuv420p", "-preset", "veryfast",
            "-crf", "23", "-maxrate", "1500k", "-bufsize", "3000k",
            "-c:a", "aac", "-b:a", "128k", "-ac", "2", "-movflags", "+faststart", out]

def todo(rows, exists=fetch.head_ok, limit=None):
    seen, out = set(), []
    for r in rows:
        if r["id"] in seen:
            continue
        seen.add(r["id"])
        if exists(f"{R2_BASE}/{key(r)}"):
            continue
        out.append(r)
        if limit and len(out) >= limit:
            break
    return out

def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="encode to --out only; no R2 upload")
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--out", default=os.path.join(tempfile.gettempdir(), "realufo-clips"))
    args = ap.parse_args(argv)
    rows = todo(d1._d1_json(" ".join(SELECT.split())), limit=args.limit)
    os.makedirs(args.out, exist_ok=True)
    done = failed = 0
    for i, row in enumerate(rows, 1):
        out = os.path.join(args.out, f"{row['id']}.mp4")
        start, length = window(row["duration"])
        p = subprocess.run(ffmpeg_args(row["cdn_url"], start, length, out), capture_output=True, text=True)
        if p.returncode or not os.path.exists(out) or not os.path.getsize(out):
            failed += 1
            print(f"[{i}/{len(rows)}] FAIL {row['id']}: {p.stderr.strip()[-300:]}")
            continue
        if not args.dry_run:
            r2.put(key(row), out, "video/mp4")
        done += 1
        print(f"[{i}/{len(rows)}] ok   {row['id']} {start:.0f}s+{length:.0f}s {os.path.getsize(out) // 1024} KB -> {key(row)}")
    print(f"{'dry-run ' if args.dry_run else ''}clips={done} failed={failed} out={args.out}")
    sys.exit(1 if failed else 0)

if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd crawler && python3 -m pytest ingest/tests/test_clips.py -q && python3 -m pytest ingest/tests -q`
Expected: PASS.

- [ ] **Step 5: Real encode spot-check (manual, needs `brew install ffmpeg` — already installed)** — `.env` token must have D1 read:

Run: `cd crawler && python3 -m ingest.clips --dry-run --limit 3`
Expected: `clips=3 failed=0`. Open the 3 files in `$TMPDIR/realufo-clips/`: each plays, ≤ 140 s, ≤ ~26 MB, `ffprobe` shows `h264 (Main)` + `aac` (or no audio stream).

- [ ] **Step 6: Workflow step** — in `.github/workflows/ingest.yml`, insert directly after the `thumbs` step (same indentation):

```yaml
      # X bot clips (Spec 4): 140 s-max MP4s at clips/<archive>/<id>.mp4 for new videos
      - name: clips
        if: ${{ !cancelled() }}
        working-directory: crawler
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          LIVE: ${{ github.event_name == 'schedule' || github.event.inputs.dry_run == 'false' }}
        run: |
          set -o pipefail
          if [ "$LIVE" = "true" ]; then
            python -m ingest.clips | tee -a ingest-summary.txt
          else
            python -m ingest.clips --dry-run --limit 1 | tee -a ingest-summary.txt
          fi
```

- [ ] **Step 7: Commit**

```bash
git add crawler/ingest/clips.py crawler/ingest/tests/test_clips.py .github/workflows/ingest.yml
git commit -m "feat(ingest): cut X-ready video clips to R2 for the bot"
```

---

### Task 7: Rollout (operations — no code)

Deploy from a clean worktree of HEAD (other chats share this checkout; see project memory). Deploy command: `pnpm run deploy`.

- [ ] **Step 1: Remote migration** — `pnpm db:migrate` (applies `0009_x_posts`). Verify: `npx wrangler d1 execute realufo-db --remote --command "SELECT count(*) FROM x_posts"` → `0`.
- [ ] **Step 2: Clip backfill** — `cd crawler && python3 -m ingest.clips` (165 videos). Expected `failed=0`; spot-check 3 via `https://assets.realufo.org/clips/wargov/<id>.mp4` in a browser.
- [ ] **Step 3: Deploy dry** — set `"FEATURE_X": "dry"` and `"X_SINCE": "<today, YYYY-MM-DD>"` in `wrangler.jsonc`, commit, deploy. `npx wrangler tail` around the next `:00` of a 3-hour mark shows `{"xbot":true,...}` lines.
- [ ] **Step 4: Review drafts for 2–3 days** — `npx wrangler d1 execute realufo-db --remote --command "SELECT stream,ref,ai,cost_usd,text FROM x_posts"`. Check every text: factual, no URL in pick/highlight, id present. Tune `SYSTEM`/`BANNED` in `xcopy.ts` if needed (commit + redeploy).
- [ ] **Step 5: USER does this (Claude must not enter credentials):** create the bot X account's developer app at developer.x.com → app permissions **Read and Write** → generate **Access Token and Secret** (OAuth 1.0a, for the bot account) → buy ~$10 credits in the Developer Console → run `npx wrangler secret put X_API_KEY` (and `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET`).
- [ ] **Step 6: Go live** — `DELETE FROM x_posts WHERE status='draft'` (remote), set `"FEATURE_X": "on"`, commit, deploy. Watch the first post with `wrangler tail`; open it on X: video plays, no link on picks, release post shows the realufo.org card.
- [ ] **Step 7: Update project memory** (`realufo-project-state.md`): X bot live date, `X_SINCE`, where drafts/costs live, how to pause (`FEATURE_X=off`).
