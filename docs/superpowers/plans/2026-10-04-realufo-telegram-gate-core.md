# Telegram Gate Core (Plan 1 of 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every post path (bot cron, `/__tick` operator posts, `scripts/publish.sh`, `scripts/article.py`, story polls) waits for the owner's tap in a private Telegram chat. The same bot posts to the RealUFO channel (id `-1004320401355`, public link `t.me/realufo_org` planned) as a 7th fan-out platform.

**Architecture:** A new D1 table `bot_jobs` sits between "a post is ready" and "a post is written to `x_posts` / site rows". The Worker sends each job to the owner as a Telegram preview (media + text + ✅/❌ buttons). The webhook `POST /__tg` turns the owner's tap into the old direct path, `publishDraft` (extracted from `xbot.tick`), unchanged. The existing X poster and social fan-out run from there. Plan 2 adds the media/brief/render pipeline (auto Shorts, money-shot stills, `record_evidence`). Plan 3 backfills evidence.

**Tech Stack:** Cloudflare Workers (TypeScript), D1, R2, Telegram Bot API, vitest with `@cloudflare/vitest-pool-workers`, Python 3 (`scripts/article.py`), bash (`scripts/publish.sh`).

**Spec:** `docs/superpowers/specs/2026-10-04-realufo-telegram-gate-design.md`

## Global Constraints

- Owner only: the webhook acts only when `from.id == TELEGRAM_OWNER_ID`; anything else gets HTTP 200 and is ignored.
- Webhook auth: header `X-Telegram-Bot-Api-Secret-Token` compared with `TELEGRAM_WEBHOOK_SECRET` in constant time (`sameSecret`); mismatch → 404.
- Soft delete only. Never hard `DELETE` `bot_jobs`, `bot_job_versions` or `social_posts` rows (`deleted_at`).
- One tap = one post. A job moves state only with `UPDATE … WHERE id=? AND version=? AND status IN (…)`, and approval acts only if that update changed exactly 1 row.
- Bot streams (`pick`, `release`, `highlight`, `poll`): at most one open job per stream. Operator streams (`manual`, `showcase`, `article`): at most one open job per (stream, ref).
- Telegram limits: media caption ≤ 1024 chars, message ≤ 4096 chars, bot upload ≤ 50 MB, bot download (`getFile`) ≤ 20 MB.
- `FEATURE_GATE=on` → no code path inserts an `x_posts`, `poll_social` or article/thread row without an approved job.
- R2 objects already posted are never overwritten.
- Migrations: the next number is `0038` (0037 is the latest). Deploy only with `pnpm run deploy` from a clean worktree (it applies migrations first). Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. The bare-deploy hook blocks the phrase "wrangler deploy" inside Bash commands, so write commit messages to a file and use `git commit -F`.
- Worker tests: `npx vitest run --config worker/vitest.config.ts worker/tests/<file>.spec.ts`. Full suite: `npx vitest run --config worker/vitest.config.ts`.

## Review Focus

