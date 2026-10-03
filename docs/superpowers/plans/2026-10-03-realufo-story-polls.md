# Story Polls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each story (`/thread/ar_<slug>`) asks its own question. Visitors vote on the site. The X bot posts the same question as a native poll reply under the story's X thread and stores the X result, which the site shows next to its own split.

**Architecture:**
- D1 holds `articles.poll` (question + options), `poll_votes` (site votes, one per visitor) and `poll_social` (one row per platform poll: id, counts, status).
- `worker/routes/polls.ts` copies the file-verdict pattern.
- `worker/lib/xpoll.ts` runs on every cron tick: it posts at most one missing X poll and refreshes at most one X result.
- The web gets a `PollCard` under the OP of story threads.
- `scripts/article.py` writes the poll and the "Vote →" CTA in social captions.

**Tech Stack:** Cloudflare Workers + D1 (vitest-pool-workers tests), X API v2 (OAuth 1.0a, `worker/lib/x.ts`), React + TanStack Query + vitest/testing-library (web), Python 3 (`scripts/article.py`).

**Spec:** `docs/superpowers/specs/2026-10-03-realufo-story-polls-design.md`

## Global Constraints

- Poll: `q` ≤ 100 chars; 2–4 `opts`; each opt 1–25 chars (after trim); options unique.
- Tally is hidden until the visitor votes (`tally` only when `mine` set); `total` is always returned.
- Below 5 site votes: `Early days — N votes` (no percentages on the buttons).
- Posting your current opt clears it; another opt switches.
- X poll: a reply to the story's head tweet, `duration_minutes: 4320` (3 days), text `"<q> 👇"`, **no link**, `cost_usd = 0.015`.
- X poll posting is gated by `FEATURE_X === "on"` **and** `X_POLLS === "on"`. `X_POLLS` ships empty (off).
- Budget: `withinBudget(env, cost, now, true)` (operator content: no daily count, monthly $ cap applies); the month sum includes `poll_social.cost_usd`.
- At most one X poll post and one X result read per tick.
- Open X polls are re-read at most once per 20 h; a poll past `closes_at` is read until X says `closed`.
- Options of a poll are frozen once `poll_votes` or `poll_social` rows exist for it (`q` may change).
- Nothing goes to social before the user approves the questions (rollout Task 9).
- Commits: stage only files this plan touches (other chats share the checkout); end messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Stored poll JSON is malformed or breaks the rules** (hand-edited D1). Expected: the API answers 404 "no poll" and the card hides; nothing 500s. Test: Task 2 `parsePoll` cases and the GET 404 case.
2. **The opts index is out of range or not an integer** (`opt: 7`, `opt: "1"`, `opt: 1.5`). Expected: 400, nothing stored. Test: Task 2 "rejects bad input".
3. **A tick runs while a poll's X post is ambiguous** (network error after send). Expected: the row stays `pending` and is never re-posted, so no duplicate poll. Test: Task 4 "network error leaves pending, next tick does not repost".
4. **A story whose showcase isn't posted yet** (area-51) or whose head tweet failed. Expected: no X poll; it gets one once the head is `posted`. Test: Task 4 "skips stories without a posted showcase".
5. **The X result response lacks `includes.polls`** (deleted tweet, or a poll X dropped). Expected: no crash; the row is marked `failed` with an error and is not re-read every tick. Test: Task 4 "missing poll in response marks failed".

---

### Task 1: Migration 0030 (poll tables)

**Files:**
- Create: `db/migrations/0030_story_polls.sql`
- Modify: `worker/tests/schema.spec.ts:4` (EXPECTED table list)