1. **Telegram re-sends an update** (approval slower than Telegram's webhook timeout) → exactly one `x_posts` row; the second delivery answers "already handled". Pinned in Task 5.
2. **Owner replies to an old preview** after a newer version was sent → no edit; reply "that preview is out of date, reply to #N vN". Pinned in Task 5.
3. **Preview media too big or missing in R2** (showcase > 50 MB, deleted key) → the text + buttons still arrive, with a note and the CDN link. Pinned in Task 4.
4. **Updates from anyone else** (other users, the channel's own posts as `channel_post`, group adds as `my_chat_member`) → 200, nothing happens, nothing is sent. Pinned in Task 5.
5. **Approval while X can't post** (`FEATURE_X` off, monthly cap reached, missing secrets) → job `failed` with the reason, owner told in chat; never stuck as `approved`. Pinned in Task 5.

---

## File map

| File | Responsibility |
|---|---|
| `db/migrations/0038_bot_jobs.sql` | `bot_jobs`, `bot_job_versions`, `bot_settings`; `social_posts.platform` gains `'tg'` |
| `worker/lib/secret.ts` | `sameSecret` (moved from `worker/index.ts`) |
| `worker/lib/tg.ts` | Telegram Bot API client |
| `worker/lib/jobs.ts` | Job store: create, read, move, revise, settings |
| `worker/lib/xbot.ts` | Split `tick` into `stage` + `publishDraft`; gate branch |
| `worker/lib/xpick.ts` | Candidate queries skip refs that already have a job; picks pausable |
| `worker/lib/gate.ts` | Preview to Telegram, approve/skip execution, `queue()` |
| `worker/lib/indexnow.ts` | IndexNow ping from the Worker (article approval) |
| `worker/routes/tg.ts` | `POST /__tg` webhook: buttons, reply edits, commands, mp4 upload |
| `worker/lib/tgcmd.ts` | Admin commands |
| `worker/routes/job.ts` | `POST /__job` (ADMIN_TOKEN): operator jobs (article.py) |
| `worker/lib/social/tg.ts` | Telegram channel adapter |
| `worker/lib/social/{common,text,tick}.ts` | Register platform `tg` |
| `worker/lib/xpoll.ts` | Polls post only for approved slugs; queue poll jobs |
| `worker/index.ts` | Routes, `manualTick` under the gate |
| `worker/env.ts`, `wrangler.jsonc` | New vars/secrets |
| `scripts/publish.sh`, `scripts/article.py` | Operator paths create jobs |
| `scripts/tg-webhook.sh` | Register the webhook |
| `.claude/skills/{publish,publish-article,story-polls}/SKILL.md` | Say every post lands as a Telegram job |

---

### Task 1: Migration — job tables + Telegram platform

**Files:**
- Create: `db/migrations/0038_bot_jobs.sql`
- Test: `worker/tests/jobs-schema.spec.ts`

**Interfaces:**
- Produces: tables `bot_jobs`, `bot_job_versions`, `bot_settings` (row `paused_picks='1'`), and `social_posts.platform` accepting `'tg'`.

- [ ] **Step 1: Write the failing test**

```ts
// worker/tests/jobs-schema.spec.ts
import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import { seedTestDB } from "./helpers";

beforeAll(() => seedTestDB(env.DB));

describe("0038_bot_jobs", () => {
  it("creates the job tables with picks paused by default", async () => {
    const s = await env.DB.prepare("SELECT value FROM bot_settings WHERE key='paused_picks'").first<{ value: string }>();
    expect(s?.value).toBe("1");
    const j = await env.DB.prepare(
      "INSERT INTO bot_jobs(kind,stream,ref,status,caption,payload) VALUES ('post','pick','R1','post_wait','hi','{}') RETURNING id, version"
    ).first<{ id: number; version: number }>();
    expect(j?.version).toBe(1);
    await env.DB.prepare("INSERT INTO bot_job_versions(job_id,version,caption) VALUES (?,1,'hi')").bind(j!.id).run();
    await expect(env.DB.prepare("INSERT INTO bot_jobs(kind,stream,ref,status,payload) VALUES ('nope','pick','R1','post_wait','{}')").run()).rejects.toThrow();
    await expect(env.DB.prepare("INSERT INTO bot_jobs(kind,stream,ref,status,payload) VALUES ('post','pick','R1','bogus','{}')").run()).rejects.toThrow();
  });
  it("social_posts accepts the tg platform and keeps the live-row unique index", async () => {
    const x = await env.DB.prepare("INSERT INTO x_posts(stream,ref,text,ai,cost_usd,status) VALUES ('pick','TG-1','t',0,0,'posted') RETURNING id").first<{ id: number }>();
    await env.DB.prepare("INSERT INTO social_posts(x_post_id,platform,status) VALUES (?,'tg','posted')").bind(x!.id).run();
    await expect(env.DB.prepare("INSERT INTO social_posts(x_post_id,platform,status) VALUES (?,'tg','pending')").bind(x!.id).run()).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config worker/vitest.config.ts worker/tests/jobs-schema.spec.ts`
Expected: FAIL, `no such table: bot_settings`

- [ ] **Step 3: Write the migration**

```sql
-- db/migrations/0038_bot_jobs.sql
-- Telegram admin center (spec 2026-10-04-realufo-telegram-gate-design): every post waits for
-- the owner's tap. A job is a post that is ready but not written to x_posts / site rows yet.
CREATE TABLE bot_jobs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kind       TEXT NOT NULL CHECK(kind IN ('post','poll','showcase','article','video')),
  stream     TEXT NOT NULL,   -- bot: pick | release | highlight | poll · operator: manual | showcase | article
  ref        TEXT NOT NULL,   -- record id, release ref, thread id or article slug
  status     TEXT NOT NULL CHECK(status IN ('prep','media','brief_wait','making','video_wait','post_wait','handmade','approved','posted','skipped','failed')),
  version    INTEGER NOT NULL DEFAULT 1,
  caption    TEXT,            -- the text that will be posted (THREAD_SEP-joined for X threads)
  media      TEXT,            -- JSON {key, mime, size} or NULL
  payload    TEXT NOT NULL,   -- JSON: what approval executes (see worker/lib/gate.ts)
  tg_msgs    TEXT,            -- JSON array: Telegram message ids of the current preview
  error      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);
CREATE INDEX bot_jobs_stream ON bot_jobs(stream, status) WHERE deleted_at IS NULL;
CREATE INDEX bot_jobs_ref ON bot_jobs(ref) WHERE deleted_at IS NULL;

-- Every version of a job's caption/media is kept, with the owner's note and decision.
CREATE TABLE bot_job_versions (
  job_id     INTEGER NOT NULL REFERENCES bot_jobs(id),
  version    INTEGER NOT NULL,
  caption    TEXT,
  media      TEXT,
  note       TEXT,
  decision   TEXT,            -- post | skip | NULL (superseded)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (job_id, version)
);

CREATE TABLE bot_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
-- Bot picks wait for Plan 2 (auto Shorts at the making-shorts bar); /resume turns them on.
INSERT INTO bot_settings(key, value) VALUES ('paused_picks', '1');

-- social_posts.platform gains 'tg' (Telegram channel). SQLite can't widen a CHECK in place:
-- rebuild, same as 0023/0024.
CREATE TABLE social_posts_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  x_post_id INTEGER NOT NULL REFERENCES x_posts(id),
  platform TEXT NOT NULL CHECK(platform IN ('fb','ig','threads','bsky','yt','tiktok','tg')),
  status TEXT NOT NULL CHECK(status IN ('draft','pending','processing','posted','failed')),
  remote_id TEXT,
  container_id TEXT,
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);
INSERT INTO social_posts_new (id, x_post_id, platform, status, remote_id, container_id, error, attempts, created_at, deleted_at)
  SELECT id, x_post_id, platform, status, remote_id, container_id, error, attempts, created_at, deleted_at FROM social_posts;
DROP TABLE social_posts;
ALTER TABLE social_posts_new RENAME TO social_posts;
CREATE UNIQUE INDEX social_posts_live ON social_posts(x_post_id, platform) WHERE deleted_at IS NULL;
CREATE INDEX idx_social_posts_platform ON social_posts(platform, status);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --config worker/vitest.config.ts worker/tests/jobs-schema.spec.ts`
Expected: PASS (2 tests). Then run the full suite to confirm the rebuild breaks no social test: `npx vitest run --config worker/vitest.config.ts`, expected all pass.

- [ ] **Step 5: Commit**

```bash
git add db/migrations/0038_bot_jobs.sql worker/tests/jobs-schema.spec.ts
printf 'feat(db): bot_jobs + versions + settings; social_posts gains tg\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\n' > /tmp/msg && git commit -F /tmp/msg
```

---

### Task 2: Telegram client + shared `sameSecret`

**Files:**
- Create: `worker/lib/secret.ts`, `worker/lib/tg.ts`
- Modify: `worker/index.ts` (import `sameSecret` from `./lib/secret`, delete the local copy at the bottom of `manualTick`'s section)
- Modify: `worker/env.ts` (add Telegram vars)
- Test: `worker/tests/tg.spec.ts`

**Interfaces:**
- Produces:
  - `sameSecret(a: string, b: string): Promise<boolean>`
  - `class TgError extends Error { status: number; body: string }`
  - `type Keyboard = { text: string; callback_data: string }[][]`
  - `sendMessage(env, chat: string|number, text: string, keyboard?: Keyboard, replyTo?: number): Promise<number>` (message id)
  - `sendMedia(env, chat, key: string, caption?: string): Promise<number>` (photo or video by R2 content type; throws `TgError(404)` if the key is missing, `TgError(413)` if > 50 MB)
  - `answerCallback(env, id: string, text?: string): Promise<void>`
  - `clearButtons(env, chat, messageId: number): Promise<void>`
  - `getFile(env, fileId: string): Promise<ArrayBuffer>`
  - Env fields: `TELEGRAM_BOT_TOKEN?`, `TELEGRAM_WEBHOOK_SECRET?`, `TELEGRAM_OWNER_ID?`, `TELEGRAM_CHANNEL?`, `FEATURE_GATE?`, `FEATURE_SOCIAL_TG?`

- [ ] **Step 1: Write the failing test**

```ts
// worker/tests/tg.spec.ts
import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { sendMessage, sendMedia, answerCallback, TgError } from "../lib/tg";
import { sameSecret } from "../lib/secret";

const E = { ...env, TELEGRAM_BOT_TOKEN: "T0K" } as any;
let calls: { url: string; init: any }[] = [];
let reply: () => Response;
beforeEach(() => {
  calls = [];
  reply = () => new Response(JSON.stringify({ ok: true, result: { message_id: 42 } }));
  vi.spyOn(globalThis, "fetch").mockImplementation(async (u: any, init?: any) => { calls.push({ url: String(u), init }); return reply(); });
});
afterEach(() => vi.restoreAllMocks());

describe("tg client", () => {
  it("sendMessage posts JSON with buttons and returns the message id", async () => {
    const id = await sendMessage(E, 7, "hi", [[{ text: "✅", callback_data: "ok:1:1" }]], 5);
    expect(id).toBe(42);
    expect(calls[0].url).toBe("https://api.telegram.org/botT0K/sendMessage");
    expect(JSON.parse(calls[0].init.body)).toMatchObject({ chat_id: 7, text: "hi", reply_markup: { inline_keyboard: [[{ text: "✅", callback_data: "ok:1:1" }]] }, reply_parameters: { message_id: 5 } });
  });
  it("sendMedia picks sendVideo for mp4 and sendPhoto for images, multipart from R2", async () => {
    await env.MEDIA.put("tgtest/a.mp4", new Uint8Array(10), { httpMetadata: { contentType: "video/mp4" } });
    await env.MEDIA.put("tgtest/b.jpg", new Uint8Array(10), { httpMetadata: { contentType: "image/jpeg" } });
    await sendMedia(E, 7, "tgtest/a.mp4", "cap");
    await sendMedia(E, 7, "tgtest/b.jpg");
    expect(calls.map((c) => c.url.split("/").pop())).toEqual(["sendVideo", "sendPhoto"]);
    const f = calls[0].init.body as FormData;
    expect(f.get("chat_id")).toBe("7");
    expect(f.get("caption")).toBe("cap");
    expect(f.get("video")).toBeInstanceOf(Blob);
  });
  it("sendMedia throws 404 for a missing key and 413 over 50 MB, without calling Telegram", async () => {
    await expect(sendMedia(E, 7, "tgtest/none.mp4")).rejects.toMatchObject({ status: 404 });
    await env.MEDIA.put("tgtest/big.mp4", new Uint8Array(50 * 1024 * 1024 + 1), { httpMetadata: { contentType: "video/mp4" } });
    await expect(sendMedia(E, 7, "tgtest/big.mp4")).rejects.toMatchObject({ status: 413 });
    expect(calls).toEqual([]);
  });
  it("throws TgError when Telegram says ok:false", async () => {
    reply = () => new Response(JSON.stringify({ ok: false, description: "chat not found" }), { status: 400 });
    await expect(answerCallback(E, "q1")).rejects.toBeInstanceOf(TgError);
  });
  it("sameSecret compares in constant time", async () => {
    expect(await sameSecret("abc", "abc")).toBe(true);
    expect(await sameSecret("abc", "abd")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config worker/vitest.config.ts worker/tests/tg.spec.ts`
Expected: FAIL, cannot resolve `../lib/tg`

- [ ] **Step 3: Write the implementation**

```ts
// worker/lib/secret.ts
// Constant-time compare (hash both, then compare digests).
export async function sameSecret(a: string, b: string) {
  const h = async (s: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  const [x, y] = [await h(a), await h(b)];
  return x.length === y.length && x.every((v, i) => v === y[i]);
}
```

In `worker/index.ts`: delete the `sameSecret` function (and its comment) and add `import { sameSecret } from "./lib/secret";` with the other imports.

```ts
// worker/lib/tg.ts
import type { Env } from "../env";

// Telegram Bot API client (spec 2026-10-04-realufo-telegram-gate-design). HTTP or ok:false → TgError.
const API = "https://api.telegram.org";
const UPLOAD_MAX = 50 * 1024 * 1024; // bot upload limit

export class TgError extends Error {
  constructor(public status: number, public body: string) {
    super(`telegram ${status}: ${body.slice(0, 300)}`);
  }
}
export type Keyboard = { text: string; callback_data: string }[][];

async function call(env: Env, method: string, body: FormData | Record<string, unknown>): Promise<any> {
  const init: RequestInit = body instanceof FormData
    ? { method: "POST", body }
    : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
  const res = await fetch(`${API}/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, init);
  const text = await res.text();
  let j: any = {};
  try { j = JSON.parse(text); } catch { /* non-JSON = error below */ }
  if (!res.ok || !j.ok) throw new TgError(res.ok ? 502 : res.status, text);
  return j.result;
}

export async function sendMessage(env: Env, chat: string | number, text: string, keyboard?: Keyboard, replyTo?: number): Promise<number> {
  const r = await call(env, "sendMessage", {
    chat_id: chat, text, link_preview_options: { is_disabled: true },
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
    ...(replyTo ? { reply_parameters: { message_id: replyTo } } : {}),
  });
  return r.message_id;
}

export async function sendMedia(env: Env, chat: string | number, key: string, caption?: string): Promise<number> {
  const o = await env.MEDIA.get(key);
  if (!o) throw new TgError(404, `media missing in R2: ${key}`);
  if (o.size > UPLOAD_MAX) { await o.body.cancel(); throw new TgError(413, `${key} is ${o.size} bytes (> 50 MB)`); }
  const type = o.httpMetadata?.contentType ?? (key.endsWith(".mp4") ? "video/mp4" : "image/jpeg");
  const video = type.startsWith("video/");
  const f = new FormData();
  f.set("chat_id", String(chat));
  if (caption) f.set("caption", caption);
  if (video) f.set("supports_streaming", "true");
  f.set(video ? "video" : "photo", new Blob([await o.arrayBuffer()], { type }), key.split("/").pop()!);
  return (await call(env, video ? "sendVideo" : "sendPhoto", f)).message_id;
}

export const answerCallback = async (env: Env, id: string, text?: string) => {
  await call(env, "answerCallbackQuery", { callback_query_id: id, ...(text ? { text } : {}) });
};

export const clearButtons = async (env: Env, chat: string | number, messageId: number) => {
  await call(env, "editMessageReplyMarkup", { chat_id: chat, message_id: messageId, reply_markup: { inline_keyboard: [] } });
};

export async function getFile(env: Env, fileId: string): Promise<ArrayBuffer> {
  const f = await call(env, "getFile", { file_id: fileId });
  const res = await fetch(`${API}/file/bot${env.TELEGRAM_BOT_TOKEN}/${f.file_path}`);
  if (!res.ok) throw new TgError(res.status, await res.text());
  return res.arrayBuffer();
}
```

In `worker/env.ts`, after `VAPID_SUBJECT`:

```ts
  // Telegram admin center (spec 2026-10-04-realufo-telegram-gate-design)
  FEATURE_GATE?: string; // "on" = every post path waits for the owner's tap on Telegram
  FEATURE_SOCIAL_TG?: string; // off | dry | on: Telegram channel as a fan-out platform
  TELEGRAM_CHANNEL?: string; // channel chat id, e.g. "-1004320401355" (or "@username" once public)
  TELEGRAM_BOT_TOKEN?: string; // secrets
  TELEGRAM_WEBHOOK_SECRET?: string;
  TELEGRAM_OWNER_ID?: string;
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run --config worker/vitest.config.ts worker/tests/tg.spec.ts worker/tests/manual-tick.spec.ts`
Expected: PASS (5 + 1 tests)

- [ ] **Step 5: Commit**

```bash
git add worker/lib/secret.ts worker/lib/tg.ts worker/index.ts worker/env.ts worker/tests/tg.spec.ts
printf 'feat(worker): Telegram Bot API client; sameSecret shared\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\n' > /tmp/msg && git commit -F /tmp/msg
```

---

### Task 3: Job store

**Files:**
- Create: `worker/lib/jobs.ts`
- Test: `worker/tests/jobs.spec.ts`

**Interfaces:**
- Consumes: tables from Task 1; `Media` type from `worker/lib/xpick.ts` (`{ key: string; mime: string; size: number } | null`).
- Produces:
  - `type JobKind = "post" | "poll" | "showcase" | "article" | "video"`
  - `type JobStatus = "prep" | "media" | "brief_wait" | "making" | "video_wait" | "post_wait" | "handmade" | "approved" | "posted" | "skipped" | "failed"`
  - `type Job = { id: number; kind: JobKind; stream: string; ref: string; status: JobStatus; version: number; caption: string | null; media: Media; payload: any; tg_msgs: number[]; error: string | null }`
  - `OPEN: JobStatus[]` = every status except `posted`, `skipped`, `failed`
  - `BOT_STREAMS = ["pick", "release", "highlight", "poll"]`
  - `createJob(env, j: { kind: JobKind; stream: string; ref: string; status: JobStatus; caption: string | null; media: Media; payload: unknown }): Promise<Job | null>` (null = an open job blocks it)
  - `getJob(env, id: number): Promise<Job | null>`
  - `jobByMessage(env, messageId: number): Promise<Job | null>`
  - `move(env, id: number, version: number, from: JobStatus[], to: JobStatus, error?: string): Promise<boolean>`
  - `revise(env, id: number, version: number, caption: string, note: string): Promise<Job | null>`
  - `setMessages(env, id: number, msgs: number[]): Promise<void>`
  - `openJobs(env): Promise<Job[]>`
  - `getSetting(env, key: string): Promise<string | null>`, `setSetting(env, key: string, value: string): Promise<void>`
  - SQL fragment `NO_JOB(refExpr: string): string` → `NOT EXISTS (SELECT 1 FROM bot_jobs j WHERE j.ref=<refExpr> AND j.deleted_at IS NULL)`

- [ ] **Step 1: Write the failing test**

```ts
// worker/tests/jobs.spec.ts
import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { seedTestDB } from "./helpers";
import { createJob, getJob, jobByMessage, move, revise, setMessages, openJobs, getSetting, setSetting } from "../lib/jobs";

beforeAll(() => seedTestDB(env.DB));
beforeEach(async () => {
  await env.DB.prepare("DELETE FROM bot_job_versions").run();
  await env.DB.prepare("DELETE FROM bot_jobs").run();
});
const base = { kind: "post" as const, status: "post_wait" as const, caption: "c1", media: null, payload: { x: 1 } };

describe("jobs", () => {
  it("one open job per bot stream; operator streams per (stream, ref)", async () => {
    const a = await createJob(env as any, { ...base, stream: "pick", ref: "R1" });
    expect(a).toMatchObject({ stream: "pick", ref: "R1", version: 1, payload: { x: 1 }, tg_msgs: [] });
    expect(await createJob(env as any, { ...base, stream: "pick", ref: "R2" })).toBeNull();
    expect(await createJob(env as any, { ...base, stream: "manual", ref: "R1" })).not.toBeNull();
    expect(await createJob(env as any, { ...base, stream: "manual", ref: "R2" })).not.toBeNull();
    expect(await createJob(env as any, { ...base, stream: "manual", ref: "R2" })).toBeNull();
    await move(env as any, a!.id, 1, ["post_wait"], "skipped");
    expect(await createJob(env as any, { ...base, stream: "pick", ref: "R3" })).not.toBeNull();
  });
  it("move only from the expected status and version, once", async () => {
    const j = (await createJob(env as any, { ...base, stream: "pick", ref: "R1" }))!;
    expect(await move(env as any, j.id, 2, ["post_wait"], "approved")).toBe(false); // stale version
    expect(await move(env as any, j.id, 1, ["post_wait"], "approved")).toBe(true);
    expect(await move(env as any, j.id, 1, ["post_wait"], "approved")).toBe(false); // double tap
    const v = await env.DB.prepare("SELECT decision FROM bot_job_versions WHERE job_id=? AND version=1").bind(j.id).first<{ decision: string }>();
    expect(v?.decision).toBe("approved");
  });
  it("revise bumps the version, keeps the old version row, and drops old message ids", async () => {
    const j = (await createJob(env as any, { ...base, stream: "pick", ref: "R1" }))!;
    await setMessages(env as any, j.id, [10, 11]);
    expect((await jobByMessage(env as any, 11))?.id).toBe(j.id);
    const r = (await revise(env as any, j.id, 1, "c2", "shorter please"))!;
    expect(r).toMatchObject({ version: 2, caption: "c2", tg_msgs: [] });
    expect(await jobByMessage(env as any, 11)).toBeNull();
    const vs = (await env.DB.prepare("SELECT version, caption, note FROM bot_job_versions WHERE job_id=? ORDER BY version").bind(j.id).all()).results;
    expect(vs).toEqual([{ version: 1, caption: "c1", note: null }, { version: 2, caption: "c2", note: "shorter please" }]);
    expect(await revise(env as any, j.id, 1, "c3", "x")).toBeNull(); // stale version
  });
  it("openJobs lists only open jobs; settings round-trip", async () => {
    const j = (await createJob(env as any, { ...base, stream: "pick", ref: "R1" }))!;
    await createJob(env as any, { ...base, stream: "manual", ref: "R9" });
    await move(env as any, j.id, 1, ["post_wait"], "posted");
    expect((await openJobs(env as any)).map((x) => x.ref)).toEqual(["R9"]);
    await setSetting(env as any, "paused_picks", "0");
    expect(await getSetting(env as any, "paused_picks")).toBe("0");
    expect((await getJob(env as any, j.id))?.status).toBe("posted");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config worker/vitest.config.ts worker/tests/jobs.spec.ts`
Expected: FAIL, cannot resolve `../lib/jobs`

- [ ] **Step 3: Write the implementation**

```ts
// worker/lib/jobs.ts
import type { Env } from "../env";
import type { Media } from "./xpick";

// Job store for the Telegram gate (spec 2026-10-04-realufo-telegram-gate-design).
// A job = a post that is ready but waits for the owner's tap. Rows are never hard-deleted.

export type JobKind = "post" | "poll" | "showcase" | "article" | "video";
export type JobStatus = "prep" | "media" | "brief_wait" | "making" | "video_wait" | "post_wait" | "handmade" | "approved" | "posted" | "skipped" | "failed";
export type Job = {
  id: number; kind: JobKind; stream: string; ref: string; status: JobStatus; version: number;
  caption: string | null; media: Media; payload: any; tg_msgs: number[]; error: string | null;
};

export const OPEN: JobStatus[] = ["prep", "media", "brief_wait", "making", "video_wait", "post_wait", "handmade", "approved"];
export const BOT_STREAMS = ["pick", "release", "highlight", "poll"];
const OPEN_SQL = OPEN.map((s) => `'${s}'`).join(",");
const COLS = "id, kind, stream, ref, status, version, caption, media, payload, tg_msgs, error";

// Candidate queries use this to skip anything that already has a job (open, posted or skipped).
export const NO_JOB = (refExpr: string) => `NOT EXISTS (SELECT 1 FROM bot_jobs j WHERE j.ref=${refExpr} AND j.deleted_at IS NULL)`;

type Row = Omit<Job, "media" | "payload" | "tg_msgs"> & { media: string | null; payload: string; tg_msgs: string | null };
const parse = (r: Row | null): Job | null =>
  r && { ...r, media: r.media ? JSON.parse(r.media) : null, payload: JSON.parse(r.payload), tg_msgs: r.tg_msgs ? JSON.parse(r.tg_msgs) : [] };

export async function createJob(env: Env, j: { kind: JobKind; stream: string; ref: string; status: JobStatus; caption: string | null; media: Media; payload: unknown }): Promise<Job | null> {
  const exclusive = BOT_STREAMS.includes(j.stream) ? 1 : 0;
  const media = j.media ? JSON.stringify(j.media) : null;
  const row = await env.DB.prepare(
    `INSERT INTO bot_jobs(kind, stream, ref, status, caption, media, payload)
     SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7
     WHERE NOT EXISTS (SELECT 1 FROM bot_jobs WHERE deleted_at IS NULL AND status IN (${OPEN_SQL}) AND stream=?2 AND (?8 OR ref=?3))
     RETURNING ${COLS}`
  ).bind(j.kind, j.stream, j.ref, j.status, j.caption, media, JSON.stringify(j.payload), exclusive).first<Row>();
  if (!row) return null;
  await env.DB.prepare("INSERT INTO bot_job_versions(job_id, version, caption, media) VALUES (?, 1, ?, ?)").bind(row.id, j.caption, media).run();
  return parse(row);
}

export const getJob = async (env: Env, id: number) =>
  parse(await env.DB.prepare(`SELECT ${COLS} FROM bot_jobs WHERE id=? AND deleted_at IS NULL`).bind(id).first<Row>());

export const jobByMessage = async (env: Env, messageId: number) =>
  parse(await env.DB.prepare(
    `SELECT ${COLS} FROM bot_jobs b WHERE b.deleted_at IS NULL AND EXISTS (SELECT 1 FROM json_each(coalesce(b.tg_msgs,'[]')) WHERE value=?) ORDER BY id DESC LIMIT 1`
  ).bind(messageId).first<Row>());

export async function move(env: Env, id: number, version: number, from: JobStatus[], to: JobStatus, error?: string): Promise<boolean> {
  const r = await env.DB.prepare(
    `UPDATE bot_jobs SET status=?, error=?, updated_at=datetime('now')
     WHERE id=? AND version=? AND deleted_at IS NULL AND status IN (SELECT value FROM json_each(?))`
  ).bind(to, error ?? null, id, version, JSON.stringify(from)).run();
  if (r.meta.changes !== 1) return false;
  await env.DB.prepare("UPDATE bot_job_versions SET decision=? WHERE job_id=? AND version=?").bind(to, id, version).run();
  return true;
}

export async function revise(env: Env, id: number, version: number, caption: string, note: string): Promise<Job | null> {
  const row = await env.DB.prepare(
    `UPDATE bot_jobs SET version=version+1, caption=?, tg_msgs=NULL, updated_at=datetime('now')
     WHERE id=? AND version=? AND status='post_wait' AND deleted_at IS NULL RETURNING ${COLS}`
  ).bind(caption, id, version).first<Row>();
  if (!row) return null;
  await env.DB.prepare("INSERT INTO bot_job_versions(job_id, version, caption, media, note) VALUES (?, ?, ?, ?, ?)")
    .bind(id, row.version, caption, row.media, note).run();
  return parse(row);
}

export const setMessages = async (env: Env, id: number, msgs: number[]) => {
  await env.DB.prepare("UPDATE bot_jobs SET tg_msgs=? WHERE id=?").bind(JSON.stringify(msgs), id).run();
};

export const openJobs = async (env: Env) =>
  (await env.DB.prepare(`SELECT ${COLS} FROM bot_jobs WHERE deleted_at IS NULL AND status IN (${OPEN_SQL}) ORDER BY id`).all<Row>()).results.map((r) => parse(r)!);

export const getSetting = async (env: Env, key: string) =>
  (await env.DB.prepare("SELECT value FROM bot_settings WHERE key=?").bind(key).first<{ value: string }>())?.value ?? null;

export const setSetting = async (env: Env, key: string, value: string) => {
  await env.DB.prepare("INSERT INTO bot_settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(key, value).run();
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --config worker/vitest.config.ts worker/tests/jobs.spec.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add worker/lib/jobs.ts worker/tests/jobs.spec.ts
printf 'feat(worker): job store for the Telegram gate\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\n' > /tmp/msg && git commit -F /tmp/msg
```

---

### Task 4: Split the bot tick, gate it, send previews

**Files:**
- Modify: `worker/lib/xbot.ts` (split `tick` into exported `stage` + `publishDraft`; gate branch)
- Modify: `worker/lib/xpick.ts` (job-aware candidate queries; pausable picks)
- Create: `worker/lib/gate.ts` (`queue`, `preview`; `approve` and `skip` come in Task 5)
- Test: `worker/tests/gate.spec.ts`

**Interfaces:**
- Consumes: Task 2 `sendMessage`, `sendMedia`, `TgError`; Task 3 `createJob`, `setMessages`, `getSetting`, `NO_JOB`.
- Produces:
  - `type Draft = { stream: "release" | "pick" | "highlight" | "showcase"; ref: string; text: string; ai: boolean; media: Media; cost: number }` (exported from `xbot.ts`)
  - `stage(env, c: Candidate, now: Date): Promise<Draft | null>` (null = unsafe highlight or over budget)
  - `publishDraft(env, d: Draft, now?: Date, sleep?): Promise<number | null>` (x_posts id; throws `Error("FEATURE_X is off")` / `Error("missing X secrets")`)
  - `gateOn(env): boolean`
  - `queue(env, c: Candidate, d: Draft): Promise<Job | null>`
  - `preview(env, job: Job): Promise<void>`
  - `CDN = "https://assets.realufo.org/"` (re-used from xpick)

- [ ] **Step 1: Write the failing test**

```ts
// worker/tests/gate.spec.ts
import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { seedTestDB } from "./helpers";
import { tick } from "../lib/xbot";
import { setSetting } from "../lib/jobs";

beforeAll(() => seedTestDB(env.DB));

const NOW = new Date("2026-10-10T15:00:00Z");
const SECRETS = { X_API_KEY: "k", X_API_SECRET: "s", X_ACCESS_TOKEN: "t", X_ACCESS_SECRET: "ts" };
const TG = { TELEGRAM_BOT_TOKEN: "T0K", TELEGRAM_OWNER_ID: "777", FEATURE_GATE: "on" };
const AI = { run: async () => ({ response: "Clip GT-V1 from the Gulf. #UAP" }) };
const BOT = { X_PICK_HOURS: "14", X_DAILY_MAX: "3", X_MONTHLY_USD_CAP: "10" };
const E = (extra: Record<string, unknown> = {}) => ({ ...env, ...BOT, ...SECRETS, ...TG, AI, FEATURE_X: "on", X_SINCE: "", ...extra }) as any;

let tg: { method: string; body: any }[] = [];
let xCalls: string[] = [];
let failMedia = false;
beforeEach(async () => {
  for (const t of ["bot_job_versions", "bot_jobs", "x_posts"]) await env.DB.prepare(`DELETE FROM ${t}`).run();
  await env.DB.prepare("DELETE FROM records WHERE id LIKE 'GT-%'").run();
  for (const o of (await env.MEDIA.list({ prefix: "clips/" })).objects) await env.MEDIA.delete(o.key);
  await env.DB.prepare("INSERT INTO records(id,archive,kind,title,status) VALUES ('GT-V1','wargov','video','Gulf object','live'), ('GT-V2','wargov','video','Sea object','live')").run();
  await env.MEDIA.put("clips/wargov/GT-V1.mp4", new Uint8Array(100), { httpMetadata: { contentType: "video/mp4" } });
  await env.MEDIA.put("clips/wargov/GT-V2.mp4", new Uint8Array(100), { httpMetadata: { contentType: "video/mp4" } });
  await setSetting(env as any, "paused_picks", "0");
  tg = []; xCalls = []; failMedia = false;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (u: any, init?: any) => {
    const url = String(u);
    if (url.startsWith("https://api.telegram.org/")) {
      const method = url.split("/").pop()!;
      tg.push({ method, body: init.body instanceof FormData ? Object.fromEntries(init.body as any) : JSON.parse(init.body) });
      if (failMedia && method === "sendVideo") return new Response(JSON.stringify({ ok: false, description: "too big" }), { status: 413 });
      return new Response(JSON.stringify({ ok: true, result: { message_id: 100 + tg.length } }));
    }
    xCalls.push(url);
    throw new Error("unexpected fetch " + url);
  });
});
afterEach(() => vi.restoreAllMocks());

const jobs = async () => (await env.DB.prepare("SELECT stream, ref, status, kind, caption, tg_msgs FROM bot_jobs ORDER BY id").all<any>()).results;
const xposts = async () => (await env.DB.prepare("SELECT * FROM x_posts").all<any>()).results;

describe("gated tick", () => {
  it("makes a job and a Telegram preview instead of posting", async () => {
    await tick(E(), NOW);
    expect(await xposts()).toEqual([]);
    expect(xCalls).toEqual([]);
    const j = await jobs();
    expect(j).toHaveLength(1);
    expect(j[0]).toMatchObject({ stream: "pick", status: "post_wait", kind: "post" });
    expect(j[0].caption.endsWith(`https://realufo.org/doc/${j[0].ref}`)).toBe(true);
    expect(tg.map((t) => t.method)).toEqual(["sendVideo", "sendMessage"]);
    expect(tg[0].body.chat_id).toBe("777");
    expect(tg[1].body.reply_markup.inline_keyboard[0].map((b: any) => b.callback_data)).toEqual([expect.stringMatching(/^ok:\d+:1$/), expect.stringMatching(/^skip:\d+:1$/)]);
    expect(JSON.parse(j[0].tg_msgs)).toEqual([101, 102]);
  });
  it("one open pick job at a time; a skipped record is never offered again", async () => {
    await tick(E(), NOW);
    await tick(E(), NOW);
    expect(await jobs()).toHaveLength(1);
    const first = (await jobs())[0].ref;
    await env.DB.prepare("UPDATE bot_jobs SET status='skipped'").run();
    await tick(E(), NOW);
    const all = await jobs();
    expect(all).toHaveLength(2);
    expect(all[1].ref).not.toBe(first);
  });
  it("paused picks: no pick job", async () => {
    await setSetting(env as any, "paused_picks", "1");
    await tick(E(), NOW);
    expect(await jobs()).toEqual([]);
  });
  it("preview still arrives when the media can't be sent (too big / missing)", async () => {
    failMedia = true;
    await tick(E(), NOW);
    const msg = tg.find((t) => t.method === "sendMessage")!;
    expect(msg.body.text).toContain("media not attached");
    expect(msg.body.text).toContain("https://assets.realufo.org/clips/wargov/");
    expect(msg.body.reply_markup).toBeDefined();
  });
  it("gate off: posts directly as before", async () => {
    await tick(E({ FEATURE_GATE: "off", FEATURE_X: "dry" }), NOW);
    expect(await jobs()).toEqual([]);
    expect(await xposts()).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config worker/vitest.config.ts worker/tests/gate.spec.ts`
Expected: FAIL, the first test sees an `x_posts` row (or cannot resolve `../lib/gate` once imported)

- [ ] **Step 3: Job-aware candidates in `worker/lib/xpick.ts`**

Add the import at the top:

```ts
import { NO_JOB, getSetting } from "./jobs";
```

Change `isPosted`, `UNPOSTED`, the highlight query and `nextCandidate`:

```ts
// x_posts row or any job (open, posted, skipped): the bot never offers it again.
const isPosted = async (env: Env, stream: string, ref: string) =>
  !!(await env.DB.prepare(`SELECT 1 FROM x_posts WHERE stream=?1 AND ref=?2 UNION ALL SELECT 1 FROM bot_jobs j WHERE j.ref=?2 AND j.deleted_at IS NULL LIMIT 1`).bind(stream, ref).first());
```

```ts
const NO_X_PICK = `NOT EXISTS (SELECT 1 FROM x_posts p WHERE p.stream='pick' AND p.ref=r.id)`;
const UNPOSTED = `r.status='live' AND coalesce(r.title,'') NOT LIKE '%original title not published%'
  AND ${NO_X_PICK} AND ${NO_JOB("r.id")}`;
// Operator-forced picks ignore earlier jobs (the owner asked for this record again).
const UNPOSTED_FORCED = `r.status='live' AND ${NO_X_PICK}`;
```

In `forcedCandidate`, replace `${UNPOSTED}` with `${UNPOSTED_FORCED}`.

In `highlightCandidate`, add to the `WHERE` clause after the `x_posts` check:

```sql
       AND NOT EXISTS (SELECT 1 FROM bot_jobs j WHERE j.ref=t.id AND j.deleted_at IS NULL)
```

In `nextCandidate`, replace the pick line:

```ts
    ((await pickDue(env, now)) && (await getSetting(env, "paused_picks")) !== "1" ? await pickCandidate(env) : null) ??
```

- [ ] **Step 4: Split `tick` in `worker/lib/xbot.ts`**

Add the imports and replace everything from `export async function tick` to the end of the file:

```ts
import type { Candidate } from "./xpick";
import { gateOn, queue } from "./gate";
```

```ts
// A post ready to write to x_posts (the gate keeps it in bot_jobs.payload.x until the owner taps ✅).
export type Draft = { stream: Candidate["stream"]; ref: string; text: string; ai: boolean; media: Media; cost: number };

// Safety + budget + copy for a candidate. null = don't post it (logged).
export async function stage(env: Env, c: Candidate, now: Date): Promise<Draft | null> {
  if (c.stream === "highlight" && !isClean(c.thread.title)) {
    // never put a "proof of aliens" thread title on the official account; failed row = don't pick again
    await env.DB.prepare("INSERT INTO x_posts(stream,ref,text,ai,cost_usd,status,error,created_at) VALUES ('highlight',?,?,0,0,'failed','unsafe title',?) ON CONFLICT DO NOTHING")
      .bind(c.ref, c.thread.title, sqlTime(now)).run();
    log({ unsafe: c.ref });
    return null;
  }
  const cost = costOf(c);
  if (!(await withinBudget(env, cost, now, isManual(c)))) {
    log({ budget: c.stream, ref: c.ref });
    return null;
  }
  const { text, ai } = await draft(env, c);
  return { stream: c.stream, ref: c.ref, text, ai, media: c.media, cost };
}

// Write the x_posts row and post it (the pre-gate path, unchanged). Returns the row id (null = duplicate).
export async function publishDraft(env: Env, d: Draft, now = new Date(), sleep?: (ms: number) => Promise<void>): Promise<number | null> {
  const mode = env.FEATURE_X ?? "off";
  if (mode !== "dry" && mode !== "on") throw new Error("FEATURE_X is off");
  const s = secretsOf(env);
  if (mode === "on" && !s) throw new Error("missing X secrets");
  const media = d.media ? `${d.media.mime.startsWith("video/") ? "clip" : "thumb"}:${d.media.key}` : null;
  const ins = await env.DB.prepare(
    `INSERT INTO x_posts(stream,ref,text,ai,media,cost_usd,status,created_at) VALUES (?,?,?,?,?,?,?,?)
     ON CONFLICT(stream, ref) DO NOTHING RETURNING id`
  ).bind(d.stream, d.ref, d.text, d.ai ? 1 : 0, media, d.cost, mode === "dry" ? "draft" : "pending", sqlTime(now)).first<{ id: number }>();
  if (!ins) { log({ duplicate: d.stream, ref: d.ref }); return null; }
  log({ stream: d.stream, ref: d.ref, mode, ai: d.ai, media, cost: d.cost });
  if (mode === "dry" || !s) return ins.id;
  const up = await upload(env, s, ins.id, d.media, sleep);
  if (up.processing) {
    await env.DB.prepare("UPDATE x_posts SET status='processing' WHERE id=?").bind(ins.id).run();
    return ins.id;
  }
  await post(env, s, { id: ins.id, text: d.text, media_id: null, attempts: 0, created_at: sqlTime(now) }, up.ids);
  return ins.id;
}

export async function tick(env: Env, now = new Date(), sleep?: (ms: number) => Promise<void>) {
  const mode = env.FEATURE_X ?? "off";
  if (mode !== "dry" && mode !== "on") return;
  const s = secretsOf(env);
  if (mode === "on" && !s) return log({ skipped: "missing X secrets" });
  if (s && mode === "on") await resume(env, s, now);

  const c = await nextCandidate(env, now);
  if (!c) return log({ idle: true });
  const d = await stage(env, c, now);
  if (!d) return;
  if (gateOn(env)) {
    const j = await queue(env, c, d);
    return log(j ? { queued: j.id, stream: j.stream, ref: j.ref } : { waiting: c.stream, ref: c.ref });
  }
  await publishDraft(env, d, now, sleep);
}
```

- [ ] **Step 5: Write `worker/lib/gate.ts` (queue + preview)**

```ts
// worker/lib/gate.ts
import type { Env } from "../env";
import type { Candidate } from "./xpick";
import type { Draft } from "./xbot";
import { createJob, setMessages, type Job } from "./jobs";
import { sendMedia, sendMessage, TgError } from "./tg";

// The Telegram gate (spec 2026-10-04-realufo-telegram-gate-design): nothing is posted
// until the owner taps ✅ on a preview in the private chat.

export const CDN = "https://assets.realufo.org/";
const TEXT_MAX = 3500; // Telegram message limit is 4096; leave room for the header/footer
export const gateOn = (env: Env) => env.FEATURE_GATE === "on";

const PLATFORM_FLAGS: [string, keyof Env][] = [
  ["Facebook", "FEATURE_SOCIAL_FB"], ["Instagram", "FEATURE_SOCIAL_IG"], ["Threads", "FEATURE_SOCIAL_THREADS"],
  ["Bluesky", "FEATURE_SOCIAL_BSKY"], ["YouTube", "FEATURE_SOCIAL_YT"], ["TikTok", "FEATURE_SOCIAL_TIKTOK"], ["Telegram", "FEATURE_SOCIAL_TG"],
];
export const targets = (env: Env) => ["X", ...PLATFORM_FLAGS.filter(([, f]) => env[f] === "on").map(([n]) => n)].join(", ");

// Operator posts (forced pick, showcase) get their own stream so a waiting bot pick never blocks them.
const jobStream = (c: Candidate) => (c.stream === "showcase" ? "showcase" : c.stream === "pick" && c.manual ? "manual" : c.stream);

export async function queue(env: Env, c: Candidate, d: Draft): Promise<Job | null> {
  const job = await createJob(env, {
    kind: c.stream === "showcase" ? "showcase" : "post", stream: jobStream(c), ref: c.ref,
    status: "post_wait", caption: d.text, media: d.media, payload: { x: d },
  });
  if (job) await preview(env, job);
  return job;
}

export async function preview(env: Env, job: Job): Promise<void> {
  const chat = env.TELEGRAM_OWNER_ID!;
  const msgs: number[] = [];
  let note = "";
  if (job.media) {
    try {
      msgs.push(await sendMedia(env, chat, job.media.key));
    } catch (e) {
      if (!(e instanceof TgError)) throw e;
      note = `\n⚠️ media not attached (${e.status}): ${CDN}${job.media.key}`;
    }
  }
  const caption = (job.caption ?? "").length > TEXT_MAX ? `${job.caption!.slice(0, TEXT_MAX)}…` : (job.caption ?? "");
  const text = `#${job.id} v${job.version} · ${job.kind} · ${job.stream} · ${job.ref}${note}\n\n${caption}\n\n→ ${targets(env)}\nReply to this message to replace the text.`;
  msgs.push(await sendMessage(env, chat, text, [[
    { text: "✅ Post", callback_data: `ok:${job.id}:${job.version}` },
    { text: "❌ Skip", callback_data: `skip:${job.id}:${job.version}` },
  ]]));
  await setMessages(env, job.id, msgs);
}
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run --config worker/vitest.config.ts worker/tests/gate.spec.ts worker/tests/xbot.spec.ts worker/tests/xpick.spec.ts`
Expected: PASS. `xbot.spec`/`xpick.spec` don't set `FEATURE_GATE`, so the old behaviour holds. Migration 0038 seeds `paused_picks='1'`: if any daily-pick test in `xpick.spec.ts`/`xbot.spec.ts` now gets no pick, add `await env.DB.prepare("UPDATE bot_settings SET value='0' WHERE key='paused_picks'").run();` to that file's `beforeAll` after `seedTestDB`, and re-run.

- [ ] **Step 7: Commit**

```bash
git add worker/lib/xbot.ts worker/lib/xpick.ts worker/lib/gate.ts worker/tests/gate.spec.ts worker/tests/xbot.spec.ts worker/tests/xpick.spec.ts
printf 'feat(xbot): gate bot posts behind a Telegram preview; picks pausable\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\n' > /tmp/msg && git commit -F /tmp/msg
```

---

### Task 5: Webhook — approve, skip, reply edits

**Files:**
- Modify: `worker/lib/gate.ts` (add `approve`, `skip`)
- Create: `worker/lib/indexnow.ts`, `worker/routes/tg.ts`
- Modify: `worker/index.ts` (route `/__tg`)
- Test: `worker/tests/tg-webhook.spec.ts`

**Interfaces:**
- Consumes: Task 3 `getJob`, `jobByMessage`, `move`, `revise`; Task 4 `publishDraft`, `preview`; Task 2 `answerCallback`, `clearButtons`, `sendMessage`; `tick as socialTick` from `worker/lib/social/tick.ts`.
- Produces:
  - `approve(env, job: Job, now?: Date): Promise<string>` (a human result line; job ends `posted` or `failed`)
  - `skip(env, job: Job): Promise<boolean>`
  - `indexNow(urls: string[]): Promise<void>`
  - `tgWebhook(req: Request, env: Env): Promise<Response>`
  - Payload shapes executed by `approve`: kind `post`/`showcase` → `{ x: Draft }`; kind `article` → `{ sql: string[]; urls: string[]; showcase?: { record: string; text: string } }`; kind `poll` → `{ slug: string }`

- [ ] **Step 1: Write the failing test**

```ts
// worker/tests/tg-webhook.spec.ts
import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { seedTestDB } from "./helpers";
import worker from "../index";
import { createJob, setMessages } from "../lib/jobs";

beforeAll(() => seedTestDB(env.DB));

const SECRETS = { X_API_KEY: "k", X_API_SECRET: "s", X_ACCESS_TOKEN: "t", X_ACCESS_SECRET: "ts" };
const E = (extra: Record<string, unknown> = {}) => ({
  ...env, ...SECRETS, FEATURE_X: "dry", FEATURE_GATE: "on", X_MONTHLY_USD_CAP: "10",
  TELEGRAM_BOT_TOKEN: "T0K", TELEGRAM_OWNER_ID: "777", TELEGRAM_WEBHOOK_SECRET: "hook", ...extra,
}) as any;
const hook = (e: any, update: unknown, secret = "hook") =>
  worker.fetch(new Request("https://realufo.org/__tg", { method: "POST", headers: { "x-telegram-bot-api-secret-token": secret, "content-type": "application/json" }, body: JSON.stringify(update) }), e, {} as any);
const tap = (data: string, from = 777) => ({ update_id: 1, callback_query: { id: "cq1", from: { id: from }, data, message: { message_id: 102, chat: { id: from } } } });
const reply = (text: string, to: number, from = 777) => ({ update_id: 2, message: { message_id: 200, from: { id: from }, chat: { id: from }, text, reply_to_message: { message_id: to } } });

let tg: { method: string; body: any }[] = [];
beforeEach(async () => {
  for (const t of ["bot_job_versions", "bot_jobs", "social_posts", "x_posts"]) await env.DB.prepare(`DELETE FROM ${t}`).run();
  tg = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (u: any, init?: any) => {
    const url = String(u);
    if (!url.startsWith("https://api.telegram.org/")) throw new Error("unexpected fetch " + url);
    tg.push({ method: url.split("/").pop()!, body: init.body instanceof FormData ? Object.fromEntries(init.body as any) : JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 300 + tg.length } }));
  });
});
afterEach(() => vi.restoreAllMocks());

const draft = { stream: "pick", ref: "WH-1", text: "Look at this\nhttps://realufo.org/doc/WH-1", ai: false, media: null, cost: 0.2 };
const mkJob = async () => {
  const j = (await createJob(E(), { kind: "post", stream: "pick", ref: "WH-1", status: "post_wait", caption: draft.text, media: null, payload: { x: draft } }))!;
  await setMessages(E(), j.id, [101, 102]);
  return j;
};
const xposts = async () => (await env.DB.prepare("SELECT stream, ref, text, status FROM x_posts").all<any>()).results;
const status = async (id: number) => (await env.DB.prepare("SELECT status, error FROM bot_jobs WHERE id=?").bind(id).first<any>())!;

describe("POST /__tg", () => {
  it("404 on a wrong or missing secret", async () => {
    expect((await hook(E(), tap("ok:1:1"), "nope")).status).toBe(404);
    expect((await hook(E({ TELEGRAM_WEBHOOK_SECRET: undefined }), tap("ok:1:1"))).status).toBe(404);
  });
  it("ignores anyone but the owner, channel posts and chat-member updates (200, nothing sent)", async () => {
    const j = await mkJob();
    expect((await hook(E(), tap(`ok:${j.id}:1`, 555))).status).toBe(200);
    expect((await hook(E(), { update_id: 3, channel_post: { chat: { id: -100 }, text: "hi" } })).status).toBe(200);
    expect((await hook(E(), { update_id: 4, my_chat_member: { from: { id: 777 }, chat: { id: -100 } } })).status).toBe(200);
    expect(tg).toEqual([]);
    expect((await status(j.id)).status).toBe("post_wait");
  });
  it("✅ writes the x_posts row once, even if Telegram re-sends the update", async () => {
    const j = await mkJob();
    await hook(E(), tap(`ok:${j.id}:1`));
    await hook(E(), tap(`ok:${j.id}:1`));
    expect(await xposts()).toEqual([{ stream: "pick", ref: "WH-1", text: draft.text, status: "draft" }]);
    expect((await status(j.id)).status).toBe("posted");
    const answers = tg.filter((t) => t.method === "answerCallbackQuery").map((t) => t.body.text);
    expect(answers[1]).toMatch(/already/);
  });
  it("❌ skips: no row, buttons cleared", async () => {
    const j = await mkJob();
    await hook(E(), tap(`skip:${j.id}:1`));
    expect(await xposts()).toEqual([]);
    expect((await status(j.id)).status).toBe("skipped");
    expect(tg.some((t) => t.method === "editMessageReplyMarkup")).toBe(true);
  });
  it("a reply replaces the text (new version, new preview); old buttons go stale", async () => {
    const j = await mkJob();
    await hook(E(), reply("Better text", 102));
    const row = await env.DB.prepare("SELECT version, caption FROM bot_jobs WHERE id=?").bind(j.id).first<any>();
    expect(row).toEqual({ version: 2, caption: "Better text\nhttps://realufo.org/doc/WH-1" });
    expect(tg.filter((t) => t.method === "sendMessage").at(-1)!.body.text).toContain(`#${j.id} v2`);
    await hook(E(), tap(`ok:${j.id}:1`)); // stale v1 button
    expect(await xposts()).toEqual([]);
    await hook(E(), tap(`ok:${j.id}:2`));
    expect((await xposts())[0].text).toBe("Better text\nhttps://realufo.org/doc/WH-1");
  });
  it("a reply to an out-of-date preview is refused", async () => {
    const j = await mkJob();
    await hook(E(), reply("v2 text", 102));
    tg = [];
    await hook(E(), reply("edit the old one", 101));
    expect(tg.at(-1)!.body.text).toMatch(/out of date/);
    expect((await env.DB.prepare("SELECT version FROM bot_jobs WHERE id=?").bind(j.id).first<any>()).version).toBe(2);
  });
  it("approval while X can't post fails the job with the reason and tells the owner", async () => {
    const j = await mkJob();
    await hook(E({ FEATURE_X: "off" }), tap(`ok:${j.id}:1`));
    expect(await status(j.id)).toEqual({ status: "failed", error: "FEATURE_X is off" });
    expect(tg.filter((t) => t.method === "sendMessage").at(-1)!.body.text).toMatch(/failed.*FEATURE_X is off/);
    const j2 = (await createJob(E(), { kind: "post", stream: "manual", ref: "WH-2", status: "post_wait", caption: "t", media: null, payload: { x: { ...draft, ref: "WH-2", cost: 99 } } }))!;
    await hook(E(), tap(`ok:${j2.id}:1`));
    expect(await status(j2.id)).toMatchObject({ status: "failed", error: "over the monthly X budget" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config worker/vitest.config.ts worker/tests/tg-webhook.spec.ts`
Expected: FAIL (`/__tg` falls through to the SPA; status 200 HTML, assertions fail)

- [ ] **Step 3: IndexNow helper**

```ts
// worker/lib/indexnow.ts
// Same key and endpoint as crawler/indexnow.py; best effort (a failed ping never fails a post).
const KEY = "15c819920fcebcf77e8010d63ce74426";
export async function indexNow(urls: string[]) {
  if (!urls.length) return;
  await fetch("https://api.indexnow.org/indexnow", {
    method: "POST", headers: { "content-type": "application/json; charset=utf-8", "user-agent": "realufo-worker" },
    body: JSON.stringify({ host: "realufo.org", key: KEY, keyLocation: `https://realufo.org/${KEY}.txt`, urlList: urls.slice(0, 10000) }),
  }).catch(() => {});
}
```

- [ ] **Step 4: `approve` + `skip` in `worker/lib/gate.ts`**

Add imports at the top:

```ts
import { move, type Job } from "./jobs";
import { publishDraft, stage, type Draft } from "./xbot";
import { nextCandidate, withinBudget } from "./xpick";
import { tick as socialTick } from "./social/tick";
import { indexNow } from "./indexnow";
```

(Combine with the existing `createJob, setMessages` import from `./jobs` and the `Draft` type import from `./xbot`.)

Append:

```ts
// Runs an approved job: the same writes the pre-gate paths made. Caller has already moved it
// post_wait → approved (exactly once). Ends posted or failed; returns a line for the owner.
export async function approve(env: Env, job: Job, now = new Date()): Promise<string> {
  try {
    let line = "";
    if (job.kind === "post" || job.kind === "showcase") {
      const d: Draft = { ...job.payload.x, text: job.caption ?? job.payload.x.text };
      line = await postDraft(env, d, now);
    } else if (job.kind === "article") {
      const p = job.payload as { sql: string[]; urls: string[]; showcase?: { record: string; text: string } };
      if (p.sql.length) await env.DB.batch(p.sql.map((s) => env.DB.prepare(s)));
      await indexNow(p.urls);
      line = `site: ${p.urls[0] ?? "rows written"}`;
      if (p.showcase) {
        const c = await nextCandidate({ ...env, X_FORCE_SHOWCASE: p.showcase.record, X_SHOWCASE_TEXT: p.showcase.text }, now);
        const d = c && c.stream === "showcase" ? await stage(env, c, now) : null;
        if (!d) throw new Error("showcase video missing in R2, already posted, or over budget");
        line += ` · ${await postDraft(env, d, now)}`;
      }
    } else if (job.kind === "poll") {
      line = "poll approved: posts on the next tick";
    } else {
      throw new Error(`kind ${job.kind} has no approve step yet`);
    }
    await move(env, job.id, job.version, ["approved"], "posted");
    return `✅ #${job.id} ${line}`;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await move(env, job.id, job.version, ["approved"], "failed", msg);
    return `⚠️ #${job.id} failed: ${msg}`;
  }
}

async function postDraft(env: Env, d: Draft, now: Date): Promise<string> {
  if (!(await withinBudget(env, d.cost, now, true))) throw new Error("over the monthly X budget");
  const id = await publishDraft(env, d, now);
  if (id === null) return "already on X";
  await socialTick(env, now).catch(() => {}); // start the fan-out now; the cron finishes slow platforms
  return `X row ${id} · fan-out started`;
}

export const skip = (env: Env, job: Job) => move(env, job.id, job.version, ["post_wait", "brief_wait", "video_wait", "handmade", "prep", "media", "making"], "skipped");
```

- [ ] **Step 5: Webhook route**

```ts
// worker/routes/tg.ts
import type { Env } from "../env";
import { error, json } from "../lib/json";
import { sameSecret } from "../lib/secret";
import { getJob, jobByMessage, move, revise } from "../lib/jobs";
import { approve, preview, skip } from "../lib/gate";
import { answerCallback, clearButtons, sendMessage } from "../lib/tg";
import { command } from "../lib/tgcmd";

// POST /__tg: Telegram webhook (spec 2026-10-04-realufo-telegram-gate-design). Owner only;
// everything else is answered 200 and ignored so Telegram doesn't retry it.
export async function tgWebhook(req: Request, env: Env): Promise<Response> {
  const secret = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!env.TELEGRAM_WEBHOOK_SECRET || req.method !== "POST" || !(await sameSecret(secret, env.TELEGRAM_WEBHOOK_SECRET))) return error(404, "not found");
  const u = await req.json<any>().catch(() => ({}));
  const from = u.callback_query?.from?.id ?? u.message?.from?.id;
  if (!from || String(from) !== String(env.TELEGRAM_OWNER_ID)) return json({ ok: true });
  if (u.callback_query) await onButton(env, u.callback_query);
  else if (u.message) await onMessage(env, u.message);
  return json({ ok: true });
}

async function onButton(env: Env, q: any) {
  const [action, id, v] = String(q.data ?? "").split(":");
  const job = await getJob(env, Number(id));
  const chat = env.TELEGRAM_OWNER_ID!;
  if (!job) return answerCallback(env, q.id, "job not found");
  if (action === "skip") {
    const ok = await skip(env, job.version === Number(v) ? job : { ...job, version: -1 });
    await answerCallback(env, q.id, ok ? "skipped" : "already handled");
    if (ok) await clearButtons(env, chat, q.message.message_id).catch(() => {});
    return;
  }
  if (action !== "ok") return answerCallback(env, q.id);
  if (!(await move(env, job.id, Number(v), ["post_wait"], "approved"))) return answerCallback(env, q.id, "already handled or out of date");
  await answerCallback(env, q.id, "posting…"); // answer first: approval can take a while
  await clearButtons(env, chat, q.message.message_id).catch(() => {});
  await sendMessage(env, chat, await approve(env, { ...job, version: Number(v) }));
}

async function onMessage(env: Env, m: any) {
  const chat = env.TELEGRAM_OWNER_ID!;
  if (m.reply_to_message && typeof m.text === "string") {
    const job = await jobByMessage(env, m.reply_to_message.message_id);
    if (!job) return sendMessage(env, chat, "That preview is out of date (or not a job). Reply to the newest preview.", undefined, m.message_id);
    if (job.status !== "post_wait") return sendMessage(env, chat, `#${job.id} is ${job.status}; only waiting previews can be edited.`);
    const link = (job.caption ?? "").match(/https:\/\/realufo\.org\/\S+$/)?.[0];
    const text = link && !m.text.includes(link) ? `${m.text.trim()}\n${link}` : m.text.trim();
    const next = await revise(env, job.id, job.version, text, m.text);
    if (!next) return sendMessage(env, chat, `#${job.id} changed meanwhile; reply to the newest preview.`);
    return preview(env, next);
  }
  return command(env, m);
}
```

Create a stub `worker/lib/tgcmd.ts` so this compiles (Task 6 replaces it):

```ts
// worker/lib/tgcmd.ts
import type { Env } from "../env";
import { sendMessage } from "./tg";
export async function command(env: Env, _m: any) {
  await sendMessage(env, env.TELEGRAM_OWNER_ID!, "Commands arrive in the next update.");
}
```

In `worker/index.ts`: `import { tgWebhook } from "./routes/tg";` and, next to the `/__tick` line:

```ts
    if (url.pathname === "/__tg") return tgWebhook(req, env);
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run --config worker/vitest.config.ts worker/tests/tg-webhook.spec.ts worker/tests/gate.spec.ts`
Expected: PASS (7 + 5 tests)

- [ ] **Step 7: Commit**

```bash
git add worker/lib/gate.ts worker/lib/indexnow.ts worker/routes/tg.ts worker/lib/tgcmd.ts worker/index.ts worker/tests/tg-webhook.spec.ts
printf 'feat(worker): Telegram webhook: approve once, skip, reply to edit\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\n' > /tmp/msg && git commit -F /tmp/msg
```

---

### Task 6: Admin commands + mp4 upload

**Files:**
- Modify: `worker/lib/tgcmd.ts` (replace the stub)
- Test: `worker/tests/tg-commands.spec.ts`

**Interfaces:**
- Consumes: Task 3 `openJobs`, `getJob`, `setSetting`, `getSetting`; Task 4 `stage`, `queue`; Task 5 `skip`; Task 2 `getFile`, `sendMessage`; `nextCandidate`, `sqlTime` from `xpick`; `socialTick`.
- Produces: `command(env, m: TelegramMessage): Promise<void>` handling `/help`, `/queue`, `/status`, `/pause`, `/resume`, `/drain`, `/skip <id>`, `/post <ID>`, and an mp4 (video or document) with caption `<ID> text`.

- [ ] **Step 1: Write the failing test**

```ts
// worker/tests/tg-commands.spec.ts
import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { seedTestDB } from "./helpers";
import worker from "../index";
import { getSetting } from "../lib/jobs";

beforeAll(() => seedTestDB(env.DB));
const SECRETS = { X_API_KEY: "k", X_API_SECRET: "s", X_ACCESS_TOKEN: "t", X_ACCESS_SECRET: "ts" };
const AI = { run: async () => ({ response: "A clip. #UAP" }) };
const E = () => ({ ...env, ...SECRETS, AI, FEATURE_X: "dry", FEATURE_GATE: "on", X_MONTHLY_USD_CAP: "10", X_DAILY_MAX: "3",
  TELEGRAM_BOT_TOKEN: "T0K", TELEGRAM_OWNER_ID: "777", TELEGRAM_WEBHOOK_SECRET: "hook" }) as any;
const say = (msg: Record<string, unknown>) =>
  worker.fetch(new Request("https://realufo.org/__tg", { method: "POST", headers: { "x-telegram-bot-api-secret-token": "hook" },
    body: JSON.stringify({ update_id: 9, message: { message_id: 50, from: { id: 777 }, chat: { id: 777 }, ...msg } }) }), E(), {} as any);

let tg: { method: string; body: any }[] = [];
beforeEach(async () => {
  for (const t of ["bot_job_versions", "bot_jobs", "x_posts"]) await env.DB.prepare(`DELETE FROM ${t}`).run();
  await env.DB.prepare("DELETE FROM records WHERE id LIKE 'CM-%'").run();
  await env.DB.prepare("INSERT INTO records(id,archive,kind,title,status) VALUES ('CM-1','wargov','video','Cmd object','live')").run();
  await env.MEDIA.put("clips/wargov/CM-1.mp4", new Uint8Array(100), { httpMetadata: { contentType: "video/mp4" } });
  for (const o of (await env.MEDIA.list({ prefix: "showcase/wargov/CM-" })).objects) await env.MEDIA.delete(o.key);
  tg = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (u: any, init?: any) => {
    const url = String(u);
    if (url.includes("/file/botT0K/")) return new Response(new Uint8Array(64));
    if (!url.startsWith("https://api.telegram.org/")) throw new Error("unexpected fetch " + url);
    const method = url.split("/").pop()!;
    tg.push({ method, body: init?.body instanceof FormData ? Object.fromEntries(init.body as any) : init?.body ? JSON.parse(init.body) : {} });
    if (method === "getFile") return new Response(JSON.stringify({ ok: true, result: { file_path: "videos/f.mp4" } }));
    return new Response(JSON.stringify({ ok: true, result: { message_id: 400 + tg.length } }));
  });
});
afterEach(() => vi.restoreAllMocks());
const lastText = () => tg.filter((t) => t.method === "sendMessage").at(-1)!.body.text as string;
const jobs = async () => (await env.DB.prepare("SELECT kind, stream, ref, status, caption FROM bot_jobs ORDER BY id").all<any>()).results;

describe("admin commands", () => {
  it("/help lists the commands; unknown text gets help", async () => {
    await say({ text: "/help" });
    expect(lastText()).toContain("/post <ID>");
    await say({ text: "hello" });
    expect(lastText()).toContain("/queue");
  });
  it("/post <ID> queues an operator job with a preview", async () => {
    await say({ text: "/post CM-1" });
    expect(await jobs()).toEqual([expect.objectContaining({ kind: "post", stream: "manual", ref: "CM-1", status: "post_wait" })]);
    expect(tg.map((t) => t.method)).toContain("sendVideo");
  });
  it("/post of an unknown or already-posted record explains why", async () => {
    await say({ text: "/post NOPE-1" });
    expect(lastText()).toMatch(/not live|already posted|over budget/);
  });
  it("/pause and /resume flip paused_picks", async () => {
    await say({ text: "/resume" });
    expect(await getSetting(E(), "paused_picks")).toBe("0");
    await say({ text: "/pause" });
    expect(await getSetting(E(), "paused_picks")).toBe("1");
  });
  it("/queue lists open jobs; /skip <id> skips one", async () => {
    await say({ text: "/post CM-1" });
    const id = (await env.DB.prepare("SELECT id FROM bot_jobs").first<any>()).id;
    await say({ text: "/queue" });
    expect(lastText()).toContain(`#${id}`);
    await say({ text: `/skip ${id}` });
    expect((await jobs())[0].status).toBe("skipped");
  });
  it("/status reports today's posts and the month's spend", async () => {
    await say({ text: "/status" });
    expect(lastText()).toMatch(/today/i);
    expect(lastText()).toMatch(/\$/);
  });
  it("an mp4 with caption '<ID> text' becomes a showcase job; too big is refused", async () => {
    await say({ caption: "CM-1 Watch frame 12", video: { file_id: "F1", file_size: 64, mime_type: "video/mp4" } });
    expect(await env.MEDIA.head("showcase/wargov/CM-1.mp4")).not.toBeNull();
    expect(await jobs()).toEqual([expect.objectContaining({ kind: "showcase", stream: "showcase", ref: "CM-1", status: "post_wait" })]);
    await say({ caption: "CM-1 again", video: { file_id: "F2", file_size: 21 * 1024 * 1024, mime_type: "video/mp4" } });
    expect(lastText()).toMatch(/20 MB/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config worker/vitest.config.ts worker/tests/tg-commands.spec.ts`
Expected: FAIL ("Commands arrive in the next update." instead of help)

- [ ] **Step 3: Write `worker/lib/tgcmd.ts`**

```ts
// worker/lib/tgcmd.ts
import type { Env } from "../env";
import { getJob, openJobs, setSetting } from "./jobs";
import { queue, skip } from "./gate";
import { stage } from "./xbot";
import { nextCandidate, sqlTime } from "./xpick";
import { tick as socialTick } from "./social/tick";
import { getFile, sendMessage } from "./tg";

// Owner commands in the private chat (spec: "Admin commands"). Every post still waits for ✅.
const DOWNLOAD_MAX = 20 * 1024 * 1024; // Telegram bots can download ≤20 MB

const HELP = [
  "/post <ID> · preview a record post (video clip or image)",
  "send an mp4 with caption \"<ID> text\" · your own video as a showcase post (≤20 MB; bigger: scripts/publish.sh)",
  "/queue · open jobs",
  "/status · today's posts, failures, month spend",
  "/pause · /resume · the bot's own daily picks",
  "/drain · re-run the fan-out for missed platforms",
  "/skip <job> · drop a job",
  "Reply to a preview to replace its text.",
].join("\n");

export async function command(env: Env, m: any) {
  const chat = env.TELEGRAM_OWNER_ID!;
  const say = (t: string) => sendMessage(env, chat, t);
  if (m.video || m.document?.mime_type === "video/mp4") return upload(env, m, say);
  const [cmd, arg = ""] = String(m.text ?? "").trim().split(/\s+/, 2);
  const now = new Date();
  switch (cmd) {
    case "/post": {
      const c = arg && (await nextCandidate({ ...env, X_FORCE_PICK: arg }, now));
      const d = c && (await stage(env, c, now));
      if (!c || !d) return say(`${arg || "?"}: not live, already posted, or over budget.`);
      const j = await queue(env, c, d);
      return j ? undefined : say(`${arg} already has an open job.`);
    }
    case "/queue": {
      const js = await openJobs(env);
      return say(js.length ? js.map((j) => `#${j.id} v${j.version} · ${j.kind} · ${j.stream} · ${j.ref} · ${j.status}`).join("\n") : "No open jobs.");
    }
    case "/status": {
      const day = sqlTime(now);
      const x = await env.DB.prepare("SELECT status, count(*) n FROM x_posts WHERE date(created_at)=date(?) GROUP BY status").bind(day).all<{ status: string; n: number }>();
      const f = await env.DB.prepare("SELECT platform, count(*) n FROM social_posts WHERE status='failed' AND deleted_at IS NULL AND created_at>=datetime(?,'-1 day') GROUP BY platform").bind(day).all<{ platform: string; n: number }>();
      const m$ = await env.DB.prepare("SELECT coalesce(sum(cost_usd),0) usd FROM x_posts WHERE status!='failed' AND strftime('%Y-%m',created_at)=strftime('%Y-%m',?)").bind(day).first<{ usd: number }>();
      return say([
        `Today on X: ${x.results.map((r) => `${r.status} ${r.n}`).join(", ") || "nothing"}`,
        `Failed last 24 h: ${f.results.map((r) => `${r.platform} ${r.n}`).join(", ") || "none"}`,
        `Month spend: $${(m$?.usd ?? 0).toFixed(2)} of $${env.X_MONTHLY_USD_CAP ?? "10"}`,
      ].join("\n"));
    }
    case "/pause": await setSetting(env, "paused_picks", "1"); return say("Bot picks paused.");
    case "/resume": await setSetting(env, "paused_picks", "0"); return say("Bot picks on (each still waits for your ✅).");
    case "/drain": await socialTick(env, now); return say("Fan-out ran once; /status for failures.");
    case "/skip": {
      const j = await getJob(env, Number(arg));
      return say(j && (await skip(env, j)) ? `#${j.id} skipped.` : `#${arg}: not found or already closed.`);
    }
    default: return say(HELP);
  }
}

async function upload(env: Env, m: any, say: (t: string) => Promise<number>) {
  const file = m.video ?? m.document;
  const [id, ...rest] = String(m.caption ?? "").trim().split(/\s+/);
  const text = rest.join(" ").trim();
  if (!id || !text) return say("Caption must be \"<RECORD-ID> post text\".");
  if ((file.file_size ?? 0) > DOWNLOAD_MAX) return say("Over 20 MB: bots can't download it. Use scripts/publish.sh --showcase.");
  const rec = await env.DB.prepare("SELECT archive FROM records WHERE id=? AND status='live'").bind(id).first<{ archive: string }>();
  if (!rec) return say(`${id}: no live record.`);
  if (await env.DB.prepare("SELECT 1 FROM x_posts WHERE stream='showcase' AND ref=?").bind(id).first()) return say(`${id}: a showcase is already posted for this record.`);
  await env.MEDIA.put(`showcase/${rec.archive}/${id}.mp4`, await getFile(env, file.file_id), {
    httpMetadata: { contentType: "video/mp4", cacheControl: "public, max-age=2592000" },
  });
  const now = new Date();
  const c = await nextCandidate({ ...env, X_FORCE_SHOWCASE: id, X_SHOWCASE_TEXT: text }, now);
  const d = c && (await stage(env, c, now));
  if (!c || !d) return say(`${id}: uploaded, but over budget; try again later.`);
  const j = await queue(env, c, d);
  return j ? undefined : say(`${id} already has an open showcase job.`);
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run --config worker/vitest.config.ts worker/tests/tg-commands.spec.ts worker/tests/tg-webhook.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add worker/lib/tgcmd.ts worker/tests/tg-commands.spec.ts
printf 'feat(worker): Telegram admin commands and mp4 showcase upload\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\n' > /tmp/msg && git commit -F /tmp/msg
```

---

### Task 7: Telegram channel as the 7th platform

**Files:**
- Create: `worker/lib/social/tg.ts`
- Modify: `worker/lib/social/common.ts` (`Platform` adds `"tg"`), `worker/lib/social/text.ts` (`compose` case `tg`), `worker/lib/social/tick.ts` (`ADAPTERS`, `FLAG`)
- Test: `worker/tests/social-tg.spec.ts`

**Interfaces:**
- Consumes: Task 2 `sendMedia`, `sendMessage`, `TgError`; `SocialError`, `Adapter` from `common.ts`.
- Produces: `tg: Adapter` (`needs: "any"`, `vertical: true`, posts to `env.TELEGRAM_CHANNEL`); `compose("tg", …)` caption ≤ 1024 chars with link + tags.

- [ ] **Step 1: Write the failing test**

```ts
// worker/tests/social-tg.spec.ts
import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { tg } from "../lib/social/tg";
import { compose } from "../lib/social/text";
import { SocialError } from "../lib/social/common";

const E = { ...env, TELEGRAM_BOT_TOKEN: "T0K", TELEGRAM_CHANNEL: "@realufo_org" } as any;
const ctx = { now: new Date("2026-10-10T15:00:00Z"), sleep: async () => {} };
let calls: { method: string; body: any }[] = [];
let status = 200;
beforeEach(() => {
  calls = []; status = 200;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (u: any, init?: any) => {
    calls.push({ method: String(u).split("/").pop()!, body: init.body instanceof FormData ? Object.fromEntries(init.body as any) : JSON.parse(init.body) });
    return status === 200 ? new Response(JSON.stringify({ ok: true, result: { message_id: 9 } })) : new Response(JSON.stringify({ ok: false }), { status });
  });
});
afterEach(() => vi.restoreAllMocks());

describe("telegram channel adapter", () => {
  it("video → sendVideo to the channel with the caption; remoteId = message id", async () => {
    await env.MEDIA.put("clips-v/wargov/TG-1.mp4", new Uint8Array(10), { httpMetadata: { contentType: "video/mp4" } });
    const r = await tg.publish(E, { text: "cap", title: "t", link: null, media: { kind: "video", key: "clips-v/wargov/TG-1.mp4", url: "u", size: 10 } }, ctx);
    expect(r).toEqual({ remoteId: "9" });
    expect(calls[0]).toMatchObject({ method: "sendVideo", body: { chat_id: "@realufo_org", caption: "cap" } });
  });
  it("no media → sendMessage", async () => {
    await tg.publish(E, { text: "just text", title: "t", link: null, media: null }, ctx);
    expect(calls[0]).toMatchObject({ method: "sendMessage", body: { chat_id: "@realufo_org", text: "just text" } });
  });
  it("Telegram errors become SocialError (retry rules apply)", async () => {
    status = 429;
    await expect(tg.publish(E, { text: "x", title: "t", link: null, media: null }, ctx)).rejects.toBeInstanceOf(SocialError);
  });
  it("configured only with token + channel; caption fits 1024 with link and tags", () => {
    expect(tg.configured(E)).toBe(true);
    expect(tg.configured({ ...E, TELEGRAM_CHANNEL: "" })).toBe(false);
    const c = compose("tg", "x".repeat(2000) + "\nhttps://realufo.org/doc/TG-1", "wargov", { id: "TG-1", kind: "video", title: "T", location: null });
    expect(c.text.length).toBeLessThanOrEqual(1024);
    expect(c.text).toContain("https://realufo.org/doc/TG-1");
    expect(c.text).toContain("#UFO");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config worker/vitest.config.ts worker/tests/social-tg.spec.ts`
Expected: FAIL, cannot resolve `../lib/social/tg`

- [ ] **Step 3: Implement**

```ts
// worker/lib/social/tg.ts
import { SocialError, type Adapter } from "./common";
import { sendMedia, sendMessage, TgError } from "../tg";

// Telegram channel (spec 2026-10-04-realufo-telegram-gate-design): the bot posts as channel admin.
export const tg: Adapter = {
  needs: "any",
  vertical: true,
  configured: (env) => !!(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHANNEL),
  async publish(env, p) {
    const chat = env.TELEGRAM_CHANNEL!;
    try {
      const id = p.media ? await sendMedia(env, chat, p.media.key, p.text) : await sendMessage(env, chat, p.text);
      return { remoteId: String(id) };
    } catch (e) {
      if (e instanceof TgError) throw new SocialError(e.status, e.body);
      throw e;
    }
  },
};
```

In `worker/lib/social/common.ts`:

```ts
export type Platform = "fb" | "ig" | "threads" | "bsky" | "yt" | "tiktok" | "tg";
```

In `worker/lib/social/text.ts`, inside `compose`'s `switch`, after `case "tiktok"`:

```ts
    case "tg": // media caption limit 1024
      return { text: room(1024, `${linkPart}\n\n${tags}`), title, link };
```

In `worker/lib/social/tick.ts`: `import { tg } from "./tg";`, then:

```ts
export const ADAPTERS: Record<Platform, Adapter> = { fb, ig, threads, bsky, yt, tiktok, tg };
const FLAG: Record<Platform, keyof Env> = {
  fb: "FEATURE_SOCIAL_FB", ig: "FEATURE_SOCIAL_IG", threads: "FEATURE_SOCIAL_THREADS",
  bsky: "FEATURE_SOCIAL_BSKY", yt: "FEATURE_SOCIAL_YT", tiktok: "FEATURE_SOCIAL_TIKTOK", tg: "FEATURE_SOCIAL_TG",
};
```

Add `FEATURE_SOCIAL_TG: "off"` to the `OFF` object in `worker/tests/social-tick.spec.ts` so its existing tests keep running only their fakes.

- [ ] **Step 4: Run tests**

Run: `npx vitest run --config worker/vitest.config.ts worker/tests/social-tg.spec.ts worker/tests/social-tick.spec.ts worker/tests/social-text.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add worker/lib/social/tg.ts worker/lib/social/common.ts worker/lib/social/text.ts worker/lib/social/tick.ts worker/tests/social-tg.spec.ts worker/tests/social-tick.spec.ts
printf 'feat(social): Telegram channel as the 7th fan-out platform\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\n' > /tmp/msg && git commit -F /tmp/msg
```

---

### Task 8: Story polls behind the gate

**Files:**
- Modify: `worker/lib/xpoll.ts`
- Test: add cases to `worker/tests/xpoll.spec.ts`

**Interfaces:**
- Consumes: Task 3 `createJob`; Task 4 `gateOn`, `preview`.
- Produces: with `FEATURE_GATE=on`, `postNext`/`threadsPostNext` post only slugs with an approved job (`kind IN ('article','poll')`, `status IN ('approved','posted')`). `queuePolls(env)` creates one `poll` job (stream `poll`) for the oldest eligible slug without a job, with the article hero image as media.

- [ ] **Step 1: Write the failing tests**

Append to `worker/tests/xpoll.spec.ts` (it already seeds story `xp1` with a poll and a posted head tweet `H1`, and mocks fetch through `tweet()`):

```ts
describe("gate (FEATURE_GATE=on)", () => {
  const G = (extra: Record<string, unknown> = {}) => E({ FEATURE_GATE: "on", TELEGRAM_BOT_TOKEN: "T0K", TELEGRAM_OWNER_ID: "777", ...extra });
  beforeEach(async () => {
    await env.DB.prepare("DELETE FROM bot_job_versions").run();
    await env.DB.prepare("DELETE FROM bot_jobs").run();
  });
  it("no poll is posted without an approved job; a poll job + preview is queued instead", async () => {
    const before = sent.length;
    await pollTick(G(), NOW, noSleep);
    expect(sent.length).toBe(before); // nothing sent to X
    const j = await env.DB.prepare("SELECT kind, stream, ref, status FROM bot_jobs").all<any>();
    expect(j.results).toEqual([{ kind: "poll", stream: "poll", ref: "xp1", status: "post_wait" }]);
  });
  it("an approved article or poll job lets the poll post", async () => {
    await env.DB.prepare("INSERT INTO bot_jobs(kind,stream,ref,status,payload) VALUES ('article','article','xp1','posted','{}')").run();
    await pollTick(G(), NOW, noSleep);
    const r = await env.DB.prepare("SELECT status FROM poll_social WHERE slug='xp1' AND platform='x'").first<any>();
    expect(r?.status).toBe("posted");
  });
});
```

The `fetch` mock in this file only knows X URLs. Extend it at the top of `beforeEach`: if the URL starts with `https://api.telegram.org/`, return `new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }))` before the X handling.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run --config worker/vitest.config.ts worker/tests/xpoll.spec.ts`
Expected: FAIL (the poll posts to X in the first new test)

- [ ] **Step 3: Implement in `worker/lib/xpoll.ts`**

Add imports:

```ts
import { createJob } from "./jobs";
import { gateOn, preview } from "./gate";
```

Add a helper and use it in both selection queries:

```ts
// With the gate on, a story's poll posts only after the owner approved the story or the poll.
const approvedPoll = (env: Env) => gateOn(env)
  ? `AND EXISTS (SELECT 1 FROM bot_jobs j WHERE j.ref=a.slug AND j.kind IN ('article','poll') AND j.status IN ('approved','posted') AND j.deleted_at IS NULL)`
  : "";
```

In `postNext`, change the query's `WHERE` line to:

```ts
     WHERE a.poll IS NOT NULL AND p.slug IS NULL ${approvedPoll(env)}
```

Make the same change in `threadsPostNext`.

Add the queueing step:

```ts
// Gate: offer the oldest story poll that has no job yet (one open poll job at a time).
async function queuePolls(env: Env) {
  const r = await env.DB.prepare(
    `SELECT a.slug, a.poll, a.image_key FROM articles a
     LEFT JOIN poll_social p ON p.slug=a.slug AND p.platform='x'
     WHERE a.poll IS NOT NULL AND p.slug IS NULL
       AND NOT EXISTS (SELECT 1 FROM bot_jobs j WHERE j.ref=a.slug AND j.deleted_at IS NULL)
     ORDER BY a.created_at LIMIT 1`
  ).first<{ slug: string; poll: string; image_key: string | null }>();
  const poll = r && parsePoll(r.poll);
  if (!r || !poll) return;
  const media = r.image_key ? { key: r.image_key, mime: "image/jpeg", size: 0 } : null;
  const caption = `${poll.q} 👇\n${poll.opts.map((o) => `• ${o}`).join("\n")}\n(posted as a reply under the story's head post; story: ${SITE}/thread/ar_${r.slug})`;
  const job = await createJob(env, { kind: "poll", stream: "poll", ref: r.slug, status: "post_wait", caption, media, payload: { slug: r.slug } });
  if (job) await preview(env, job);
}
```

In `pollTick`, right after the feature check line:

```ts
  if (gateOn(env)) await queuePolls(env).catch((e) => log({ queuePollsFailed: String(e).slice(0, 200) }));
```

(`SITE`, `log` and `parsePoll` already exist in `xpoll.ts`.)

- [ ] **Step 4: Run tests**

Run: `npx vitest run --config worker/vitest.config.ts worker/tests/xpoll.spec.ts`
Expected: PASS (old tests unchanged: they don't set `FEATURE_GATE`)

- [ ] **Step 5: Commit**

```bash
git add worker/lib/xpoll.ts worker/tests/xpoll.spec.ts
printf 'feat(xpoll): story polls wait for an approved story or poll job\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\n' > /tmp/msg && git commit -F /tmp/msg
```

---

### Task 9: Operator paths — `/__tick`, `/__job`, publish.sh, article.py

**Files:**
- Modify: `worker/index.ts` (`manualTick` under the gate; route `/__job`)
- Create: `worker/routes/job.ts`
- Modify: `scripts/publish.sh`, `scripts/article.py`
- Test: `worker/tests/job-route.spec.ts`

**Interfaces:**
- Consumes: Task 4 `stage`, `queue`, `gateOn`, `preview`; Task 3 `createJob`; Task 5 `approve` (article kind).
- Produces:
  - `POST /__tick?force=ID|showcase=ID&text=…` with the gate on → `{ ok: true, job: <id|null> }`; nothing posted.
  - `POST /__job` (Bearer ADMIN_TOKEN) body `{ kind: "article", ref: slug, caption, media: {key,mime,size}|null, payload: { sql: string[], urls: string[], showcase?: { record, text } } }` → `{ ok: true, job: id }`; 409 if an open job exists for that slug.

- [ ] **Step 1: Write the failing test**

```ts
// worker/tests/job-route.spec.ts
import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { seedTestDB } from "./helpers";
import worker from "../index";

beforeAll(() => seedTestDB(env.DB));
const SECRETS = { X_API_KEY: "k", X_API_SECRET: "s", X_ACCESS_TOKEN: "t", X_ACCESS_SECRET: "ts" };
const AI = { run: async () => ({ response: "A clip. #UAP" }) };
const E = (extra: Record<string, unknown> = {}) => ({ ...env, ...SECRETS, AI, ADMIN_TOKEN: "adm", FEATURE_X: "dry", FEATURE_GATE: "on", X_MONTHLY_USD_CAP: "10",
  TELEGRAM_BOT_TOKEN: "T0K", TELEGRAM_OWNER_ID: "777", TELEGRAM_WEBHOOK_SECRET: "hook", ...extra }) as any;
const post = (e: any, path: string, body?: unknown, token = "adm") =>
  worker.fetch(new Request(`https://realufo.org${path}`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }), e, {} as any);
const tap = (e: any, data: string) =>
  worker.fetch(new Request("https://realufo.org/__tg", { method: "POST", headers: { "x-telegram-bot-api-secret-token": "hook" },
    body: JSON.stringify({ update_id: 5, callback_query: { id: "q", from: { id: 777 }, data, message: { message_id: 1, chat: { id: 777 } } } }) }), e, {} as any);

beforeEach(async () => {
  for (const t of ["bot_job_versions", "bot_jobs", "x_posts"]) await env.DB.prepare(`DELETE FROM ${t}`).run();
  await env.DB.prepare("DELETE FROM records WHERE id LIKE 'JR-%'").run();
  await env.DB.prepare("DELETE FROM articles WHERE slug='jr-story'").run();
  await env.DB.prepare("INSERT INTO records(id,archive,kind,title,status) VALUES ('JR-1','wargov','video','Job route object','live')").run();
  await env.MEDIA.put("clips/wargov/JR-1.mp4", new Uint8Array(100), { httpMetadata: { contentType: "video/mp4" } });
  vi.spyOn(globalThis, "fetch").mockImplementation(async (u: any) => {
    const url = String(u);
    if (url.startsWith("https://api.telegram.org/")) return new Response(JSON.stringify({ ok: true, result: { message_id: 7 } }));
    if (url.startsWith("https://api.indexnow.org/")) return new Response("", { status: 200 });
    throw new Error("unexpected fetch " + url);
  });
});
afterEach(() => vi.restoreAllMocks());

describe("operator paths under the gate", () => {
  it("/__tick?force=ID queues a job instead of posting", async () => {
    const r = await post(E(), "/__tick?force=JR-1");
    const body = await r.json<any>();
    expect(body.ok).toBe(true);
    expect(body.job).toEqual(expect.any(Number));
    expect((await env.DB.prepare("SELECT count(*) n FROM x_posts").first<any>()).n).toBe(0);
  });
  it("/__job needs the admin token", async () => {
    expect((await post(E(), "/__job", { kind: "article" }, "nope")).status).toBe(404);
  });
  it("/__job article: rows are written only after ✅", async () => {
    const sql = ["INSERT INTO articles(slug,title,body) VALUES ('jr-story','T','B')"];
    const r = await post(E(), "/__job", { kind: "article", ref: "jr-story", caption: "T\n\nB", media: null, payload: { sql, urls: ["https://realufo.org/thread/ar_jr-story"] } });
    const { job } = await r.json<any>();
    expect(await env.DB.prepare("SELECT 1 FROM articles WHERE slug='jr-story'").first()).toBeNull();
    expect((await post(E(), "/__job", { kind: "article", ref: "jr-story", caption: "x", media: null, payload: { sql, urls: [] } })).status).toBe(409);
    await tap(E(), `ok:${job}:1`);
    expect(await env.DB.prepare("SELECT 1 FROM articles WHERE slug='jr-story'").first()).not.toBeNull();
    expect((await env.DB.prepare("SELECT status FROM bot_jobs WHERE id=?").bind(job).first<any>()).status).toBe("posted");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config worker/vitest.config.ts worker/tests/job-route.spec.ts`
Expected: FAIL (`/__tick` posts or returns `{ok:true}` without `job`; `/__job` 404s)

- [ ] **Step 3: `manualTick` under the gate (`worker/index.ts`)**

Add imports:

```ts
import { stage } from "./lib/xbot";
import { nextCandidate } from "./lib/xpick";
import { gateOn, queue } from "./lib/gate";
import { jobRoute } from "./routes/job";
```

In `manualTick`, replace the two lines from `// operator post = the user's OK…` through `await runTick({ ...env, ...over });` with:

```ts
  if (over.X_FORCE_PICK || over.X_FORCE_SHOWCASE) {
    if (gateOn(env)) {
      // gate: an operator post becomes a Telegram preview; the owner's ✅ posts it
      const e = { ...env, ...over }, now = new Date();
      const c = await nextCandidate(e, now);
      const d = c && (await stage(e, c, now));
      const j = c && d ? await queue(e, c, d) : null;
      return json({ ok: true, job: j?.id ?? null });
    }
    over.FEATURE_X = "on"; // gate off: operator post = the user's OK for that item
  }
  await runTick({ ...env, ...over });
```

And next to the `/__tg` route: `if (url.pathname === "/__job") return jobRoute(req, env);`

- [ ] **Step 4: `/__job` route**

```ts
// worker/routes/job.ts
import type { Env } from "../env";
import { error, json } from "../lib/json";
import { sameSecret } from "../lib/secret";
import { createJob } from "../lib/jobs";
import { preview } from "../lib/gate";

// POST /__job (Bearer ADMIN_TOKEN): operator jobs from scripts (article.py). The owner's ✅ in
// Telegram runs the payload (worker/lib/gate.ts approve). Unset ADMIN_TOKEN = 404.
export async function jobRoute(req: Request, env: Env): Promise<Response> {
  const auth = req.headers.get("authorization") ?? "";
  if (!env.ADMIN_TOKEN || req.method !== "POST" || !(await sameSecret(auth, `Bearer ${env.ADMIN_TOKEN}`))) return error(404, "not found");
  const b = await req.json<any>().catch(() => null);
  if (!b || b.kind !== "article" || typeof b.ref !== "string" || !Array.isArray(b.payload?.sql) || !Array.isArray(b.payload?.urls))
    return error(400, "need {kind:'article', ref, caption, media, payload:{sql[], urls[], showcase?}}");
  const job = await createJob(env, { kind: "article", stream: "article", ref: b.ref, status: "post_wait", caption: b.caption ?? null, media: b.media ?? null, payload: b.payload });
  if (!job) return error(409, `an open job already exists for ${b.ref}`);
  await preview(env, job);
  return json({ ok: true, job: job.id });
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run --config worker/vitest.config.ts worker/tests/job-route.spec.ts worker/tests/manual-tick.spec.ts`
Expected: PASS

- [ ] **Step 6: `scripts/publish.sh`**

After the `tick "$QS"` line inside the loop, a gated call returns a job id. Replace the `tick()` function body so it prints that once:

```bash
tick() { # $1 = query string ("" for a plain tick)
  local code out
  out=$(mktemp)
  code=$(curl -s -o "$out" -w '%{http_code}' --max-time 300 -X POST -H "Authorization: Bearer $TOKEN" "$SITE/__tick${1:+?$1}")
  [ "$code" = 200 ] || { echo "!! /__tick returned $code (deployed code lacks /__tick, or ADMIN_TOKEN differs from the Worker secret)"; rm -f "$out"; exit 1; }
  if [ -z "${ANNOUNCED:-}" ] && grep -q '"job":[0-9]' "$out"; then
    echo "== waiting for your ✅ on Telegram (job $(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["job"])' "$out")); this script keeps polling"
    ANNOUNCED=1
  fi
  rm -f "$out"
}
```

Set the default timeout higher, since your tap can take a while: `TIMEOUT_MIN=${PUBLISH_TIMEOUT_MIN:-60}`. Update the header comment: "With FEATURE_GATE=on the post waits for the owner's ✅ in Telegram; after the tap the cron finishes the fan-out even if this script times out."

- [ ] **Step 7: `scripts/article.py`**

Replace the direct D1 writes for the story, evidence and thread, plus the IndexNow and publish.sh calls, with one `/__job` request. Keep the R2 image upload and the read-only checks (`d1(..., read=True)`).

1. Change `d1("\n".join(sql))` (rows → D1) to collect instead: `story_sql = sql`.
2. Change `d1("\n".join(rows))` (site thread) to: `thread_sql = rows`.
3. Delete the `subprocess.run([sys.executable, "crawler/indexnow.py", …])` line and the `if social:` block. Put this in their place:

```python
    payload = {"sql": [s.strip().rstrip(";") for s in [*story_sql, *thread_sql]], "urls": urls}
    media = {"key": hero, "mime": "image/jpeg", "size": 0} if hero else None
    caption = f"{a['title']}\n\n{op}" + (f"\n\npoll: {poll['q']} [{' / '.join(poll['opts'])}]" if poll else "")
    if social:
        rec = d1(f"SELECT archive FROM records WHERE id={q(a['showcase_record'])} AND status='live'", read=True)
        if not rec:
            sys.exit(f"showcase_record {a['showcase_record']} is not live")
        key = f"showcase/{rec[0]['archive']}/{a['showcase_record']}.mp4"
        subprocess.run([*WR, "r2", "object", "put", f"realufo/{key}", "--file", os.path.join(ROOT, "showcase/articles", slug, a["short"]),
                        "--content-type", "video/mp4", "--cache-control", "public, max-age=2592000", *WR_OPTS], cwd=ROOT, check=True, capture_output=True)
        payload["showcase"] = {"record": a["showcase_record"], "text": SEP.join([*a["parts"][:-1], a["parts"][-1] + cta(a, thread)])}
        media = {"key": key, "mime": "video/mp4", "size": 0}
    token = next((l.split("=", 1)[1].strip() for l in open(os.path.join(ROOT, ".env")) if l.startswith("ADMIN_TOKEN=")), "")
    req = urllib.request.Request(f"{SITE}/__job", method="POST", data=json.dumps({"kind": "article", "ref": slug, "caption": caption, "media": media, "payload": payload}).encode(),
                                 headers={"authorization": f"Bearer {token}", "content-type": "application/json"})
    try:
        print("== waiting for your ✅ on Telegram: job", json.load(urllib.request.urlopen(req))["job"])
    except urllib.error.HTTPError as e:
        sys.exit(f"/__job {e.code}: {e.read().decode()[:300]}")
```

Add `import urllib.request, urllib.error` at the top. Each SQL string must be one statement; the `[s.strip().rstrip(";") …]` step removes trailing semicolons because `DB.batch` takes one statement per item. Update the module docstring: "Nothing is written to D1 or posted until the owner taps ✅ on the Telegram preview; the Worker then writes the rows, pings IndexNow and (with --social) posts the Short."

- [ ] **Step 8: Check the Python compiles**

Run: `python3 -m py_compile scripts/article.py && bash -n scripts/publish.sh && echo ok`
Expected: `ok`

- [ ] **Step 9: Commit**

```bash
git add worker/index.ts worker/routes/job.ts worker/tests/job-route.spec.ts scripts/publish.sh scripts/article.py
printf 'feat: operator posts (publish.sh, article.py, /__tick) wait for the Telegram tap\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\n' > /tmp/msg && git commit -F /tmp/msg
```

---

### Task 10: Config, webhook registration, skills, rollout

**Files:**
- Modify: `wrangler.jsonc`
- Create: `scripts/tg-webhook.sh`
- Modify: `.claude/skills/publish/SKILL.md`, `.claude/skills/publish-article/SKILL.md`, `.claude/skills/story-polls/SKILL.md`

**Interfaces:**
- Consumes: everything above.
- Produces: live gate with `FEATURE_GATE=on`, `FEATURE_X=on`, picks paused (`paused_picks=1`), and `FEATURE_SOCIAL_TG` moving `dry` → `on`.

- [ ] **Step 1: `wrangler.jsonc` vars**

Replace the `FEATURE_X` comment + value added on 2026-10-04 with:

```jsonc
    // Telegram gate (spec 2026-10-04-realufo-telegram-gate-design): every post waits for the owner's ✅
    // in the private chat with @real_ufo_bot. Bot picks stay paused (D1 bot_settings.paused_picks) until
    // Plan 2's auto Shorts; releases/highlights/polls/operator posts go through the gate.
    "FEATURE_GATE": "on", "TELEGRAM_CHANNEL": "-1004320401355", "FEATURE_SOCIAL_TG": "dry", // channel "RealUFO" by numeric id: works public or private, survives a username change
    "FEATURE_X": "on", "X_PICK_HOURS": "15", "X_DAILY_MAX": "1", "X_MONTHLY_USD_CAP": "25", "X_HIGHLIGHT_MIN_VOTES": "", "X_SINCE": "2026-10-02", "X_POLLS": "on",
```

- [ ] **Step 2: `scripts/tg-webhook.sh`**

```bash
#!/usr/bin/env bash
# Register the Telegram webhook: Telegram POSTs updates to https://realufo.org/__tg with the
# secret header. Needs TELEGRAM_BOT_TOKEN + TELEGRAM_WEBHOOK_SECRET in the repo-root .env (and as
# Worker secrets). Safe to re-run.
set -euo pipefail
ROOT=$(git rev-parse --show-toplevel)
get() { grep -s "^$1=" "$ROOT/.env" | tail -1 | cut -d= -f2-; }
T=$(get TELEGRAM_BOT_TOKEN); S=$(get TELEGRAM_WEBHOOK_SECRET)
[ -n "$T" ] && [ -n "$S" ] || { echo "TELEGRAM_BOT_TOKEN / TELEGRAM_WEBHOOK_SECRET missing in .env"; exit 1; }
curl -s "https://api.telegram.org/bot$T/setWebhook" -H 'content-type: application/json' \
  -d "{\"url\":\"${TG_WEBHOOK_URL:-https://realufo.org/__tg}\",\"secret_token\":\"$S\",\"allowed_updates\":[\"message\",\"callback_query\"],\"drop_pending_updates\":true}"
echo
curl -s "https://api.telegram.org/bot$T/getWebhookInfo" | python3 -c 'import json,sys; r=json.load(sys.stdin)["result"]; print("url:", r.get("url"), "| pending:", r.get("pending_update_count"), "| last error:", r.get("last_error_message", "-"))'
```

Run: `chmod +x scripts/tg-webhook.sh && bash -n scripts/tg-webhook.sh && echo ok`
Expected: `ok`

- [ ] **Step 3: Skills**

In `.claude/skills/publish/SKILL.md`, add after the first paragraph:

```markdown
**Telegram gate (FEATURE_GATE=on, 2026-10-04):** every post (bot, `publish.sh`, `article.py`) first lands as a preview in the owner's private chat with @real_ufo_bot. Nothing posts until the owner taps ✅. Replying to a preview replaces its text. `publish.sh` prints the job number and keeps polling; after the tap the cron finishes the fan-out. Admin commands: `/post <ID>`, `/queue`, `/status`, `/pause`, `/resume`, `/drain`, `/skip <job>`, or send an mp4 with caption `<ID> text`. The Telegram channel @realufo_org is a fan-out platform (`FEATURE_SOCIAL_TG`).
```

In `.claude/skills/publish-article/SKILL.md`, section "3. Publish", replace the two bullet lines under the code block that describe immediate writes with:

```markdown
- `article.py` uploads the images (and with `--social` the Short) to R2, then sends one Telegram preview. **Nothing is written to D1 or posted until the owner taps ✅**; the Worker then writes the story rows and site thread, pings IndexNow, and posts the Short + thread. Re-running while a preview waits returns 409.
```

In `.claude/skills/story-polls/SKILL.md`, add one line under its overview: "With the Telegram gate on, a story's poll posts only after its article (or a separate poll preview) is approved in Telegram."

- [ ] **Step 4: Full test suite + typecheck**

Run: `npx vitest run --config worker/vitest.config.ts > /tmp/w.log 2>&1; echo exit=$?; grep -E "Test Files|Tests " /tmp/w.log`
Expected: `exit=0`, all files pass

Run: `cd web && npx tsc -b --noEmit; cd ..`
Expected: no output (the web build is unchanged, but the deploy runs `tsc -b`)

- [ ] **Step 5: Commit**

```bash
git add wrangler.jsonc scripts/tg-webhook.sh .claude/skills/publish/SKILL.md .claude/skills/publish-article/SKILL.md .claude/skills/story-polls/SKILL.md
printf 'feat: Telegram gate on (picks paused), webhook script, skills updated\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\n' > /tmp/msg && git commit -F /tmp/msg
```

- [ ] **Step 6: Rollout (each step needs the owner where marked)**

1. **Owner** creates the webhook secret (the auto-mode classifier blocks Claude from writing secrets):
   ```bash
   t=$(openssl rand -hex 32) && printf '\nTELEGRAM_WEBHOOK_SECRET=%s\n' "$t" >> .env && printf %s "$t" | npx wrangler secret put TELEGRAM_WEBHOOK_SECRET --env-file /dev/null
   ```
2. Channel: "RealUFO" (id `-1004320401355`) already has @real_ufo_bot as administrator with can_post_messages (verified 2026-10-04). **Owner** makes it public as `t.me/realufo_org` when ready (`@realufo` is taken). Posting works either way.
3. Check whether another chat already deployed this branch (`git fetch`, `npx wrangler deployments list --env-file /dev/null`). Deploy from a clean worktree of HEAD: `git worktree add --detach <scratch> HEAD`, copy `.dev.vars`, `pnpm install` in root and `web/`, Node 22 on PATH, `pnpm run deploy` (applies 0038 first). Push the deployed commit.
4. `scripts/tg-webhook.sh` → `url: https://realufo.org/__tg | pending: 0 | last error: -`.
5. In Telegram: `/status`, then `/post <a video record ID>` → preview arrives → **❌ Skip** (end-to-end check, nothing posted).
6. **Owner** approves one real item when ready. With `FEATURE_SOCIAL_TG=dry`, check the `social_posts` row for `tg` is `draft`. Then switch to `"on"` in `wrangler.jsonc`, commit, and deploy the same way.
7. Update memory `feedback-video-ok-whatsapp.md` with the live version and that picks stay paused until Plan 2.