**Interfaces:**
- Produces: `articles.poll TEXT`, tables `poll_votes(actor_id, slug, opt, updated_at)`, `poll_social(slug, platform, remote_id, status, closes_at, counts, total, fetched_at, cost_usd, error, created_at)`.
  - `poll_social.status ∈ pending|posted|closed|failed`; `platform ∈ x|threads`.
  - The `closed` status (not in the spec's schema sketch) marks a final result, as the spec's "`closed` marks it final" asks.

- [ ] **Step 1: Update the schema test (fails first)**

In `worker/tests/schema.spec.ts` line 4, add `"poll_social","poll_votes"` in alphabetical position (between `"hub_highlights"` and `"posts"`):

```ts
const EXPECTED = ["archives","article_records","articles","ask_cache","ask_log","assets","boards","cases","comments","hub_highlights","poll_social","poll_votes","posts","presence","rate_events","record_fts","record_fts_config","record_fts_content","record_fts_data","record_fts_docsize","record_fts_idx","record_links","record_ocr","record_text","record_tldr","record_verdicts","records","sightings","social_auth","social_posts","stats","text_index","threads","ticker","users","votes","x_posts"];
```

- [ ] **Step 2: Run, expect FAIL**

Run: `pnpm test:worker worker/tests/schema.spec.ts`
Expected: FAIL, the tables are missing.

- [ ] **Step 3: Write the migration**

`db/migrations/0030_story_polls.sql`:

```sql
-- Spec 9 story polls. articles.poll = {"q": "...", "opts": ["...", ...]} (2-4 opts, <=25 chars).
-- poll_votes: one site vote per visitor per story (opt = index into opts).
-- poll_social: the native poll on a platform (X; Threads if its API allows), its latest counts.
-- status: pending (row in before the API call: never double-posts) → posted → closed (final counts) | failed.
ALTER TABLE articles ADD COLUMN poll TEXT;
CREATE TABLE poll_votes (
  actor_id   TEXT NOT NULL,
  slug       TEXT NOT NULL REFERENCES articles(slug),
  opt        INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (actor_id, slug)
);
CREATE TABLE poll_social (
  slug       TEXT NOT NULL REFERENCES articles(slug),
  platform   TEXT NOT NULL CHECK(platform IN ('x','threads')),
  remote_id  TEXT,
  status     TEXT NOT NULL CHECK(status IN ('pending','posted','closed','failed')),
  closes_at  TEXT,
  counts     TEXT,
  total      INTEGER,
  fetched_at TEXT,
  cost_usd   REAL NOT NULL DEFAULT 0,
  error      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (slug, platform)
);
```

- [ ] **Step 4: Run, expect PASS**

Run: `pnpm test:worker worker/tests/schema.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add db/migrations/0030_story_polls.sql worker/tests/schema.spec.ts
git commit -m "feat(polls): migration 0030 — articles.poll, poll_votes, poll_social

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Site poll API

**Files:**
- Create: `worker/routes/polls.ts`
- Modify: `worker/index.ts` (import + 2 routes next to the verdict route, line ~42)
- Test: `worker/tests/polls.spec.ts`

**Interfaces:**
- Consumes: Task 1 tables; `actorId(req, salt)` from `worker/lib/anon.ts`; `allowWrite(env, req, "vote")` from `worker/lib/ratelimit.ts`; `json`/`error` from `worker/lib/json.ts`.
- Produces:
  - `export type Poll = { q: string; opts: string[] }`
  - `export function parsePoll(raw: string | null | undefined): Poll | null`
  - `export type PollSocial = { platform: "x" | "threads"; counts: number[]; total: number; closed: boolean }`
  - `export type PollState = { q: string; opts: string[]; mine: number | null; total: number; tally?: number[]; social: PollSocial[] }`
  - `GET /api/articles/:slug/poll` → `PollState` | 404 `{error:"no poll"}`
  - `POST /api/articles/:slug/poll` body `{opt:number}` → `PollState` (with `tally` unless cleared)

- [ ] **Step 1: Write the failing tests**

`worker/tests/polls.spec.ts`:

```ts
import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../index";
import { seedTestDB } from "./helpers";
import { parsePoll } from "../routes/polls";

const POLL = { q: "Balloon or craft?", opts: ["Balloon", "Drone", "Unknown craft", "Need more data"] };
beforeAll(async () => {
  await seedTestDB(env.DB);
  await env.DB.prepare("INSERT INTO articles(slug,title,body,poll) VALUES ('pt','T','B',?)").bind(JSON.stringify(POLL)).run();
  await env.DB.prepare("INSERT INTO articles(slug,title,body) VALUES ('nopoll','T','B')").run();
  await env.DB.prepare("INSERT INTO articles(slug,title,body,poll) VALUES ('bad','T','B','{\"q\":\"x\",\"opts\":[\"only one\"]}')").run();
});
const call = (p: string, init?: RequestInit) => worker.fetch(new Request("https://x" + p, init), env as any, {} as any);
const get = async (anon: string, slug = "pt") => call(`/api/articles/${slug}/poll`, { headers: { "X-Anon-Id": anon } });
const cast = (opt: unknown, anon: string | null = "p1", slug = "pt") =>
  call(`/api/articles/${slug}/poll`, { method: "POST", headers: anon ? { "X-Anon-Id": anon } : {}, body: JSON.stringify({ opt }) });

describe("parsePoll", () => {
  it("accepts a valid poll and trims", () => {
    expect(parsePoll(JSON.stringify({ q: " Q? ", opts: [" a ", "b"] }))).toEqual({ q: "Q?", opts: ["a", "b"] });
  });
  it("rejects malformed or rule-breaking polls", () => {
    for (const raw of [null, "", "not json", "[]", '{"q":"","opts":["a","b"]}', '{"q":"Q","opts":["a"]}',
      '{"q":"Q","opts":["a","b","c","d","e"]}', '{"q":"Q","opts":["a","a"]}', '{"q":"Q","opts":["a",""]}',
      JSON.stringify({ q: "Q", opts: ["a", "x".repeat(26)] }), JSON.stringify({ q: "x".repeat(101), opts: ["a", "b"] }),
      '{"q":"Q","opts":["a",2]}'])
      expect(parsePoll(raw as any)).toBeNull();
  });
});

describe("story poll API", () => {
  it("GET: question + total, no tally before voting, no-store", async () => {
    const r = await get("fresh");
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(await r.json()).toEqual({ ...POLL, mine: null, total: 0, social: [] });
  });

  it("404 for a story without a poll, an unknown story, or a malformed poll", async () => {
    expect((await get("a", "nopoll")).status).toBe(404);
    expect((await get("a", "nope")).status).toBe(404);
    expect((await get("a", "bad")).status).toBe(404);
    expect((await cast(0, "a", "nopoll")).status).toBe(404);
  });

  it("cast → switch → same again clears", async () => {
    let j: any = await (await cast(0)).json();
    expect(j).toMatchObject({ mine: 0, total: 1, tally: [1, 0, 0, 0] });
    j = await (await cast(2)).json();
    expect(j).toMatchObject({ mine: 2, total: 1, tally: [0, 0, 1, 0] });
    j = await (await cast(2)).json();
    expect(j).toMatchObject({ mine: null, total: 0, tally: [0, 0, 0, 0] });
  });

  it("GET shows the tally only to a voter", async () => {
    await cast(1, "p2");
    await cast(3, "p3");
    expect(await (await get("p2")).json()).toMatchObject({ mine: 1, total: 2, tally: [0, 1, 0, 1] });
    const anon: any = await (await get("nobody")).json();
    expect(anon).toMatchObject({ mine: null, total: 2 });
    expect(anon.tally).toBeUndefined();
  });

  it("social results are public, in opts order, closed flag; rows without counts are left out", async () => {
    await env.DB.prepare(
      "INSERT INTO poll_social(slug,platform,remote_id,status,counts,total) VALUES ('pt','x','T1','closed','[40,30,20,10]',100)"
    ).run();
    await env.DB.prepare("INSERT INTO poll_social(slug,platform,status) VALUES ('pt','threads','pending')").run();
    expect(((await (await get("nobody")).json()) as any).social).toEqual([{ platform: "x", counts: [40, 30, 20, 10], total: 100, closed: true }]);
    await env.DB.prepare("DELETE FROM poll_social WHERE slug='pt'").run();
  });

  it("rejects bad input", async () => {
    for (const opt of [7, -1, 1.5, "1", null, undefined]) expect((await cast(opt)).status).toBe(400);
    expect((await cast(0, null)).status).toBe(400);
    expect((await call("/api/articles/pt/poll", { method: "POST", headers: { "X-Anon-Id": "p1" }, body: "not json" })).status).toBe(400);
  });

  it("429s past the shared vote limit", async () => {
    const env1 = { ...env, RATE_MAX: "1" } as any;
    const post = () =>
      worker.fetch(new Request("https://x/api/articles/pt/poll", { method: "POST", headers: { "X-Anon-Id": "spam" }, body: JSON.stringify({ opt: 0 }) }), env1, {} as any);
    expect((await post()).status).toBe(200);
    expect((await post()).status).toBe(429);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `pnpm test:worker worker/tests/polls.spec.ts`
Expected: FAIL, `Cannot find module '../routes/polls'`.

- [ ] **Step 3: Implement `worker/routes/polls.ts`**

```ts
import type { Env } from "../env";
import { json, error } from "../lib/json";
import { actorId } from "../lib/anon";
import { allowWrite } from "../lib/ratelimit";

// Spec 9 story polls: articles.poll = {q, opts}. Same rules as file verdicts: one vote per
// visitor per story, same opt again clears it, the split is shown only after you vote.
// Native social polls (poll_social, filled by lib/xpoll.ts) are public on their platform,
// so they're returned to everyone.
export type Poll = { q: string; opts: string[] };
export type PollSocial = { platform: "x" | "threads"; counts: number[]; total: number; closed: boolean };
export type PollState = { q: string; opts: string[]; mine: number | null; total: number; tally?: number[]; social: PollSocial[] };

// X's poll limits: 2-4 options, 25 chars each. Anything else in D1 = no poll (never a 500).
export function parsePoll(raw: string | null | undefined): Poll | null {
  let p: any;
  try {
    p = JSON.parse(raw ?? "");
  } catch {
    return null;
  }
  if (!p || typeof p.q !== "string" || !Array.isArray(p.opts)) return null;
  const q = p.q.trim();
  if (!q || q.length > 100 || p.opts.length < 2 || p.opts.length > 4) return null;
  if (!p.opts.every((o: unknown) => typeof o === "string")) return null;
  const opts = (p.opts as string[]).map((o) => o.trim());
  if (opts.some((o) => !o || o.length > 25) || new Set(opts).size !== opts.length) return null;
  return { q, opts };
}

const pollOf = async (env: Env, slug: string) =>
  parsePoll((await env.DB.prepare("SELECT poll FROM articles WHERE slug=?").bind(slug).first<{ poll: string | null }>())?.poll);

async function tallyOf(env: Env, slug: string, n: number) {
  const { results } = await env.DB.prepare("SELECT opt, count(*) c FROM poll_votes WHERE slug=? GROUP BY opt")
    .bind(slug).all<{ opt: number; c: number }>();
  const tally = Array<number>(n).fill(0);
  for (const r of results) if (r.opt < n) tally[r.opt] = r.c;
  return { tally, total: tally.reduce((a, b) => a + b, 0) };
}

async function socialOf(env: Env, slug: string): Promise<PollSocial[]> {
  const { results } = await env.DB.prepare(
    "SELECT platform, counts, total, status FROM poll_social WHERE slug=? AND counts IS NOT NULL ORDER BY platform DESC"
  ).bind(slug).all<{ platform: "x" | "threads"; counts: string; total: number; status: string }>();
  return results.map((r) => ({ platform: r.platform, counts: JSON.parse(r.counts), total: r.total ?? 0, closed: r.status === "closed" }));
}

const mineOf = async (env: Env, actor: string, slug: string) =>
  actor === "anon:none"
    ? null
    : ((await env.DB.prepare("SELECT opt FROM poll_votes WHERE actor_id=? AND slug=?").bind(actor, slug).first<{ opt: number }>())?.opt ?? null);

// reveal: the tally goes to voters, and to anyone who just acted (a clear included)
async function stateOf(env: Env, slug: string, poll: Poll, mine: number | null, reveal = mine !== null): Promise<PollState> {
  const [{ tally, total }, social] = await Promise.all([tallyOf(env, slug, poll.opts.length), socialOf(env, slug)]);
  return { ...poll, mine, total, ...(reveal ? { tally } : {}), social };
}

export async function getPoll(req: Request, env: Env, p: Record<string, string>) {
  const poll = await pollOf(env, p.slug);
  if (!poll) return error(404, "no poll");
  return json(await stateOf(env, p.slug, poll, await mineOf(env, await actorId(req, env.ANON_SALT), p.slug)));
}

export async function castPoll(req: Request, env: Env, p: Record<string, string>) {
  const b = await req.json<any>().catch(() => ({}));
  const poll = await pollOf(env, p.slug);
  if (!poll) return error(404, "no poll");
  const opt = b?.opt;
  if (!Number.isInteger(opt) || opt < 0 || opt >= poll.opts.length) return error(400, "bad option");
  const actor = await actorId(req, env.ANON_SALT);
  if (actor === "anon:none") return error(400, "missing anon id");
  if (!(await allowWrite(env, req, "vote"))) return error(429, "slow down — too many votes");

  const cur = await mineOf(env, actor, p.slug);
  const clearing = cur === opt;
  if (clearing) {
    await env.DB.prepare("DELETE FROM poll_votes WHERE actor_id=? AND slug=?").bind(actor, p.slug).run();
  } else {
    await env.DB.prepare(
      `INSERT INTO poll_votes(actor_id,slug,opt) VALUES(?,?,?)
       ON CONFLICT(actor_id,slug) DO UPDATE SET opt=excluded.opt, updated_at=datetime('now')`
    ).bind(actor, p.slug, opt).run();
  }
  return json(await stateOf(env, p.slug, poll, clearing ? null : opt, true));
}
```

- [ ] **Step 4: Register the routes in `worker/index.ts`**

Add the import after `import { castVerdict } from "./routes/verdicts";`:

```ts
import { getPoll, castPoll } from "./routes/polls";
```

Add after `on("POST", "/api/records/:id/verdict", castVerdict);`:

```ts
on("GET", "/api/articles/:slug/poll", getPoll);
on("POST", "/api/articles/:slug/poll", castPoll);
```

- [ ] **Step 5: Run, expect PASS**

Run: `pnpm test:worker worker/tests/polls.spec.ts`
Expected: PASS (all cases).

- [ ] **Step 6: Commit**

```bash
git add worker/routes/polls.ts worker/index.ts worker/tests/polls.spec.ts
git commit -m "feat(polls): story poll API — vote, switch, clear; split after voting; social results

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: X client: poll posts + poll results

**Files:**
- Modify: `worker/lib/x.ts` (`createPost` signature; new `getPoll`)
- Test: `worker/tests/x.spec.ts` (extend the `createPost` describe; new `getPoll` describe)

**Interfaces:**
- Produces:
  - `createPost(s, text, mediaIds = [], replyTo?, poll?: { options: string[]; duration_minutes: number }): Promise<string>`: `poll` and `mediaIds` are mutually exclusive (X rejects both). Existing call sites are unchanged.
  - `export type PollResult = { counts: number[]; total: number; closed: boolean }`
  - `getPoll(s, tweetId): Promise<PollResult | null>`: `null` when the response has no poll.

- [ ] **Step 1: Write the failing tests**

Append inside `describe("createPost", …)` in `worker/tests/x.spec.ts`:

```ts
  it("posts a poll as a reply (no media key)", async () => {
    mockX(() => ({ status: 201, json: { data: { id: "888" } } }));
    expect(await createPost(EX, "Balloon or craft? 👇", [], "777", { options: ["A", "B"], duration_minutes: 4320 })).toBe("888");
    expect(JSON.parse(calls[0].body as string)).toEqual({
      text: "Balloon or craft? 👇",
      reply: { in_reply_to_tweet_id: "777" },
      poll: { options: ["A", "B"], duration_minutes: 4320 },
    });
  });
```

Add `getPoll` to the import on line 2, and a new describe at the end of the file:

```ts
describe("getPoll", () => {
  it("reads counts in position order, total, closed; query params are signed", async () => {
    mockX(() => ({
      json: {
        data: { id: "888", attachments: { poll_ids: ["P1"] } },
        includes: { polls: [{ id: "P1", voting_status: "closed", options: [
          { position: 2, label: "B", votes: 30 }, { position: 1, label: "A", votes: 70 }] }] },
      },
    }));
    expect(await getPoll(EX, "888")).toEqual({ counts: [70, 30], total: 100, closed: true });
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe("https://api.x.com/2/tweets/888?expansions=attachments.poll_ids&poll.fields=options,voting_status");
    expect(calls[0].auth).toMatch(/^OAuth /);
  });
  it("open poll → closed:false; no poll in response → null", async () => {
    mockX(() => ({ json: { data: { id: "1" }, includes: { polls: [{ id: "P", voting_status: "open", options: [{ position: 1, votes: 0 }, { position: 2, votes: 2 }] }] } } }));
    expect(await getPoll(EX, "1")).toEqual({ counts: [0, 2], total: 2, closed: false });
    mockX(() => ({ json: { data: { id: "1" } } }));
    expect(await getPoll(EX, "1")).toBeNull();
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `pnpm test:worker worker/tests/x.spec.ts`
Expected: FAIL, `getPoll` is not exported and the poll body is missing.

- [ ] **Step 3: Implement in `worker/lib/x.ts`**

Replace `createPost` with:

```ts
// poll and media are mutually exclusive at X (a poll tweet can't carry media).
export async function createPost(
  s: XSecrets, text: string, mediaIds: string[] = [], replyTo?: string,
  poll?: { options: string[]; duration_minutes: number },
): Promise<string> {
  const j = await call(s, "POST", "/2/tweets", {
    json: {
      text,
      ...(mediaIds.length ? { media: { media_ids: mediaIds } } : {}),
      ...(replyTo ? { reply: { in_reply_to_tweet_id: replyTo } } : {}),
      ...(poll ? { poll } : {}),
    },
  });
  return String(j.data.id);
}

export type PollResult = { counts: number[]; total: number; closed: boolean };

// Votes per option in position order (position is 1-based at X). null = the tweet has no poll.
export async function getPoll(s: XSecrets, tweetId: string): Promise<PollResult | null> {
  const j = await call(s, "GET", `/2/tweets/${tweetId}?expansions=attachments.poll_ids&poll.fields=options,voting_status`);
  const p = j.includes?.polls?.[0];
  if (!p?.options?.length) return null;
  const counts = [...p.options].sort((a: any, b: any) => a.position - b.position).map((o: any) => Number(o.votes) || 0);
  return { counts, total: counts.reduce((a: number, b: number) => a + b, 0), closed: p.voting_status === "closed" };
}
```

- [ ] **Step 4: Run, expect PASS**

Run: `pnpm test:worker worker/tests/x.spec.ts worker/tests/xbot.spec.ts`
Expected: PASS. xbot still passes because the existing `createPost` call shapes are unchanged.

- [ ] **Step 5: Commit**

```bash
git add worker/lib/x.ts worker/tests/x.spec.ts
git commit -m "feat(x): createPost poll option; getPoll reads votes per option + voting status

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: xpoll tick: post X polls, refresh results, budget

**Files:**
- Create: `worker/lib/xpoll.ts`
- Modify: `worker/lib/xbot.ts:13` (export `secretsOf`)
- Modify: `worker/lib/xpick.ts:39-47` (`withinBudget` adds `poll_social.cost_usd` to the month)
- Modify: `worker/index.ts:55-59` (`runTick` calls `pollTick`)
- Modify: `worker/env.ts` (add `X_POLLS?: string;` under `X_FORCE_PICK`)
- Modify: `wrangler.jsonc:18` (add `"X_POLLS": ""` to the X vars line)
- Test: `worker/tests/xpoll.spec.ts`, `worker/tests/xpick.spec.ts` (one budget case)

**Interfaces:**
- Consumes: `createPost(..., poll)`, `getPoll` (Task 3); `withinBudget`, `sqlTime` (xpick); `parsePoll` (Task 2); `secretsOf` (xbot, now exported).
- Produces:
  - `export async function pollTick(env: Env, now = new Date()): Promise<void>`
  - `export const POLL_MINUTES = 4320`, `export const POLL_COST = 0.015`

- [ ] **Step 1: Write the failing budget test**

Append inside the `withinBudget` describe in `worker/tests/xpick.spec.ts` (the file's `posted()` helper and `E()` exist there):

```ts
  it("counts story-poll posts in the monthly $ cap", async () => {
    await env.DB.prepare("INSERT OR IGNORE INTO articles(slug,title,body) VALUES ('budget-poll','T','B')").run();
    await env.DB.prepare("INSERT INTO poll_social(slug,platform,status,cost_usd,created_at) VALUES ('budget-poll','x','posted',0.05,?)")
      .bind(sqlTime(NOW)).run();
    expect(await withinBudget(E({ X_MONTHLY_USD_CAP: "0.06" }), 0.015, NOW, true)).toBe(false); // 0.05 + 0.015 > 0.06
    await env.DB.prepare("DELETE FROM poll_social WHERE slug='budget-poll'").run();
  });
```

- [ ] **Step 2: Write the failing xpoll tests**

`worker/tests/xpoll.spec.ts`:

```ts
import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { seedTestDB } from "./helpers";
import { pollTick } from "../lib/xpoll";
import { sqlTime } from "../lib/xpick";

beforeAll(() => seedTestDB(env.DB));

const NOW = new Date("2026-10-10T15:00:00Z");
const SECRETS = { X_API_KEY: "k", X_API_SECRET: "s", X_ACCESS_TOKEN: "t", X_ACCESS_SECRET: "ts" };
const E = (extra: Record<string, unknown> = {}) =>
  ({ ...env, ...SECRETS, FEATURE_X: "on", X_POLLS: "on", X_MONTHLY_USD_CAP: "10", ...extra }) as any;
const POLL = JSON.stringify({ q: "Balloon or craft?", opts: ["Balloon", "Craft"] });

let sent: any[] = [];
let reads: string[] = [];
let tweet: () => Response;
let read: () => Response;
beforeEach(async () => {
  for (const t of ["poll_social", "poll_votes", "x_posts"]) await env.DB.prepare(`DELETE FROM ${t}`).run();
  await env.DB.prepare("DELETE FROM threads WHERE id LIKE 'ar_xp%'").run();
  await env.DB.prepare("DELETE FROM articles WHERE slug LIKE 'xp%'").run();
  // story xp1: poll + posted showcase head tweet H1 (thread source record = the showcase record)
  await env.DB.prepare("INSERT INTO articles(slug,title,body,poll,thread_id) VALUES ('xp1','T','B',?,'ar_xp1')").bind(POLL).run();
  await env.DB.prepare(
    "INSERT INTO threads(id,no,board_id,title,stance,op_body,tags,votes,reply_count,img_count,source_record_id,hot,created_at) VALUES ('ar_xp1',1,'uap','T','analyst','B','[]',0,0,0,'CIA-UAP-017',0,?)"
  ).bind(sqlTime(NOW)).run();
  await env.DB.prepare("INSERT INTO x_posts(stream,ref,text,ai,cost_usd,status,tweet_id,created_at) VALUES ('showcase','CIA-UAP-017','t',0,0.2,'posted','H1',?)")
    .bind(sqlTime(NOW)).run();
  sent = []; reads = [];
  tweet = () => new Response(JSON.stringify({ data: { id: "P1" } }), { status: 201 });
  read = () => new Response(JSON.stringify({ data: { id: "P1" }, includes: { polls: [{ voting_status: "open", options: [{ position: 1, votes: 7 }, { position: 2, votes: 3 }] }] } }));
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any, init: any = {}) => {
    const u = String(input);
    if (u.endsWith("/2/tweets") && init.method === "POST") { sent.push(JSON.parse(init.body)); return tweet(); }
    if (u.includes("/2/tweets/")) { reads.push(u); return read(); }
    throw new Error("unexpected fetch " + u);
  });
});
afterEach(() => vi.restoreAllMocks());

const row = (slug = "xp1") => env.DB.prepare("SELECT * FROM poll_social WHERE slug=? AND platform='x'").bind(slug).first<any>();

describe("pollTick", () => {
  it("off unless FEATURE_X=on and X_POLLS=on", async () => {
    await pollTick(E({ X_POLLS: "" }), NOW);
    await pollTick(E({ FEATURE_X: "dry" }), NOW);
    expect(sent).toEqual([]);
    expect(await row()).toBeNull();
  });

  it("posts the poll once, as a reply to the head tweet, no media, no link", async () => {
    await pollTick(E(), NOW);
    expect(sent).toEqual([{ text: "Balloon or craft? 👇", reply: { in_reply_to_tweet_id: "H1" }, poll: { options: ["Balloon", "Craft"], duration_minutes: 4320 } }]);
    expect(await row()).toMatchObject({ status: "posted", remote_id: "P1", cost_usd: 0.015, closes_at: "2026-10-13 15:00:00", fetched_at: sqlTime(NOW) });
    await pollTick(E(), NOW);
    expect(sent).toHaveLength(1);
  });

  it("skips stories without a posted showcase (and without a poll)", async () => {
    await env.DB.prepare("UPDATE x_posts SET status='failed'").run();
    await pollTick(E(), NOW);
    await env.DB.prepare("UPDATE x_posts SET status='posted'").run();
    await env.DB.prepare("UPDATE articles SET poll=NULL WHERE slug='xp1'").run();
    await pollTick(E(), NOW);
    expect(sent).toEqual([]);
  });

  it("network error leaves pending, next tick does not repost", async () => {
    tweet = () => { throw new TypeError("network connection lost"); };
    await pollTick(E(), NOW);
    expect(await row()).toMatchObject({ status: "pending" });
    tweet = () => new Response(JSON.stringify({ data: { id: "P2" } }), { status: 201 });
    await pollTick(E(), NOW);
    expect(sent).toHaveLength(1);
  });

  it("402 (out of credits) deletes the row so a later tick retries", async () => {
    tweet = () => new Response(JSON.stringify({ title: "CreditsDepleted" }), { status: 402 });
    await pollTick(E(), NOW);
    expect(await row()).toBeNull();
  });

  it("other X errors mark the row failed", async () => {
    tweet = () => new Response(JSON.stringify({ title: "Invalid Request" }), { status: 400 });
    await pollTick(E(), NOW);
    expect(await row()).toMatchObject({ status: "failed" });
  });

  it("respects the monthly $ cap", async () => {
    await pollTick(E({ X_MONTHLY_USD_CAP: "0.2" }), NOW); // the head tweet already cost 0.2
    expect(sent).toEqual([]);
  });

  it("refreshes an open poll at most every 20 h, then reads it once more after close and marks it closed", async () => {
    await pollTick(E(), NOW); // posts; fetched_at = NOW
    await pollTick(E(), new Date(NOW.getTime() + 19 * 3600_000));
    expect(reads).toEqual([]);
    await pollTick(E(), new Date(NOW.getTime() + 21 * 3600_000));
    expect(reads).toHaveLength(1);
    expect(await row()).toMatchObject({ status: "posted", counts: "[7,3]", total: 10 });
    read = () => new Response(JSON.stringify({ data: { id: "P1" }, includes: { polls: [{ voting_status: "closed", options: [{ position: 1, votes: 9 }, { position: 2, votes: 4 }] }] } }));
    await pollTick(E(), new Date(NOW.getTime() + 73 * 3600_000)); // past closes_at
    expect(await row()).toMatchObject({ status: "closed", counts: "[9,4]", total: 13 });
    await pollTick(E(), new Date(NOW.getTime() + 100 * 3600_000));
    expect(reads).toHaveLength(2); // closed = never read again
  });

  it("missing poll in response marks failed (not re-read every tick)", async () => {
    await pollTick(E(), NOW);
    read = () => new Response(JSON.stringify({ data: { id: "P1" } }));
    await pollTick(E(), new Date(NOW.getTime() + 21 * 3600_000));
    expect(await row()).toMatchObject({ status: "failed", error: "no poll in response" });
  });
});
```

- [ ] **Step 3: Run, expect FAIL**

Run: `pnpm test:worker worker/tests/xpoll.spec.ts worker/tests/xpick.spec.ts`
Expected: FAIL (`../lib/xpoll` missing; budget case returns true).

- [ ] **Step 4: Budget: include poll costs in `withinBudget`** (`worker/lib/xpick.ts`)

Replace the SQL in `withinBudget` with:

```ts
  const r = await env.DB.prepare(
    `SELECT sum(date(created_at)=date(?1)) today, coalesce(sum(CASE WHEN strftime('%Y-%m',created_at)=strftime('%Y-%m',?1) THEN cost_usd END),0)
       + (SELECT coalesce(sum(cost_usd),0) FROM poll_social WHERE status!='failed' AND strftime('%Y-%m',created_at)=strftime('%Y-%m',?1)) month
     FROM x_posts WHERE status!='failed'`
  ).bind(t).first<{ today: number | null; month: number }>();
```

Also update the comment above it to: `// Rows that may have cost money: everything but failed (x_posts + story polls).`

- [ ] **Step 5: Export `secretsOf` in `worker/lib/xbot.ts`**

Line 13: `const secretsOf = …` → `export const secretsOf = …`.

- [ ] **Step 6: Implement `worker/lib/xpoll.ts`**

```ts
import type { Env } from "../env";
import { createPost, getPoll, XError, type XSecrets } from "./x";
import { withinBudget, sqlTime } from "./xpick";
import { secretsOf } from "./xbot";
import { parsePoll } from "../routes/polls";

// Spec 9: a story's question as a native X poll, posted as a reply under the story's X
// thread (polls can't carry media, so not on the head tweet). One path for new stories and
// the backfill: any story with a poll + a posted showcase head tweet + no X poll yet.
// X_POLLS gates it so nothing goes out before the operator OKs the questions.
export const POLL_MINUTES = 4320; // 3 days
export const POLL_COST = 0.015; // no link in the text: 0.2 with one (xpick costOf)
const REFRESH_MS = 20 * 3600_000;
const log = (o: Record<string, unknown>) => console.log(JSON.stringify({ xpoll: true, ...o }));

async function postNext(env: Env, s: XSecrets, now: Date) {
  const c = await env.DB.prepare(
    `SELECT a.slug, a.poll, x.tweet_id FROM articles a
     JOIN threads t ON t.id = a.thread_id
     JOIN x_posts x ON x.stream='showcase' AND x.ref=t.source_record_id AND x.status='posted' AND x.tweet_id IS NOT NULL
     LEFT JOIN poll_social p ON p.slug=a.slug AND p.platform='x'
     WHERE a.poll IS NOT NULL AND p.slug IS NULL
     ORDER BY a.created_at LIMIT 1`
  ).first<{ slug: string; poll: string; tweet_id: string }>();
  const poll = c && parsePoll(c.poll);
  if (!c || !poll) return;
  if (!(await withinBudget(env, POLL_COST, now, true))) return log({ budget: c.slug });
  // row first: a retry after an ambiguous failure can never post a second poll
  const ins = await env.DB.prepare(
    "INSERT INTO poll_social(slug,platform,status,created_at) VALUES (?,'x','pending',?) ON CONFLICT DO NOTHING RETURNING slug"
  ).bind(c.slug, sqlTime(now)).first();
  if (!ins) return;
  try {
    const id = await createPost(s, `${poll.q} 👇`, [], c.tweet_id, { options: poll.opts, duration_minutes: POLL_MINUTES });
    log({ posted: c.slug, tweet: id });
    await env.DB.prepare(
      "UPDATE poll_social SET status='posted', remote_id=?, closes_at=?, fetched_at=?, cost_usd=?, error=NULL WHERE slug=? AND platform='x'"
    ).bind(id, sqlTime(new Date(now.getTime() + POLL_MINUTES * 60_000)), sqlTime(now), POLL_COST, c.slug).run();
  } catch (e) {
    if (!(e instanceof XError)) {
      // network error after send: X may have created it → stays pending, fixed by hand, never re-posted
      await env.DB.prepare("UPDATE poll_social SET error=? WHERE slug=? AND platform='x'").bind(String(e).slice(0, 500), c.slug).run();
      return log({ ambiguous: c.slug, error: String(e).slice(0, 200) });
    }
    if (e.status === 401 || e.status === 402 || (e.status === 403 && !/duplicate/i.test(e.body))) {
      await env.DB.prepare("DELETE FROM poll_social WHERE slug=? AND platform='x'").bind(c.slug).run(); // nothing posted; retry later
      return log({ halted: c.slug, status: e.status });
    }
    await env.DB.prepare("UPDATE poll_social SET status='failed', error=? WHERE slug=? AND platform='x'").bind(String(e).slice(0, 500), c.slug).run();
    log({ failed: c.slug, status: e.status });
  }
}

// Open polls: re-read at most every 20 h. Past closes_at: read until X says closed (final).
async function refreshNext(env: Env, s: XSecrets, now: Date) {
  const r = await env.DB.prepare(
    `SELECT slug, remote_id FROM poll_social WHERE platform='x' AND status='posted' AND remote_id IS NOT NULL
     AND (fetched_at IS NULL OR fetched_at <= ?1 OR closes_at <= ?2) ORDER BY fetched_at LIMIT 1`
  ).bind(sqlTime(new Date(now.getTime() - REFRESH_MS)), sqlTime(now)).first<{ slug: string; remote_id: string }>();
  if (!r) return;
  try {
    const p = await getPoll(s, r.remote_id);
    if (!p) {
      await env.DB.prepare("UPDATE poll_social SET status='failed', error='no poll in response', fetched_at=? WHERE slug=? AND platform='x'")
        .bind(sqlTime(now), r.slug).run();
      return log({ noPoll: r.slug });
    }
    await env.DB.prepare("UPDATE poll_social SET counts=?, total=?, fetched_at=?, status=? WHERE slug=? AND platform='x'")
      .bind(JSON.stringify(p.counts), p.total, sqlTime(now), p.closed ? "closed" : "posted", r.slug).run();
  } catch (e) {
    // transient: bump fetched_at so one bad poll can't hog every tick's single read
    await env.DB.prepare("UPDATE poll_social SET fetched_at=?, error=? WHERE slug=? AND platform='x'").bind(sqlTime(now), String(e).slice(0, 500), r.slug).run();
    log({ readFailed: r.slug, error: String(e).slice(0, 200) });
  }
}

export async function pollTick(env: Env, now = new Date()) {
  if (env.FEATURE_X !== "on" || env.X_POLLS !== "on") return;
  const s = secretsOf(env);
  if (!s) return;
  await postNext(env, s, now);
  await refreshNext(env, s, now);
}
```

Note the transient-read branch: after close, `closes_at <= now` stays true, so a failing read retries every tick. That is acceptable (one cheap read per 3 h tick).

- [ ] **Step 7: Wire it in**

`worker/env.ts`, under `X_FORCE_PICK`:

```ts
  X_POLLS?: string; // "on" = post story polls on X (Spec 9); anything else = off
```

`wrangler.jsonc` line 18: append `, "X_POLLS": ""` after `"X_SINCE": "2026-10-02"` and add a comment line above line 18:

```jsonc
    // X_POLLS "" = story polls off until the operator OKs the questions (Spec 9)
```

`worker/index.ts`: import and call it in `runTick`:

```ts
import { pollTick } from "./lib/xpoll";
```

```ts
async function runTick(env: Env) {
  const logErr = (who: string) => (e: unknown) => console.log(JSON.stringify({ [who]: true, crashed: String(e).slice(0, 300) }));
  await tick(env).catch(logErr("xbot"));
  await socialTick(env).catch(logErr("social"));
  await pollTick(env).catch(logErr("xpoll"));
}
```

- [ ] **Step 8: Run, expect PASS (whole worker suite)**

Run: `pnpm test:worker`
Expected: PASS. `manual-tick.spec.ts` and `xbot.spec.ts` are unaffected because `X_POLLS` is empty in the test env.

- [ ] **Step 9: Commit**

```bash
git add worker/lib/xpoll.ts worker/lib/xbot.ts worker/lib/xpick.ts worker/index.ts worker/env.ts wrangler.jsonc worker/tests/xpoll.spec.ts worker/tests/xpick.spec.ts
git commit -m "feat(polls): cron posts each story's question as an X poll reply, refreshes results (X_POLLS gate)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Threads poll probe (answer only, no code kept)

**Files:** none committed. The result is recorded in the spec's Threads section.

- [ ] **Step 1: Read the docs**

Open the Threads API docs in the built-in browser: `https://developers.facebook.com/docs/threads/create-posts/polls` (if it 404s, search the Threads docs for "poll"). Record:
- the create param name (expected: `poll_attachment`, JSON `{"option_a":"…","option_b":"…","option_c":"…","option_d":"…"}`, TEXT posts only);
- whether `reply_to_id` can be combined with it;
- the read fields (expected: `poll_attachment{option_a,…,option_a_votes_percentage,…,total_votes,expiration_timestamp}`);
- any required permission or app review beyond `threads_content_publish`.

- [ ] **Step 2: Probe the container only (creates nothing public)**

The Threads token lives in D1 `social_auth`; the user id is the `THREADS_USER_ID` secret. Ask the user for the user id if it's not in the shell. Read the token:

```bash
npx wrangler d1 execute realufo-db --remote --env-file /dev/null --json --command "SELECT access_token FROM social_auth WHERE platform='threads'"
```

Find a posted Threads post id to reply to:

```bash
npx wrangler d1 execute realufo-db --remote --env-file /dev/null --json --command "SELECT remote_id FROM social_posts WHERE platform='threads' AND status='posted' AND deleted_at IS NULL ORDER BY id DESC LIMIT 1"
```

Create a **container only** (no `threads_publish` call, so nothing goes live):

```bash
curl -s -X POST "https://graph.threads.net/v1.0/$THREADS_USER_ID/threads" \
  --data-urlencode "media_type=TEXT" --data-urlencode "text=probe" \
  --data-urlencode 'poll_attachment={"option_a":"Yes","option_b":"No"}' \
  --data-urlencode "reply_to_id=$REMOTE_ID" --data-urlencode "access_token=$TOKEN"
```

Expected: `{"id":"…"}` = supported. An error naming `poll_attachment` or a permission = not supported. Don't print the token in chat.

- [ ] **Step 3: Record the answer**

Append to the spec's `## Threads (gated by a probe)` section one line: `Probe 2026-10-0X: supported | not supported — <param names / error>`. Commit the spec:

```bash
git add docs/superpowers/specs/2026-10-03-realufo-story-polls-design.md
git commit -m "docs(spec): Threads poll probe result

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**If not supported:** skip Task 6. Threads gets the CTA copy from Task 8.

---

### Task 6 (only if Task 5 says supported): Threads poll

**Files:**
- Modify: `worker/lib/xpoll.ts` (add Threads post + refresh, called from `pollTick`)
- Test: `worker/tests/xpoll.spec.ts` (Threads cases)

**Interfaces:**
- Consumes: `THREADS_API` from `worker/lib/social/meta.ts`, `token(env, "threads", now)` from `worker/lib/social/auth.ts`, `env.THREADS_USER_ID`, `parsePoll`.
- Produces: `poll_social` rows with `platform='threads'`, the same status machine as X.

Use the param/field names recorded in Task 5. The code below uses the expected names; if the probe recorded different ones, change only the two marked lines.

- [ ] **Step 1: Write the failing tests**

Append to `worker/tests/xpoll.spec.ts`. Extend `beforeEach` to insert a posted Threads mirror of the showcase (`social_posts` row with `x_post_id` = the showcase row id, `platform='threads'`, `status='posted'`, `remote_id='TH1'`) and a `social_auth` threads token (`access_token='tok'`, `expires_at='2099-01-01 00:00:00'`). Route `graph.threads.net` URLs in the fetch mock: `/threads` POST → `{id:"C1"}`, `/threads_publish` → `{id:"TP1"}`, `GET /TP1?fields=…` → `{poll_attachment:{option_a_votes_percentage:70,option_b_votes_percentage:30,total_votes:10,expiration_timestamp:"2026-10-13T15:00:00+0000"}}`.

```ts
describe("pollTick: threads", () => {
  const TE = (x: Record<string, unknown> = {}) => E({ THREADS_USER_ID: "U1", FEATURE_SOCIAL_THREADS: "on", ...x });
  const trow = () => env.DB.prepare("SELECT * FROM poll_social WHERE slug='xp1' AND platform='threads'").first<any>();

  it("posts a TEXT poll reply to the Threads mirror once", async () => {
    await pollTick(TE(), NOW);
    expect(threadsCreates).toHaveLength(1);
    expect(threadsCreates[0].get("reply_to_id")).toBe("TH1");
    expect(JSON.parse(threadsCreates[0].get("poll_attachment"))).toEqual({ option_a: "Balloon", option_b: "Craft" });
    expect(await trow()).toMatchObject({ status: "posted", remote_id: "TP1" });
    await pollTick(TE(), NOW);
    expect(threadsCreates).toHaveLength(1);
  });

  it("off when FEATURE_SOCIAL_THREADS isn't on", async () => {
    await pollTick(TE({ FEATURE_SOCIAL_THREADS: "dry" }), NOW);
    expect(await trow()).toBeNull();
  });

  it("refresh converts percentages to counts", async () => {
    await pollTick(TE(), NOW);
    await pollTick(TE(), new Date(NOW.getTime() + 21 * 3600_000));
    expect(await trow()).toMatchObject({ counts: "[7,3]", total: 10 });
  });
});
```

(`threadsCreates: URLSearchParams[]` is collected in the fetch mock from `init.body` of POSTs to `/U1/threads`.)

- [ ] **Step 2: Run, expect FAIL**

Run: `pnpm test:worker worker/tests/xpoll.spec.ts`

- [ ] **Step 3: Implement**

In `worker/lib/xpoll.ts` add:

```ts
import { THREADS_API } from "./social/meta";
import { token as threadsToken } from "./social/auth";

const LETTERS = ["a", "b", "c", "d"];

async function threadsPostNext(env: Env, now: Date) {
  if (env.FEATURE_SOCIAL_THREADS !== "on" || !env.THREADS_USER_ID) return;
  const c = await env.DB.prepare(
    `SELECT a.slug, a.poll, sp.remote_id FROM articles a
     JOIN threads t ON t.id = a.thread_id
     JOIN x_posts x ON x.stream='showcase' AND x.ref=t.source_record_id
     JOIN social_posts sp ON sp.x_post_id=x.id AND sp.platform='threads' AND sp.status='posted' AND sp.deleted_at IS NULL
     LEFT JOIN poll_social p ON p.slug=a.slug AND p.platform='threads'
     WHERE a.poll IS NOT NULL AND p.slug IS NULL ORDER BY a.created_at LIMIT 1`
  ).first<{ slug: string; poll: string; remote_id: string }>();
  const poll = c && parsePoll(c.poll);
  if (!c || !poll) return;
  const ins = await env.DB.prepare("INSERT INTO poll_social(slug,platform,status,created_at) VALUES (?,'threads','pending',?) ON CONFLICT DO NOTHING RETURNING slug")
    .bind(c.slug, sqlTime(now)).first();
  if (!ins) return;
  const access_token = await threadsToken(env, "threads", now);
  const form = (o: Record<string, string>) => ({ method: "POST", body: new URLSearchParams(o) });
  try {
    const attach = Object.fromEntries(poll.opts.map((o, i) => [`option_${LETTERS[i]}`, o])); // ← probe-confirmed param shape
    const cr = await (await fetch(`${THREADS_API}/${env.THREADS_USER_ID}/threads`, form({
      media_type: "TEXT", text: `${poll.q} 👇`, reply_to_id: c.remote_id, poll_attachment: JSON.stringify(attach), access_token,
    }))).json<any>();
    if (!cr.id) throw new Error(JSON.stringify(cr).slice(0, 300));
    const pub = await (await fetch(`${THREADS_API}/${env.THREADS_USER_ID}/threads_publish`, form({ creation_id: cr.id, access_token }))).json<any>();
    if (!pub.id) throw new Error(JSON.stringify(pub).slice(0, 300));
    await env.DB.prepare("UPDATE poll_social SET status='posted', remote_id=?, closes_at=?, fetched_at=? WHERE slug=? AND platform='threads'")
      .bind(pub.id, sqlTime(new Date(now.getTime() + 24 * 3600_000)), sqlTime(now), c.slug).run(); // Threads polls run 24 h
  } catch (e) {
    await env.DB.prepare("UPDATE poll_social SET status='failed', error=? WHERE slug=? AND platform='threads'").bind(String(e).slice(0, 500), c.slug).run();
    log({ threadsFailed: c.slug, error: String(e).slice(0, 200) });
  }
}

async function threadsRefreshNext(env: Env, now: Date) {
  if (env.FEATURE_SOCIAL_THREADS !== "on") return;
  const r = await env.DB.prepare(
    `SELECT p.slug, p.remote_id, a.poll FROM poll_social p JOIN articles a ON a.slug=p.slug
     WHERE p.platform='threads' AND p.status='posted' AND (p.fetched_at <= ?1 OR p.closes_at <= ?2) ORDER BY p.fetched_at LIMIT 1`
  ).bind(sqlTime(new Date(now.getTime() - REFRESH_MS)), sqlTime(now)).first<{ slug: string; remote_id: string; poll: string }>();
  const poll = r && parsePoll(r.poll);
  if (!r || !poll) return;
  const n = poll.opts.length;
  const fields = `poll_attachment{${LETTERS.slice(0, n).map((l) => `option_${l}_votes_percentage`).join(",")},total_votes,expiration_timestamp}`; // ← probe-confirmed field names
  try {
    const j = await (await fetch(`${THREADS_API}/${r.remote_id}?fields=${encodeURIComponent(fields)}&access_token=${await threadsToken(env, "threads", now)}`)).json<any>();
    const pa = j.poll_attachment;
    if (!pa) throw new Error("no poll in response");
    const total = Number(pa.total_votes) || 0;
    const counts = LETTERS.slice(0, n).map((l) => Math.round(((Number(pa[`option_${l}_votes_percentage`]) || 0) * total) / 100));
    const closed = !!pa.expiration_timestamp && new Date(pa.expiration_timestamp) <= now;
    await env.DB.prepare("UPDATE poll_social SET counts=?, total=?, fetched_at=?, status=? WHERE slug=? AND platform='threads'")
      .bind(JSON.stringify(counts), total, sqlTime(now), closed ? "closed" : "posted", r.slug).run();
  } catch (e) {
    await env.DB.prepare("UPDATE poll_social SET fetched_at=?, error=? WHERE slug=? AND platform='threads'").bind(sqlTime(now), String(e).slice(0, 500), r.slug).run();
  }
}
```

Note: if the probe found `*_votes_percentage` to be a 0–1 fraction rather than 0–100, drop the `/ 100`.

In `pollTick`, after the X calls:

```ts
  await threadsPostNext(env, now);
  await threadsRefreshNext(env, now);
```

Move the `secretsOf` check so it gates only the X calls:

```ts
export async function pollTick(env: Env, now = new Date()) {
  if (env.FEATURE_X !== "on" || env.X_POLLS !== "on") return;
  const s = secretsOf(env);
  if (s) {
    await postNext(env, s, now);
    await refreshNext(env, s, now);
  }
  await threadsPostNext(env, now);
  await threadsRefreshNext(env, now);
}
```

- [ ] **Step 4: Run, expect PASS**

Run: `pnpm test:worker`

- [ ] **Step 5: Commit**

```bash
git add worker/lib/xpoll.ts worker/tests/xpoll.spec.ts
git commit -m "feat(polls): story poll as a Threads poll reply + results

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Web — PollCard on story threads

**Files:**
- Modify: `web/src/api/types.ts` (add types after `VerdictState`, line ~283)
- Modify: `web/src/api/queries.ts` (`qk.poll`, `usePoll`, `useCastPoll`)
- Create: `web/src/components/PollCard.tsx`
- Modify: `web/src/screens/Thread.tsx:373-384` (render `PollCard` after the OP row)
- Modify: `web/src/tests/thread.test.tsx:29` (add `usePoll`/`useCastPoll` to the queries mock)
- Test: `web/src/tests/poll.test.tsx`

**Interfaces:**
- Consumes: `GET/POST /api/articles/:slug/poll` → `PollState` (Task 2).
- Produces: `PollCard({ slug }: { slug: string })`, `usePoll(slug)`, `useCastPoll(slug)`.

- [ ] **Step 1: Types** (`web/src/api/types.ts`, after `VerdictState`)

```ts
/** Spec 9 story poll. tally only after you vote; social = native polls (X, Threads), public. */
export interface PollSocial { platform: "x" | "threads"; counts: number[]; total: number; closed: boolean }
export interface PollState { q: string; opts: string[]; mine: number | null; total: number; tally?: number[]; social: PollSocial[] }
```

- [ ] **Step 2: Queries** (`web/src/api/queries.ts`)

Add `PollState` to the type import list. In `qk` add:

```ts
  poll: (slug: string) => ["poll", slug] as const,
```

After `useCastVerdict`:

```ts
// Story poll (Spec 9). 404 = the story has no poll → no retry, the card hides.
export function usePoll(slug: string) {
  return useQuery({
    queryKey: qk.poll(slug),
    queryFn: () => api.get<PollState>(`/api/articles/${encodeURIComponent(slug)}/poll`),
    enabled: !!slug,
    retry: false,
  });
}

export function useCastPoll(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (opt: number) => api.post<PollState>(`/api/articles/${encodeURIComponent(slug)}/poll`, { opt }),
    onSuccess: (data) => queryClient.setQueryData(qk.poll(slug), data),
  });
}
```

- [ ] **Step 3: Write the failing component test**

`web/src/tests/poll.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PollCard } from "../components/PollCard";
import type { PollState } from "../api/types";

const mutate = vi.fn();
const toast = vi.fn();
let data: PollState | undefined;
vi.mock("../api/queries", () => ({
  usePoll: () => ({ data }),
  useCastPoll: () => ({ mutate, isPending: false }),
}));
vi.mock("../overlays/OverlayProvider", () => ({ useOverlay: () => ({ toast }) }));

const BASE = { q: "Balloon or craft?", opts: ["Balloon", "Drone", "Unknown craft", "Need more data"], social: [] };
beforeEach(() => {
  mutate.mockReset();
  toast.mockReset();
  data = undefined;
});

describe("PollCard", () => {
  it("renders nothing without a poll (404 / loading)", () => {
    const { container } = render(<PollCard slug="s" />);
    expect(container.innerHTML).toBe("");
  });

  it("before voting: question, tease with count, no percentages; tap casts", () => {
    data = { ...BASE, mine: null, total: 7 };
    render(<PollCard slug="s" />);
    expect(screen.getByText("CROWD POLL")).toBeTruthy();
    expect(screen.getByText("Balloon or craft?")).toBeTruthy();
    expect(screen.getByText(/Vote to reveal the crowd/)).toHaveTextContent(/^\? \? \? Vote to reveal the crowd · 7 votes$/);
    expect(screen.queryByText(/%/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Drone/ }));
    expect(mutate).toHaveBeenCalledWith(1, expect.any(Object));
  });

  it("under 5 votes: early days, mine pressed, no percentages", () => {
    data = { ...BASE, mine: 0, total: 3, tally: [2, 1, 0, 0] };
    render(<PollCard slug="s" />);
    expect(screen.getByRole("button", { name: /Balloon/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Early days — 3 votes")).toBeTruthy();
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it("5+ votes: percentage per option, total in a live region", () => {
    data = { ...BASE, mine: 2, total: 20, tally: [10, 5, 4, 1] };
    render(<PollCard slug="s" />);
    expect(screen.getByRole("button", { name: /Balloon/ })).toHaveTextContent("50%");
    expect(screen.getByRole("button", { name: /Need more data/ })).toHaveTextContent("5%");
    expect(screen.getByText("20 votes").closest("[aria-live]")?.getAttribute("aria-live")).toBe("polite");
  });

  it("social line shows the top option on X, before voting too; (final) when closed", () => {
    data = { ...BASE, mine: null, total: 0, social: [{ platform: "x", counts: [71, 20, 5, 4], total: 100, closed: true }] };
    render(<PollCard slug="s" />);
    expect(screen.getByText("On X: 71% Balloon · 100 votes (final)")).toBeTruthy();
  });

  it("toasts the server message on error; ignores a quick double-tap", () => {
    data = { ...BASE, mine: null, total: 0 };
    mutate.mockImplementation((_o, opts) => opts.onError(new Error("slow down — too many votes")));
    const now = vi.spyOn(Date, "now").mockReturnValue(1000);
    render(<PollCard slug="s" />);
    const btn = screen.getByRole("button", { name: /Balloon/ });
    fireEvent.click(btn);
    now.mockReturnValue(1200);
    fireEvent.click(btn);
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith("slow down — too many votes");
    now.mockRestore();
  });
});
```

- [ ] **Step 4: Run, expect FAIL**

Run: `pnpm test:web src/tests/poll.test.tsx`
Expected: FAIL, the module `../components/PollCard` is missing.

- [ ] **Step 5: Implement `web/src/components/PollCard.tsx`**

```tsx
// Story poll (Spec 9): one tap per visitor; the split shows only after you vote (the API
// withholds it). The native X/Threads result is public, so it shows to everyone as a hook.
import { useRef } from "react";
import type { PollSocial } from "../api/types";
import { useCastPoll, usePoll } from "../api/queries";
import { useOverlay } from "../overlays/OverlayProvider";

const DOUBLE_TAP_MS = 600; // same guard as VerdictBar: a quick second tap isn't "clear my vote"
const MIN_CROWD = 5; // below this a percentage is noise
const NAMES: Record<PollSocial["platform"], string> = { x: "X", threads: "Threads" };
const pct = (n: number, total: number) => (total ? Math.round((n * 100) / total) : 0);
const votes = (n: number) => `${n} ${n === 1 ? "vote" : "votes"}`;

function socialLine(s: PollSocial, opts: string[]) {
  const top = s.counts.indexOf(Math.max(...s.counts));
  return `On ${NAMES[s.platform]}: ${pct(s.counts[top], s.total)}% ${opts[top]} · ${votes(s.total)}${s.closed ? " (final)" : ""}`;
}

export function PollCard({ slug }: { slug: string }) {
  const { data } = usePoll(slug);
  const cast = useCastPoll(slug);
  const { toast } = useOverlay();
  const lastTap = useRef<{ o: number; t: number } | null>(null);
  if (!data) return null;

  const { q, opts, mine, total, tally, social } = data;
  const show = !!tally && total >= MIN_CROWD;
  const vote = (o: number) => {
    const t = Date.now();
    const prev = lastTap.current;
    lastTap.current = { o, t };
    if (prev?.o === o && t - prev.t < DOUBLE_TAP_MS) return;
    navigator.vibrate?.(5);
    cast.mutate(o, { onError: (e: Error) => toast(e.message) });
  };

  return (
    <section aria-label="Crowd poll" className="rounded-xl border border-line p-3">
      <div className="mb-1 font-mono text-[11px] font-semibold tracking-[.4px] text-faint">CROWD POLL</div>
      <div className="mb-3 text-[15px] font-semibold text-ink">{q}</div>
      <div className="flex flex-col gap-2">
        {opts.map((label, i) => {
          const p = show ? pct(tally![i], total) : 0;
          return (
            <button
              key={label}
              type="button"
              aria-pressed={mine === i}
              disabled={cast.isPending}
              onClick={() => vote(i)}
              className="relative min-h-[44px] overflow-hidden rounded-[10px] border px-3 text-left text-[14px] active:scale-[.99] disabled:opacity-60"
              style={{ borderColor: mine === i ? "var(--signal)" : "var(--line2)", color: mine === i ? "var(--ink)" : "var(--dim)" }}
            >
              {show && <span aria-hidden="true" className="absolute inset-y-0 left-0 bg-line" style={{ width: `${p}%` }} />}
              <span className="relative flex justify-between gap-2">
                <span>{label}</span>
                {show && <span className="font-mono font-semibold">{p}%</span>}
              </span>
            </button>
          );
        })}
      </div>
      <div aria-live="polite" className="mt-2 font-mono text-[11px] text-faint">
        {tally ? (
          total < MIN_CROWD ? `Early days — ${votes(total)}` : votes(total)
        ) : (
          <>
            <span aria-hidden="true">? ? ?</span> Vote to reveal the crowd{total ? ` · ${votes(total)}` : ""}
          </>
        )}
      </div>
      {social.filter((s) => s.total > 0).map((s) => (
        <div key={s.platform} className="mt-1 font-mono text-[11px] text-dim">{socialLine(s, opts)}</div>
      ))}
    </section>
  );
}
```

- [ ] **Step 6: Run the component test, expect PASS**

Run: `pnpm test:web src/tests/poll.test.tsx`

- [ ] **Step 7: Mount it under the OP in `web/src/screens/Thread.tsx`**

Add the import next to the other component imports:

```tsx
import { PollCard } from "../components/PollCard";
```

Replace the `posts.map` block (lines ~373-384) with:

```tsx
        {posts.map((p) => (
          <Fragment key={p.id}>
            <PostRow
              post={p}
              sourceRecord={sourceRecord}
              thread={p.isOp ? thread : undefined}
              nos={nos}
              replies={replyMap.get(p.no) ?? []}
              onQuote={handleQuote}
            />
            {/* story threads (ar_<slug>) carry the story's crowd poll right under the story */}
            {p.isOp && id.startsWith("ar_") && <PollCard slug={id.slice(3)} />}
          </Fragment>
        ))}
```

Add `Fragment` to the existing `react` import in Thread.tsx (or add `import { Fragment } from "react";`).

In `web/src/tests/thread.test.tsx`, add to the `vi.mock("../api/queries", …)` object:

```ts
  usePoll: () => ({ data: undefined }),
  useCastPoll: () => ({ mutate: vi.fn(), isPending: false }),
```

- [ ] **Step 8: Run all web tests + build**

Run: `pnpm test:web && pnpm build:web`
Expected: PASS, and the build succeeds (`tsc -b` included).

- [ ] **Step 9: Commit**

```bash
git add web/src/api/types.ts web/src/api/queries.ts web/src/components/PollCard.tsx web/src/screens/Thread.tsx web/src/tests/poll.test.tsx web/src/tests/thread.test.tsx
git commit -m "feat(web): crowd poll card under the story on ar_ threads; X result line

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: article.py: poll field, frozen options, Vote CTA, skill doc

**Files:**
- Modify: `scripts/article.py`
- Create: `scripts/test_article_poll.py`
- Modify: `.claude/skills/publish-article/SKILL.md` (§2 poll bullet, §3 note)

**Interfaces:**
- Consumes: Task 1 columns; `parsePoll` rules (mirrored in Python).
- Produces: `poll_error(p) -> str | None`, `cta(a, thread) -> str` in `scripts/article.py`.

- [ ] **Step 1: Write the failing self-check**

`scripts/test_article_poll.py`:

```python
#!/usr/bin/env python3
"""python3 scripts/test_article_poll.py — poll rules + CTA line of scripts/article.py."""
import importlib.util, os

spec = importlib.util.spec_from_file_location("article", os.path.join(os.path.dirname(__file__), "article.py"))
article = importlib.util.module_from_spec(spec)
spec.loader.exec_module(article)

ok = {"q": "Balloon or craft?", "opts": ["Balloon", "Drone", "Unknown craft", "Need more data"]}
assert article.poll_error(ok) is None
for bad in [{"q": "", "opts": ["a", "b"]}, {"q": "Q", "opts": ["a"]}, {"q": "Q", "opts": ["a", "b", "c", "d", "e"]},
            {"q": "Q", "opts": ["a", "a"]}, {"q": "Q", "opts": ["a", " "]}, {"q": "Q", "opts": ["a", "x" * 26]},
            {"q": "x" * 101, "opts": ["a", "b"]}, {"q": "Q", "opts": "ab"}, "nope"]:
    assert article.poll_error(bad), bad

assert article.cta({"poll": ok}, "ar_s") == "\nBalloon or craft? Vote → https://realufo.org/thread/ar_s"
assert article.cta({}, "ar_s") == "\nFull story: https://realufo.org/thread/ar_s"
print("ok")
```

- [ ] **Step 2: Run, expect FAIL**

Run: `python3 scripts/test_article_poll.py`
Expected: `AttributeError: module 'article' has no attribute 'poll_error'`.

- [ ] **Step 3: Implement in `scripts/article.py`**

Docstring: in the `article.json:` paragraph, add after `evidence: [{id, t?, label, evidence, image?}].`:

```
poll (optional): {q, opts} — the story's crowd question (q ≤100, 2-4 opts ≤25 chars, unique); site
poll + an X poll reply (worker/lib/xpoll.ts, X_POLLS=on). Opts are frozen once anyone voted.
```

After `doc_link`, add:

```python
def poll_error(p):
    """Same rules as worker/routes/polls.ts parsePoll (X's limits). None = valid."""
    if not isinstance(p, dict) or not isinstance(p.get("q"), str) or not isinstance(p.get("opts"), list):
        return "poll must be {q, opts: [...]}"
    q, opts = p["q"].strip(), [o.strip() if isinstance(o, str) else o for o in p["opts"]]
    if not q or len(q) > 100:
        return "poll.q must be 1-100 chars"
    if not 2 <= len(opts) <= 4:
        return "poll needs 2-4 opts"
    if any(not isinstance(o, str) or not o or len(o) > 25 for o in opts):
        return "each poll opt must be 1-25 chars"
    if len(set(opts)) != len(opts):
        return "poll opts must be unique"
    return None


def cta(a, thread):
    """Last line of the social caption: the poll question as a Vote link, else the story link."""
    url = f"{SITE}/thread/{thread}"
    return f"\n{a['poll']['q'].strip()} Vote → {url}" if a.get("poll") else f"\nFull story: {url}"
```

In `main()`, right after the `assert a["slug"] == slug …` line:

```python
    poll = a.get("poll")
    if poll and (err := poll_error(poll)):
        sys.exit(f"article.json: {err}")
    poll_json = poll and json.dumps({"q": poll["q"].strip(), "opts": [o.strip() for o in poll["opts"]]}, ensure_ascii=False)
```

Before `print("== rows → D1")`, add the frozen-options guard:

```python
    if poll:
        cur = d1(f"""SELECT a.poll, (SELECT count(*) FROM poll_votes WHERE slug={q(slug)}) + (SELECT count(*) FROM poll_social WHERE slug={q(slug)}) n
                     FROM articles a WHERE a.slug={q(slug)}""", read=True)
        if cur and cur[0]["poll"] and cur[0]["n"] and json.loads(cur[0]["poll"])["opts"] != json.loads(poll_json)["opts"]:
            sys.exit("poll opts are frozen: votes or a social poll exist (the question wording may still change)")
```

In the `articles` upsert, write `poll`:

```python
    sql = [f"""INSERT INTO articles(slug,title,body,image_key,poll) VALUES({q(slug)},{q(a['title'])},{q(SEP.join(a['parts']))},{q(hero)},{q(poll_json)})
               ON CONFLICT(slug) DO UPDATE SET title=excluded.title, body=excluded.body, image_key=excluded.image_key, poll=excluded.poll;""",
```

After `print(f"   {SITE}/thread/{thread}")`:

```python
    if poll:
        print(f"   poll: {poll['q'].strip()} 👇  [{' / '.join(poll['opts'])}]  (X reply once X_POLLS=on)")
```

In the `if social:` block, replace the `text = …` line with:

```python
        text = SEP.join([*a["parts"][:-1], a["parts"][-1] + cta(a, thread)])
```

- [ ] **Step 4: Run, expect PASS**

Run: `python3 scripts/test_article_poll.py`
Expected: `ok`.

- [ ] **Step 5: Skill doc** (`.claude/skills/publish-article/SKILL.md`)

In §2, after the `article.json` bullet's juicy-points sub-bullet, add:

```markdown
  - `poll`: `{q, opts}`, the story's crowd question (site poll under the story + an X poll reply under the X thread). A newcomer must be able to pick in 2 seconds: 2–4 opts ≤25 chars, "Need more data" as the safe last one, no leading wording ("Obviously a balloon?"). Opts freeze once anyone voted. **Show the question to the user before `X_POLLS` posts it.** With a poll, the social caption ends "<q> Vote → link" instead of "Full story: link".
```

In §3, after the "Never post to social…" bullet, add:

```markdown
- The X poll is posted by the cron (`worker/lib/xpoll.ts`), not by `--social`: one per tick, as a reply to the story's head tweet, once `X_POLLS=on` and the head tweet is posted.
```

- [ ] **Step 6: Commit**

```bash
git add scripts/article.py scripts/test_article_poll.py .claude/skills/publish-article/SKILL.md
git commit -m "feat(articles): poll field (validated, opts frozen after votes), Vote CTA on social captions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Rollout (operator steps, the user approves the questions)

**Files:**
- Modify: `showcase/articles/{teardrop-twins,two-stars,into-the-sea,gunship,warp-drives,green-fireballs,area-51}/article.json` (add `poll`)

- [ ] **Step 1: Deploy the code with polls off**

Follow the deploy rules (memory: `realufo-deploy-concurrent-chats`). Deploy from a clean worktree of HEAD and check pending migrations first:

```bash
npx wrangler d1 migrations list realufo-db --remote --env-file /dev/null
```

```bash
npx wrangler d1 migrations apply realufo-db --remote --env-file /dev/null
```

Then build and deploy the way the project normally does (`pnpm build:web` then `npx wrangler deploy`), with `X_POLLS` empty. Push the deployed commit (memory: `feedback-commit-after-work`).

- [ ] **Step 2: Draft the 7 questions and show them to the user**

Read each story's `article.json` `parts` and write one `poll` per story. Starting drafts (the user edits them):

| slug | q | opts |
|---|---|---|
| teardrop-twins | Balloon or craft? | Balloon + payload / Drone / Unknown craft / Need more data |
| two-stars | Star or UAP? | Just a star / Aircraft light / Unknown object / Need more data |
| into-the-sea | Did it really go into the sea? | No, lanterns / Yes, it dove in / Can't tell / Need more data |
| gunship | What did the AC-130 shoot at? | Balloons / Drones / Unknown orbs / Need more data |
| warp-drives | Was $22M on warp drives worth it? | Money well spent / Waste of money / Cover for UFO work / Need more data |
| green-fireballs | Do UFOs watch our nukes? | Yes, they watch / Spy craft (human) / Meteors & myth / Need more data |
| area-51 | What's really at Area 51? | Spy planes only / Alien tech / Both / Need more data |

Every opt must be ≤25 chars. Wait for an explicit OK before Step 3.

- [ ] **Step 3: Site polls live**

```bash
for s in teardrop-twins two-stars into-the-sea gunship warp-drives green-fireballs area-51; do python3 scripts/article.py $s; done
```

Check one: open `https://realufo.org/thread/ar_teardrop-twins` in the browser pane and confirm the card shows, a vote reveals the split, and a second tap clears it. `article.py` already runs IndexNow for each thread URL.

Commit the 7 `article.json` files:

```bash
git add showcase/articles/*/article.json
git commit -m "content(articles): crowd poll questions for the 7 stories

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: User OK → turn on X polls**

Set `"X_POLLS": "on"` in `wrangler.jsonc`, then commit, deploy and push. The cron posts one poll per 3 h tick; the 6 stories with a posted head tweet get theirs within ~18 h (area-51 waits for its Short). To verify the first one without waiting, run one tick by hand:

```bash
curl -s -X POST -H "Authorization: Bearer $ADMIN_TOKEN" https://realufo.org/__tick
```

Check the result:

```bash
npx wrangler d1 execute realufo-db --remote --env-file /dev/null --command "SELECT slug,status,remote_id,error FROM poll_social"
```

Open `https://x.com/i/status/<remote_id>` and confirm the poll sits under the story thread.

- [ ] **Step 5: Update memory**

Update `realufo-project-state` (story polls LIVE, commit/deploy ids, X_POLLS on) and `realufo-articles-lookalikes` (every new article gets a `poll`).
