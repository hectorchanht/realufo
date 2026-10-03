# Shareable Ask Answers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A shared Ask answer becomes a permanent, indexed page (`/ask/123-slug`) with a rich link preview and a one-tap share button, seeded with ~25 real reviewed answers on prod and dev.

**Architecture:** `ask_log` gains an `answer` JSON column written on every ask. The worker serves shared rows at `GET /api/asks/:id` (no AI), pre-renders `/ask/:id` with its own meta/canonical/body, and lists them in the sitemap. The web splits the answer card into a presentational `AskCard` used by both the live `/ask?q=` card and the new `/ask/:id` screen; sharing = `POST /api/ask/:id/public` then the native share sheet / clipboard.

**Tech Stack:** Cloudflare Workers + D1 (TypeScript, vitest-pool-workers), React 18 + react-router + TanStack Query (vitest + Testing Library, jsdom), Python 3 stdlib crawler scripts (pytest).

**Spec:** `docs/superpowers/specs/2026-10-02-realufo-shareable-ask-design.md`

## Global Constraints

- No new dependencies (npm or pip).
- Migration file is `db/migrations/0021_ask_answer.sql`; before starting, `ls db/migrations` — if another chat already took `0021`, use the next free number everywhere this plan says `0021`.
- The worker is the only place that builds an answer URL (`askHref`); web and Python use the `url` the API/sitemap returns.
- `/api/asks/:id`, the `/ask/:id` pre-render and the sitemap entries are **not** gated by `FEATURE_ASK`. `/api/ask` and `/api/ask/recent` keep their existing gate.
- The `/ask` tab (and `/ask?q=`) keeps `robots: noindex`. `/ask/:id` pages have **no** robots tag.
- Do not use `QAPage` structured data.
- Questions and answers are user/AI text: escape in SSR (`esc`), never linkify, never render as HTML in React.
- Disclaimer copy on every answer view: "AI answer drawn from archive text & OCR — can be wrong. Check the sources." (SPA, existing) / "AI answer drawn from the declassified files — it can be wrong. Check the sources." (SSR body).
- Other chats share this checkout: stage only the files your task lists (`git add <paths>`, never `git add -A`). Commit after each task; never push.
- Worker tests: `pnpm test:worker -- <file>`. Web tests: `pnpm test:web -- <file>`. Crawler tests: `cd crawler && python3 -m pytest ingest/tests/<file> -q`.

## Review Focus

1. **iOS Safari loses the tap gesture after the share POST** — `navigator.share` called after an awaited fetch can reject with `NotAllowedError`; expected: fall back to clipboard, and if that fails show the link as selectable text plus a "share link" button that runs on a fresh tap. (Task 6 test: NotAllowedError → clipboard; Task 7 test: "failed" → link shown.)
2. **Question with no Latin letters** (e.g. Chinese, Cyrillic, all emoji) — expected: empty slug, URL `/ask/123`, page loads and canonicalises to `/ask/123`. (Task 1 test; Task 4 test on bare `/ask/<id>`.)
3. **Hostile text in a shared question/answer** (`<script>`, `"`, `$&`) — expected: escaped literally in `<title>`, meta, JSON-LD and body. (Task 4 test.)
4. **Corrupt or partial stored answer JSON** — expected: treated as not found (404), never a 500 or blank card. (Task 3 test.)
5. **Same question shared by several people / with different casing** — expected: each sharer's link works, canonical tag and sitemap point to one URL (earliest row), recent list shows it once. (Tasks 3, 4, 5 tests.)

---

## File Structure

| File | Responsibility |
|---|---|
| `db/migrations/0021_ask_answer.sql` (new) | `answer` column on `ask_log` |
| `worker/lib/ask.ts` | + `askSlug`, `askHref`, `askIdOf` (pure URL helpers) |
| `worker/routes/ask.ts` | `logAsk` stores answer; share returns `url`; `loadSharedAsk` + `getSharedAsk`; recent gains `id/url` |
| `worker/index.ts` | register `GET /api/asks/:id` |
| `worker/lib/ssr.ts` | + `askBody` (plain-HTML answer page body) |
| `worker/lib/pages.ts` | `Page.canonicalPath`; `sharedAskPage` loader + route |
| `worker/lib/meta.ts` | use `page.canonicalPath` for canonical |
| `worker/routes/sitemap.ts` | shared answers in sitemap |
| `web/src/api/types.ts`, `web/src/api/queries.ts` | `SharedAsk`, `AskRecent.id/url`, `useSharedAsk`, `useShareAsk` → `{public,url}` |
| `web/src/lib/shareLink.ts` (new) | `shareLink`, `absUrl`, `xIntent` |
| `web/src/components/AskCard.tsx` (new) | presentational answer card (moved out of `AskAnswer`) |
| `web/src/components/AskAnswer.tsx` | fetch + states + share controls, renders `AskCard` |
| `web/src/screens/AskShared.tsx` (new) | `/ask/:id` screen |
| `web/src/router.tsx` | route `/ask/:id` |
| `web/src/components/AskHistory.tsx` | shared items with `url` are links |
| `web/src/screens/Ask.tsx` | helper copy mentions "share" |
| `crawler/indexnow.py` | submit shared answers changed in the window |
| `crawler/ingest/seed_asks.py` (new), `crawler/ingest/data/ask_seed.json` (new) | seeding script + question list |

---

### Task 1: Answer URL helpers

**Files:**
- Modify: `worker/lib/ask.ts` (append at end)
- Test: `worker/tests/ask-lib.spec.ts`

**Interfaces:**
- Produces: `askSlug(q: string): string`, `askHref(id: number, q: string): string`, `askIdOf(param: string): number | null` — exported from `worker/lib/ask.ts`.

- [ ] **Step 1: Write the failing test** — append to `worker/tests/ask-lib.spec.ts` (and add `askSlug, askHref, askIdOf` to its import from `"../lib/ask"`):

```ts
describe("shared answer URLs", () => {
  it("askSlug lowercases, strips accents and punctuation, joins with hyphens", () => {
    expect(askSlug("What did the 1949 Los Alamos conference conclude?")).toBe("what-did-the-1949-los-alamos-conference-conclude");
    expect(askSlug("Café — Roswell?!")).toBe("cafe-roswell");
    expect(askSlug("  --Tic Tac--  ")).toBe("tic-tac");
  });

  it("askSlug is empty for text with no latin letters or digits", () => {
    expect(askSlug("罗斯威尔事件是什么？")).toBe("");
    expect(askSlug("???")).toBe("");
  });

  it("askSlug cuts at 60 chars without a trailing hyphen", () => {
    const s = askSlug("a ".repeat(40));
    expect(s.length).toBeLessThanOrEqual(60);
    expect(s.endsWith("-")).toBe(false);
    expect(s.startsWith("a-a-")).toBe(true);
  });

  it("askHref appends the slug only when there is one", () => {
    expect(askHref(12, "Roswell?")).toBe("/ask/12-roswell");
    expect(askHref(12, "罗斯威尔")).toBe("/ask/12");
  });

  it("askIdOf reads the leading id and rejects anything else", () => {
    expect(askIdOf("123")).toBe(123);
    expect(askIdOf("123-what-happened")).toBe(123);
    expect(askIdOf("x-123")).toBeNull();
    expect(askIdOf("12abc")).toBeNull();
    expect(askIdOf("0")).toBeNull();
    expect(askIdOf("")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:worker -- worker/tests/ask-lib.spec.ts`
Expected: FAIL — `askSlug is not a function` (or import error).

- [ ] **Step 3: Write minimal implementation** — append to `worker/lib/ask.ts`:

```ts
// Shared answer URLs (Spec 8 §1.4): /ask/123-what-did-radar-see. The worker is
// the only place that builds them; web and crawler use the url it returns.
export const askSlug = (q: string) =>
  q
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 60)
    .replace(/-+$/, "");

export const askHref = (id: number, q: string) => {
  const s = askSlug(q);
  return `/ask/${id}${s ? "-" + s : ""}`;
};

// "123" or "123-anything" → 123; the slug part is never checked (canonical tag fixes it).
export const askIdOf = (param: string) => Number(/^(\d+)(?:-|$)/.exec(param)?.[1]) || null;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:worker -- worker/tests/ask-lib.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add worker/lib/ask.ts worker/tests/ask-lib.spec.ts
git commit -m "feat(ask): shared answer URL helpers"
```

---

### Task 2: Store the answer; share returns its URL

**Files:**
- Create: `db/migrations/0021_ask_answer.sql`
- Modify: `worker/routes/ask.ts` (`ask`, `logAsk`, `setAskPublic`)
- Test: `worker/tests/ask.spec.ts`

**Interfaces:**
- Consumes: `askHref` from Task 1.
- Produces: `ask_log.answer TEXT` holding `JSON.stringify({ answer: string, sources: AskSourceRow[] })`; `POST /api/ask/:id/public` → `{ public: boolean, url: string }`.

- [ ] **Step 1: Write the failing tests** — in `worker/tests/ask.spec.ts`:

Add to imports: `import { saltedHash } from "../lib/anon";`

Inside `describe("ask_log", …)` add:

```ts
  it("stores the answer and its sources (no hub links) on fresh, cached and not-covered asks", async () => {
    matches = [hit("FBI-UAP-D002", 1)];
    await ask("What did the FBI report?");
    await ask("what did the fbi report?");
    matches = [];
    await ask("who built the pyramids?");
    const rows = (await env.DB.prepare("SELECT answer FROM ask_log ORDER BY id").all<{ answer: string }>()).results.map((r) =>
      JSON.parse(r.answer)
    );
    expect(rows[0].answer).toBe("Radar tracked it [1].");
    expect(rows[0].sources).toEqual([expect.objectContaining({ n: 1, record_id: "FBI-UAP-D002", page: 1 })]);
    expect(rows[0].sources[0].hubs).toBeUndefined();
    expect(rows[1]).toEqual(rows[0]); // cache hit stores the same frozen answer
    expect(rows[2]).toEqual({ answer: NOT_COVERED, sources: [] });
  });
```

In `describe("POST /api/ask/:id/public", …)` replace the first test's two `toEqual` lines:

```ts
    expect(await body(await share(log_id, true))).toEqual({ public: true, url: `/ask/${log_id}-what-did-radar-see` });
    expect((await env.DB.prepare("SELECT public FROM ask_log WHERE id=?").bind(log_id).first())!.public).toBe(1);
    expect(await body(await share(log_id, false))).toEqual({ public: false, url: `/ask/${log_id}-what-did-radar-see` });
```

and add:

```ts
  it("rows logged before answers were stored (answer NULL) cannot be shared", async () => {
    const actor = await saltedHash("asker", env.ANON_SALT);
    const row = await env.DB.prepare("INSERT INTO ask_log(question,actor_id,sources) VALUES('old question',?,2) RETURNING id")
      .bind(actor)
      .first<{ id: number }>();
    expect((await share(row!.id, true)).status).toBe(404);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:worker -- worker/tests/ask.spec.ts`
Expected: FAIL — `no such column: answer` / `url` missing from share response.

- [ ] **Step 3: Write the migration** — `db/migrations/0021_ask_answer.sql`:

```sql
-- Frozen answer for shared pages (Spec 8): JSON {answer, sources}, written on
-- every ask. NULL on rows logged before this column; those never get a page.
ALTER TABLE ask_log ADD COLUMN answer TEXT;
```

- [ ] **Step 4: Store the answer** — in `worker/routes/ask.ts`:

Add `askHref` to the import list from `"../lib/ask"`.

Replace `logAsk`:

```ts
async function logAsk(env: Env, req: Request, q: string, data: { answer: string; sources: unknown[] }, cached: boolean) {
  // Frozen copy for shared pages; hub links are never stored (they follow the live hub list).
  const frozen = JSON.stringify({ answer: data.answer, sources: data.sources });
  const row = await env.DB.prepare("INSERT INTO ask_log(question,actor_id,sources,cached,answer) VALUES(?,?,?,?,?) RETURNING id")
    .bind(q, await actorId(req, env.ANON_SALT), data.sources.length, cached ? 1 : 0, frozen)
    .first<{ id: number }>();
  return row?.id ?? null;
}
```

In `ask()`, change the cache-hit log call to:

```ts
    const log_id = (await allowWrite(env, req, "ask_hit"))
      ? await logAsk(env, req, q, { answer: b.answer, sources: b.sources ?? [] }, true)
      : null;
```

and the fresh-path call to:

```ts
    log_id: await logAsk(env, req, q, body, false),
```

- [ ] **Step 5: Share requires an answer and returns the URL** — replace the UPDATE and response in `setAskPublic`:

```ts
  const r = await env.DB.prepare(
    "UPDATE ask_log SET public=? WHERE id=? AND actor_id=? AND sources>0 AND answer IS NOT NULL RETURNING id, question"
  )
    .bind(b.public ? 1 : 0, Number(params.id) || 0, actor)
    .first<{ id: number; question: string }>();
  if (!r) return error(404, "not found");
  return json({ public: b.public, url: askHref(r.id, r.question) });
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm test:worker -- worker/tests/ask.spec.ts worker/tests/schema.spec.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add db/migrations/0021_ask_answer.sql worker/routes/ask.ts worker/tests/ask.spec.ts
git commit -m "feat(ask): store answers in ask_log; share returns the answer URL"
```

---

### Task 3: `GET /api/asks/:id` and recent list links

**Files:**
- Modify: `worker/routes/ask.ts` (add `SharedAsk`, `loadSharedAsk`, `getSharedAsk`; rewrite `recentAsks` query)
- Modify: `worker/index.ts`
- Test: `worker/tests/ask.spec.ts`

**Interfaces:**
- Consumes: `askHref`, `askIdOf` (Task 1); `ask_log.answer` (Task 2).
- Produces:
  ```ts
  export type SharedAskSource = { n: number; record_id: string; title: string; page: number; kind: string; thumb: string | null };
  export type SharedAsk = { id: number; question: string; answer: string; sources: SharedAskSource[]; asked_at: string; url: string };
  export async function loadSharedAsk(env: Env, id: number | null): Promise<SharedAsk | null>;
  ```
  `GET /api/asks/:id` → `SharedAsk` with `sources[i].hubs` added; `GET /api/ask/recent` items → `{ id, question, sources, asked_at, url: string | null }`.

- [ ] **Step 1: Write the failing tests** — append to `worker/tests/ask.spec.ts`:

```ts
const sharedAsk = (id: string, extra: Record<string, unknown> = {}) =>
  worker.fetch(new Request(`https://x/api/asks/${id}`), { ...env, FEATURE_ASK: "on", AI, VECTORIZE, ...extra } as any, {} as any);

describe("GET /api/asks/:id", () => {
  const frozen = JSON.stringify({
    answer: "Radar tracked it [1].",
    sources: [{ n: 1, record_id: "FBI-UAP-D002", title: "FBI file", page: 1, kind: "pdf", thumb: null }],
  });
  const put = (question: string, pub: number, answer: string | null) =>
    env.DB.prepare("INSERT INTO ask_log(question,actor_id,sources,public,answer) VALUES(?,'a',1,?,?) RETURNING id")
      .bind(question, pub, answer)
      .first<{ id: number }>();

  it("returns a shared answer with live hub links and its URL, without AI calls", async () => {
    const row = await put("What did the FBI report?", 1, frozen);
    aiCalls = [];
    const r = await sharedAsk(`${row!.id}-what-did-the-fbi-report`);
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("public, max-age=300");
    const b = await body(r);
    expect(b).toMatchObject({ id: row!.id, question: "What did the FBI report?", answer: "Radar tracked it [1].", url: `/ask/${row!.id}-what-did-the-fbi-report` });
    expect(typeof b.asked_at).toBe("string");
    expect(b.sources[0]).toMatchObject({ record_id: "FBI-UAP-D002", hubs: { agency: "fbi" } });
    expect(aiCalls).toEqual([]);
  });

  it("404s for private, unanswered, corrupt, unknown and non-numeric ids", async () => {
    const priv = await put("private one", 0, frozen);
    const old = await put("old one", 1, null);
    const bad = await put("corrupt one", 1, "{not json");
    for (const id of [String(priv!.id), String(old!.id), String(bad!.id), "999999", "abc", "x-1"])
      expect((await sharedAsk(id)).status).toBe(404);
  });

  it("still serves shared answers when FEATURE_ASK is off", async () => {
    const row = await put("flag off question", 1, frozen);
    expect((await sharedAsk(String(row!.id), { FEATURE_ASK: "off" })).status).toBe(200);
  });
});
```

Inside `describe("GET /api/ask/recent", …)` change the `put` helper and add a test:

```ts
  const put = (question: string, pub: number, sources = 1, answer: string | null = null) =>
    env.DB.prepare("INSERT INTO ask_log(question,actor_id,sources,public,answer) VALUES(?,'a',?,?,?)").bind(question, sources, pub, answer);

  it("each entry links the earliest answered public row of its question; unanswered rows get no url", async () => {
    const a = JSON.stringify({ answer: "x [1]", sources: [] });
    await env.DB.batch([
      put("Gimbal video?", 1, 1, a),
      put("gimbal video?", 1, 1, a),
      put("Old question", 1, 1, null),
    ]);
    const ids = (await env.DB.prepare("SELECT id FROM ask_log ORDER BY id").all<{ id: number }>()).results.map((r) => r.id);
    const b = await body(await recent());
    expect(b.recent).toEqual([
      expect.objectContaining({ id: ids[2], question: "Old question", url: null }),
      expect.objectContaining({ id: ids[0], question: "Gimbal video?", url: `/ask/${ids[0]}-gimbal-video` }),
    ]);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:worker -- worker/tests/ask.spec.ts`
Expected: FAIL — `/api/asks/:id` returns 404 for everything; recent items lack `id`/`url`.

- [ ] **Step 3: Implement `loadSharedAsk` and `getSharedAsk`** — in `worker/routes/ask.ts`, add `askIdOf` to the `"../lib/ask"` import, then append:

```ts
export type SharedAskSource = { n: number; record_id: string; title: string; page: number; kind: string; thumb: string | null };
export type SharedAsk = { id: number; question: string; answer: string; sources: SharedAskSource[]; asked_at: string; url: string };

// A shared answer exactly as frozen in ask_log (Spec 8 §1.5). Private rows, rows
// from before answers were stored, and unreadable JSON are all "not found".
export async function loadSharedAsk(env: Env, id: number | null): Promise<SharedAsk | null> {
  if (!id) return null;
  const row = await env.DB.prepare("SELECT id, question, answer, created_at FROM ask_log WHERE id=? AND public=1 AND answer IS NOT NULL")
    .bind(id)
    .first<{ id: number; question: string; answer: string; created_at: string }>();
  if (!row) return null;
  try {
    const a = JSON.parse(row.answer);
    if (typeof a?.answer !== "string" || !Array.isArray(a.sources)) return null;
    return { id: row.id, question: row.question, answer: a.answer, sources: a.sources, asked_at: row.created_at, url: askHref(row.id, row.question) };
  } catch {
    return null;
  }
}

// GET /api/asks/:id — free (no AI, no rate row) and not behind FEATURE_ASK:
// indexed pages must not vanish when new asks are paused.
export async function getSharedAsk(req: Request, env: Env, params: Record<string, string>) {
  const a = await loadSharedAsk(env, askIdOf(params.id));
  if (!a) return error(404, "not found");
  return json({ ...a, sources: await withHubs(env, req, a.sources) }, { headers: { "cache-control": "public, max-age=300" } });
}
```

- [ ] **Step 4: Rewrite `recentAsks`** — replace its query and return:

```ts
  // One entry per question, newest share first, pointing at the question's
  // canonical row: the earliest public row with a stored answer (else the newest).
  const rows = await env.DB.prepare(
    `SELECT a.id, a.question, a.sources, a.created_at asked_at, a.answer IS NOT NULL has_answer
     FROM (SELECT max(id) last, COALESCE(min(CASE WHEN answer IS NOT NULL THEN id END), max(id)) pick
           FROM ask_log WHERE public=1 GROUP BY lower(question)) g
     JOIN ask_log a ON a.id = g.pick
     ORDER BY g.last DESC LIMIT 20`
  ).all<{ id: number; question: string; sources: number; asked_at: string; has_answer: number }>();
  return json({
    recent: rows.results.map(({ has_answer, ...r }) => ({ ...r, url: has_answer ? askHref(r.id, r.question) : null })),
  });
```

- [ ] **Step 5: Register the route** — in `worker/index.ts` change the import to
`import { ask, recentAsks, setAskPublic, getSharedAsk } from "./routes/ask";` and add after the `/api/ask/:id/public` line:

```ts
on("GET", "/api/asks/:id", getSharedAsk);
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm test:worker -- worker/tests/ask.spec.ts`
Expected: PASS (including the pre-existing recent-list tests).

- [ ] **Step 7: Commit**

```bash
git add worker/routes/ask.ts worker/index.ts worker/tests/ask.spec.ts
git commit -m "feat(ask): GET /api/asks/:id serves frozen shared answers; recent list links them"
```

---

### Task 4: Pre-render `/ask/:id`

**Files:**
- Modify: `worker/lib/ssr.ts` (add `askBody` after `caseBody`)
- Modify: `worker/lib/pages.ts` (`Page.canonicalPath`, `sharedAskPage`, ROUTES)
- Modify: `worker/lib/meta.ts` (`serveWithMeta` canonical)
- Test: `worker/tests/meta.spec.ts`

**Interfaces:**
- Consumes: `loadSharedAsk`, `SharedAsk` (Task 3); `askHref`, `askIdOf` (Task 1).
- Produces: `export function askBody(x: { question: string; answer: string; sources: { n: number; record_id: string; title: string; page: number; kind: string }[] }): string` in `ssr.ts`; `Page` gains `canonicalPath?: string`.

- [ ] **Step 1: Write the failing tests** — append to `worker/tests/meta.spec.ts`:

```ts
describe("shared Ask answer pages", () => {
  const fakeEnv = () => ({ ...env, FEATURE_ASK: "off", ASSETS: { fetch: async () => new Response("<html><head><!--META--></head><body><div id=\"root\"></div></body></html>") } }) as any;
  const get = async (path: string) => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("https://x" + path, { headers: { accept: "text/html" } }), fakeEnv(), ctx);
    await waitOnExecutionContext(ctx);
    return { status: res.status, html: await res.text() };
  };
  const ld = (html: string) => JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1]);
  const frozen = (answer: string) =>
    JSON.stringify({
      answer,
      sources: [
        { n: 1, record_id: "CIA-UAP-017", title: "Harare airport report", page: 2, kind: "pdf", thumb: null },
        { n: 2, record_id: "CIA-UAP-017", title: "Harare airport report", page: 5, kind: "pdf", thumb: "https://cdn/t.jpg" },
      ],
    });
  const put = (id: number, question: string, pub: number, answer: string | null) =>
    env.DB.prepare("INSERT INTO ask_log(id,question,actor_id,sources,public,answer,created_at) VALUES(?,?,'a',2,?,?,'2026-10-02 08:00:00')").bind(
      id, question, pub, answer
    );

  beforeAll(async () => {
    await env.DB.batch([
      put(9101, "What did radar see at Harare?", 1, frozen("Radar tracked it [1] and pilots saw lights [2].")),
      put(9102, "what did radar see at harare?", 1, frozen("Later answer [1].")),
      put(9103, "Private question", 0, frozen("x [1]")),
      put(9104, "罗斯威尔事件是什么？", 1, frozen("Roswell [1].")),
      put(9105, 'Bad <script>alert(1)</script> "q" $& here?', 1, frozen("Has <b>tags</b> and $& [1].")),
    ]);
  });

  it("indexed page: question title, answer description, source thumb, canonical, body", async () => {
    const { status, html } = await get("/ask/9101-what-did-radar-see-at-harare");
    expect(status).toBe(200);
    expect(html).toContain("<title>What did radar see at Harare? · RealUFO</title>");
    expect(html).toContain('content="AI answer from 1 declassified UAP file: Radar tracked it and pilots saw lights."');
    expect(html).toContain('property="og:image" content="https://cdn/t.jpg"');
    expect(html).not.toContain('name="robots"');
    expect(html).toContain('rel="canonical" href="https://x/ask/9101-what-did-radar-see-at-harare"');
    expect(html).toContain("<h1>What did radar see at Harare?</h1>");
    expect(html).toContain('<a href="/doc/CIA-UAP-017">[1]</a>');
    expect(html).toContain("it can be wrong");
    expect(html).toContain('<a href="/ask">Ask the archive your own question →</a>');
  });

  it("JSON-LD is a WebPage citing each source file once, with breadcrumbs", async () => {
    const { html } = await get("/ask/9101");
    const page = ld(html);
    expect(page["@type"]).toBe("WebPage");
    expect(page.name).toBe("What did radar see at Harare?");
    expect(page.datePublished).toBe("2026-10-02T08:00:00Z");
    expect(page.citation).toEqual([{ "@type": "CreativeWork", name: "Harare airport report", url: "https://x/doc/CIA-UAP-017" }]);
    expect(html).toContain('"@type":"BreadcrumbList"');
    expect(html).not.toContain("QAPage");
  });

  it("a wrong slug and a later duplicate share both canonicalise to the earliest row", async () => {
    expect((await get("/ask/9101-wrong-slug")).html).toContain('rel="canonical" href="https://x/ask/9101-what-did-radar-see-at-harare"');
    const dup = await get("/ask/9102-what-did-radar-see-at-harare");
    expect(dup.html).toContain("<h1>what did radar see at harare?</h1>"); // the duplicate shows its own frozen answer
    expect(dup.html).toContain('rel="canonical" href="https://x/ask/9101-what-did-radar-see-at-harare"');
  });

  it("question with no latin letters lives at /ask/<id>", async () => {
    const { status, html } = await get("/ask/9104");
    expect(status).toBe(200);
    expect(html).toContain('rel="canonical" href="https://x/ask/9104"');
  });

  it("hostile question and answer text is escaped everywhere", async () => {
    const { html } = await get("/ask/9105");
    expect(html).not.toContain("<script>alert(1)");
    expect(html).not.toContain("<b>tags</b>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &quot;q&quot; $&amp; here?");
    expect(html).toContain("$&amp; ");
  });

  it("private, unknown and non-numeric ids are 404 + noindex", async () => {
    for (const p of ["/ask/9103", "/ask/9199", "/ask/abc"]) {
      const { status, html } = await get(p);
      expect(status).toBe(404);
      expect(html).toContain('<meta name="robots" content="noindex">');
    }
  });

  it("the /ask tab itself stays noindex", async () => {
    expect((await get("/ask")).html).toContain('<meta name="robots" content="noindex">');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:worker -- worker/tests/meta.spec.ts`
Expected: FAIL — `/ask/9101-…` is a 404 (no route).

- [ ] **Step 3: `askBody`** — in `worker/lib/ssr.ts`, after `caseBody`:

```ts
// Shared Ask answer page (Spec 8 §2.4). [n] links to source n's file; an [n]
// with no source stays plain text.
export function askBody(x: {
  question: string;
  answer: string;
  sources: { n: number; record_id: string; title: string; page: number; kind: string }[];
}): string {
  const byN = new Map(x.sources.map((s) => [s.n, s]));
  const answer = x.answer
    .split(/(\[\d+\])/)
    .map((p) => {
      const s = /^\[\d+\]$/.test(p) ? byN.get(Number(p.slice(1, -1))) : undefined;
      return s ? a({ href: docHref(s.record_id), text: p }) : esc(p);
    })
    .join("");
  const sources = x.sources
    .map((s) => `<li>${a({ href: docHref(s.record_id), text: docTitle(s.title, s.record_id, s.kind) })}${s.kind === "pdf" && s.page > 0 ? ` — p. ${s.page}` : ""}</li>`)
    .join("");
  return [
    `<h1>${esc(x.question)}</h1>`,
    "<p>AI answer drawn from the declassified files — it can be wrong. Check the sources.</p>",
    `<p>${answer}</p>`,
    sources ? `<section><h2>Sources</h2><ol>${sources}</ol></section>` : "",
    `<p>${a({ href: "/ask", text: "Ask the archive your own question →" })}</p>`,
  ].join("");
}
```

(`a`, `esc`, `docHref`, `docTitle` are already defined in `ssr.ts`; `docTitle` is exported from it — confirm with `grep -n "export function docTitle\|export const docTitle" worker/lib/ssr.ts`.)

- [ ] **Step 4: Canonical override** — in `worker/lib/pages.ts` change the `Page` type to:

```ts
// canonicalPath: overrides the request path as the canonical URL (a shared
// answer's duplicates point at the earliest copy).
export type Page = { meta: Omit<MetaInput, "url">; body: string; footer?: Link[]; canonicalPath?: string };
```

In `worker/lib/meta.ts` `serveWithMeta`, replace `const canonical = url.origin + url.pathname;` with:

```ts
      const canonical = url.origin + (page.canonicalPath ?? url.pathname);
```

- [ ] **Step 5: Loader + route** — in `worker/lib/pages.ts`:

Add `askBody` to the import list from `"./ssr"`, and add imports:

```ts
import { loadSharedAsk } from "../routes/ask";
import { askHref, askIdOf } from "./ask";
```

Add after `askPage`:

```ts
// A shared Ask answer (Spec 8 §2): indexed, unlike the /ask tab. Duplicate
// shares of one question canonicalise to the earliest public copy.
const sharedAskPage: Loader = async (env, g, url) => {
  const x = await loadSharedAsk(env, askIdOf(g.id));
  if (!x) return null;
  const first = await env.DB.prepare(
    "SELECT min(id) id, question FROM ask_log WHERE public=1 AND answer IS NOT NULL AND lower(question)=lower(?)"
  )
    .bind(x.question)
    .first<{ id: number | null; question: string }>();
  const canonicalPath = first?.id ? askHref(first.id, first.question) : x.url;
  const files = [...new Map(x.sources.map((s) => [s.record_id, s])).values()];
  const n = files.length;
  return {
    meta: {
      title: x.question,
      description: `AI answer from ${n} declassified UAP ${n === 1 ? "file" : "files"}: ${x.answer.replace(/\s*\[\d+\]/g, "")}`,
      image: x.sources.find((s) => s.thumb)?.thumb ?? null,
      type: "article",
      jsonLd: {
        "@type": "WebPage",
        name: x.question,
        datePublished: iso(x.asked_at),
        citation: files.map((s) => ({ "@type": "CreativeWork", name: s.title, url: url.origin + docHref(s.record_id) })),
      },
      breadcrumbs: [
        { name: "Home", href: "/" },
        { name: "Ask the Archive", href: "/ask" },
        { name: x.question, href: canonicalPath },
      ],
    },
    body: askBody(x),
    canonicalPath,
  };
};
```

Add to `ROUTES`, right after the `/ask` entry:

```ts
  { pattern: new URLPattern({ pathname: "/ask/:id" }), load: sharedAskPage },
```

ponytail note to add above the `first` query: `// ponytail: lower(question) scans ask_log; add an expression index ON ask_log(lower(question)) WHERE public=1 if it grows large.`

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm test:worker -- worker/tests/meta.spec.ts`
Expected: PASS (all pre-existing meta tests too).

- [ ] **Step 7: Commit**

```bash
git add worker/lib/ssr.ts worker/lib/pages.ts worker/lib/meta.ts worker/tests/meta.spec.ts
git commit -m "feat(seo): pre-render shared Ask answers at /ask/:id (indexed, canonical to first share)"
```

---

### Task 5: Shared answers in the sitemap

**Files:**
- Modify: `worker/routes/sitemap.ts`
- Test: `worker/tests/sitemap.spec.ts`

**Interfaces:**
- Consumes: `askHref` (Task 1); `ask_log.answer` (Task 2).

- [ ] **Step 1: Write the failing test** — append inside `describe("sitemap", …)` in `worker/tests/sitemap.spec.ts`:

```ts
  it("lists one URL per distinct shared question (earliest row), skipping private and unanswered rows", async () => {
    const a = JSON.stringify({ answer: "x [1]", sources: [] });
    await env.DB.batch([
      env.DB.prepare("INSERT INTO ask_log(id,question,actor_id,public,answer,created_at) VALUES(9201,'Gimbal video?','a',1,?,'2026-09-30 10:00:00')").bind(a),
      env.DB.prepare("INSERT INTO ask_log(id,question,actor_id,public,answer) VALUES(9202,'gimbal video?','a',1,?)").bind(a),
      env.DB.prepare("INSERT INTO ask_log(id,question,actor_id,public,answer) VALUES(9203,'Private one','a',0,?)").bind(a),
      env.DB.prepare("INSERT INTO ask_log(id,question,actor_id,public) VALUES(9204,'Old shared one','a',1)"),
    ]);
    const xml = await (await worker.fetch(new Request("https://realufo.org/sitemap.xml"), { ...env, FEATURE_ASK: "off" } as any, {} as any)).text();
    expect(xml).toContain("<url><loc>https://realufo.org/ask/9201-gimbal-video</loc><lastmod>2026-09-30</lastmod></url>");
    expect(xml).not.toContain("/ask/9202");
    expect(xml).not.toContain("/ask/9203");
    expect(xml).not.toContain("/ask/9204");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:worker -- worker/tests/sitemap.spec.ts`
Expected: FAIL — no `/ask/9201` in the sitemap.

- [ ] **Step 3: Implement** — in `worker/routes/sitemap.ts`:

Add `import { askHref } from "../lib/ask";`.

Extend the `Promise.all` destructuring to `const [records, threads, boards, cases, hubs, asks] = await Promise.all([` and add as the last entry:

```ts
    // Shared Ask answers: one URL per question, its earliest public copy (same rule as the page's canonical).
    env.DB.prepare(
      "SELECT min(id) id, question, date(min(created_at)) d FROM ask_log WHERE public=1 AND answer IS NOT NULL GROUP BY lower(question)",
    ).all<{ id: number; question: string; d: string }>(),
```

Add to `urls` after the hubs line:

```ts
    ...asks.results.map((x) => loc(askHref(x.id, x.question), x.d)), // slug is [a-z0-9-] only
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:worker -- worker/tests/sitemap.spec.ts`
Expected: PASS

- [ ] **Step 5: Run the whole worker suite**

Run: `pnpm test:worker`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add worker/routes/sitemap.ts worker/tests/sitemap.spec.ts
git commit -m "feat(seo): shared Ask answers in sitemap.xml"
```

---

### Task 6: Web API types, queries and `shareLink`

**Files:**
- Modify: `web/src/api/types.ts`, `web/src/api/queries.ts`
- Create: `web/src/lib/shareLink.ts`
- Test: `web/src/tests/shareLink.test.ts` (new)

**Interfaces:**
- Produces:
  ```ts
  // types.ts
  export interface AskRecent { id: number; question: string; sources: number; asked_at: string; url: string | null }
  export interface SharedAsk { id: number; question: string; answer: string; sources: AskSource[]; asked_at: string; url: string }
  // queries.ts
  export function useSharedAsk(id: number | null): UseQueryResult<SharedAsk>
  export function useShareAsk(): UseMutationResult<{ public: boolean; url: string }, unknown, { id: number; public: boolean }>
  // lib/shareLink.ts
  export type ShareResult = "shared" | "copied" | "cancelled" | "failed";
  export const absUrl: (url: string) => string;
  export async function shareLink(title: string, url: string): Promise<ShareResult>;
  export const xIntent: (title: string, url: string) => string;
  export const askIdOf: (param: string) => number | null; // same rule as the worker's
  ```

- [ ] **Step 1: Write the failing test** — `web/src/tests/shareLink.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { shareLink, absUrl, xIntent, askIdOf } from "../lib/shareLink";

afterEach(() => vi.unstubAllGlobals());

describe("shareLink", () => {
  it("uses the native share sheet with an absolute URL when available", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share, clipboard: { writeText: vi.fn() } });
    expect(await shareLink("Q?", "/ask/7-q")).toBe("shared");
    expect(share).toHaveBeenCalledWith({ title: "Q?", url: absUrl("/ask/7-q") });
    expect(absUrl("/ask/7-q")).toMatch(/^https?:\/\/[^/]+\/ask\/7-q$/);
  });

  it("user closing the share sheet is 'cancelled', no clipboard write", async () => {
    const writeText = vi.fn();
    vi.stubGlobal("navigator", { share: vi.fn().mockRejectedValue(Object.assign(new Error("x"), { name: "AbortError" })), clipboard: { writeText } });
    expect(await shareLink("Q?", "/ask/7-q")).toBe("cancelled");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("share rejected without a gesture (iOS NotAllowedError) falls back to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share: vi.fn().mockRejectedValue(Object.assign(new Error("x"), { name: "NotAllowedError" })), clipboard: { writeText } });
    expect(await shareLink("Q?", "/ask/7-q")).toBe("copied");
    expect(writeText).toHaveBeenCalledWith(absUrl("/ask/7-q"));
  });

  it("no share API: copies; no clipboard either: failed", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    expect(await shareLink("Q?", "/ask/7-q")).toBe("copied");
    vi.stubGlobal("navigator", {});
    expect(await shareLink("Q?", "/ask/7-q")).toBe("failed");
  });

  it("xIntent encodes the question and absolute URL", () => {
    const u = new URL(xIntent("Tic Tac & Gimbal?", "/ask/7-q"));
    expect(u.origin + u.pathname).toBe("https://x.com/intent/post");
    expect(u.searchParams.get("text")).toBe("Tic Tac & Gimbal?");
    expect(u.searchParams.get("url")).toBe(absUrl("/ask/7-q"));
  });

  it("askIdOf matches the worker rule", () => {
    expect(askIdOf("12-what")).toBe(12);
    expect(askIdOf("12")).toBe(12);
    expect(askIdOf("x-12")).toBeNull();
    expect(askIdOf("0")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:web -- src/tests/shareLink.test.ts`
Expected: FAIL — cannot resolve `../lib/shareLink`.

- [ ] **Step 3: Implement** — `web/src/lib/shareLink.ts`:

```ts
// Sharing a link (Spec 8 §3.3): the phone's share sheet when there is one,
// else the clipboard. iOS rejects navigator.share with NotAllowedError when the
// tap gesture was spent on an await before it — fall back to copying then.
export type ShareResult = "shared" | "copied" | "cancelled" | "failed";

export const absUrl = (url: string) => new URL(url, location.origin).href;

export async function shareLink(title: string, url: string): Promise<ShareResult> {
  const abs = absUrl(url);
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title, url: abs });
      return "shared";
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return "cancelled";
    }
  }
  try {
    await navigator.clipboard.writeText(abs);
    return "copied";
  } catch {
    return "failed";
  }
}

export const xIntent = (title: string, url: string) =>
  `https://x.com/intent/post?text=${encodeURIComponent(title)}&url=${encodeURIComponent(absUrl(url))}`;

// "/ask/123-slug" param → 123. Same rule as worker/lib/ask.ts askIdOf.
export const askIdOf = (param: string) => Number(/^(\d+)(?:-|$)/.exec(param)?.[1]) || null;
```

- [ ] **Step 4: Types** — in `web/src/api/types.ts` replace the `AskRecent` interface and add `SharedAsk`:

```ts
/** GET /api/ask/recent — questions their askers shared, newest first. */
export interface AskRecent {
  id: number;
  question: string;
  sources: number;
  asked_at: string;
  /** The shared answer's page; null for rows shared before answers were stored. */
  url: string | null;
}
/** GET /api/asks/:id — a shared answer, frozen when it was asked (Spec 8). */
export interface SharedAsk {
  id: number;
  question: string;
  answer: string;
  sources: AskSource[];
  asked_at: string;
  url: string;
}
```

- [ ] **Step 5: Queries** — in `web/src/api/queries.ts`:

Add `SharedAsk` to the type import list. Add to `qk`: `sharedAsk: (id: number) => ["sharedAsk", id] as const,`.

After `useAskRecent`, add:

```ts
// A shared answer never changes and costs nothing to fetch.
export function useSharedAsk(id: number | null) {
  return useQuery({
    queryKey: qk.sharedAsk(id ?? 0),
    queryFn: () => api.get<SharedAsk>(`/api/asks/${id}`),
    enabled: id != null,
    staleTime: 5 * 60_000,
    retry: false,
  });
}
```

Change `useShareAsk`'s comment and `mutationFn` generic:

```ts
// The asker shares (or unshares) their own answered question; the reply carries its page URL.
export function useShareAsk() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: number; public: boolean }) =>
      api.post<{ public: boolean; url: string }>(`/api/ask/${vars.id}/public`, { public: vars.public }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: qk.askRecent }),
  });
}
```

- [ ] **Step 6: Run tests + typecheck**

Run: `pnpm test:web -- src/tests/shareLink.test.ts && pnpm -C web exec tsc -b`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/shareLink.ts web/src/tests/shareLink.test.ts web/src/api/types.ts web/src/api/queries.ts
git commit -m "feat(web): shareLink helper, SharedAsk types and queries"
```

---

### Task 7: `AskCard` split + share button on live answers

**Files:**
- Create: `web/src/components/AskCard.tsx`
- Modify: `web/src/components/AskAnswer.tsx`, `web/src/screens/Ask.tsx` (helper copy)
- Test: `web/src/tests/ask.test.tsx`

**Interfaces:**
- Consumes: `useShareAsk` → `{ public, url }`, `shareLink`, `absUrl`, `xIntent`, `ShareResult` (Task 6).
- Produces:
  ```ts
  export const CARD: string;   // card container classes
  export const ACTION: string; // footer action button classes
  export function AskCard(props: { question: string; data: { answer: string; sources: AskSource[] }; footer?: ReactNode }): JSX.Element;
  export function ShareNote({ result, url }: { result: ShareResult | null; url: string }): JSX.Element | null;
  ```
  all from `web/src/components/AskCard.tsx`.

- [ ] **Step 1: Write the failing tests** — in `web/src/tests/ask.test.tsx`:

Add near the top (after the `vi.mock("../api/queries", …)` block):

```ts
const shareLinkMock = vi.fn();
vi.mock("../lib/shareLink", async (orig) => ({
  ...(await orig<typeof import("../lib/shareLink")>()),
  shareLink: (t: string, u: string) => shareLinkMock(t, u),
}));
```

and add `shareLinkMock.mockReset();` to the top-level `beforeEach`.

Replace the test `"share publicly sends this ask's log id and flips to undo; hidden without log id or sources"` with:

```ts
  it("share publishes the answer, opens the share sheet, then offers share link / X / undo", async () => {
    shareLinkMock.mockResolvedValue("copied");
    useAskMock.mockReturnValue({ ...answered, data: { ...answered.data, log_id: 7 } });
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "share" }));
    expect(shareMutate).toHaveBeenCalledWith({ id: 7, public: true }, expect.anything());
    await act(() => shareMutate.mock.calls[0][1].onSuccess({ public: true, url: "/ask/7-what-did-radar-see" }));
    expect(shareLinkMock).toHaveBeenCalledWith("what did radar see?", "/ask/7-what-did-radar-see");
    expect(screen.getByText("✓ shared")).toBeInTheDocument();
    expect(screen.getByText("link copied")).toBeInTheDocument();
    const x = screen.getByRole("link", { name: "post on X" });
    expect(x.getAttribute("href")).toContain("https://x.com/intent/post?text=what%20did%20radar%20see%3F&url=");
    expect(x).toHaveAttribute("target", "_blank");

    fireEvent.click(screen.getByRole("button", { name: "share link" }));
    expect(shareLinkMock).toHaveBeenLastCalledWith("what did radar see?", "/ask/7-what-did-radar-see");

    fireEvent.click(screen.getByRole("button", { name: "undo" }));
    expect(shareMutate).toHaveBeenLastCalledWith({ id: 7, public: false }, expect.anything());
    act(() => shareMutate.mock.calls.at(-1)![1].onSuccess({ public: false, url: "/ask/7-what-did-radar-see" }));
    expect(screen.getByRole("button", { name: "share" })).toBeInTheDocument();
  });

  it("when neither share sheet nor clipboard works, the link is shown to copy by hand", async () => {
    shareLinkMock.mockResolvedValue("failed");
    useAskMock.mockReturnValue({ ...answered, data: { ...answered.data, log_id: 7 } });
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "share" }));
    await act(() => shareMutate.mock.calls[0][1].onSuccess({ public: true, url: "/ask/7-what-did-radar-see" }));
    expect(screen.getByDisplayValue(/^https?:\/\/[^/]+\/ask\/7-what-did-radar-see$/)).toBeInTheDocument();
  });

  it("a failed share POST says so and keeps the share button", () => {
    useAskMock.mockReturnValue({ ...answered, data: { ...answered.data, log_id: 7 } });
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "share" }));
    act(() => shareMutate.mock.calls[0][1].onError(new Error("429")));
    expect(screen.getByText("couldn't share — try again")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "share" })).toBeInTheDocument();
    expect(shareLinkMock).not.toHaveBeenCalled();
  });

  it("no share button without a log id or without sources", () => {
    useAskMock.mockReturnValue({ ...answered, data: { ...answered.data, log_id: null } });
    const { rerender } = renderCard();
    expect(screen.queryByRole("button", { name: "share" })).toBeNull();
    useAskMock.mockReturnValue({ ...answered, data: { ...answered.data, log_id: 7, sources: [] } });
    rerender(<MemoryRouter><AskAnswer question="q2?" /></MemoryRouter>);
    expect(screen.queryByRole("button", { name: "share" })).toBeNull();
  });
```

Change the Ask-screen copy test to:

```ts
  it("tells the asker questions are logged and become public pages only when shared", async () => {
    renderAppAt("/ask");
    expect(await screen.findByText(/Questions are logged\. Tap “share” on an answer to publish it as a public page/)).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:web -- src/tests/ask.test.tsx`
Expected: FAIL — no button named "share" (still "share publicly"); copy text mismatch.

- [ ] **Step 3: Create `AskCard.tsx`** — move the presentational parts out of `AskAnswer.tsx` unchanged (`srcTitle`, `CARD`, `CHIP_KINDS`, `HubChips`, the `flash`/`cite` logic, the answer `<p>`, the sources `<ol>`, the disclaimer) into `web/src/components/AskCard.tsx`:

```tsx
// "Ask the Archive" answer card (Spec 3 §4.4), shared by the live answer
// (AskAnswer) and a shared answer's page (AskShared). Answer is plain text;
// each [n] becomes a button that scrolls to + flashes source n.
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useHubs } from "../api/queries";
import { docTitleParts } from "../lib/docTitle";
import { absUrl, type ShareResult } from "../lib/shareLink";
import type { AskSource, HubKind, HubLinks } from "../api/types";

// Same title rule as cards: id prefix stripped, id shown once unless it only respells the title.
const srcTitle = (s: { record_id: string; title: string; kind?: string }) => docTitleParts(s.record_id, s.title, s.kind);

export const CARD = "mb-3.5 rounded-xl border border-line2 bg-surface px-[13px] py-3";
export const ACTION = "rounded-md border border-line2 px-2.5 py-1 font-mono text-[10px] text-signal hover:border-signal disabled:opacity-50";

const CHIP_KINDS: HubKind[] = ["release", "agency", "location", "decade"];

// <HubChips> — copy the existing function from AskAnswer.tsx verbatim.

export function AskCard({ question, data, footer }: { question: string; data: { answer: string; sources: AskSource[] }; footer?: ReactNode }) {
  const [flash, setFlash] = useState<number | null>(null);
  const { data: hubsData } = useHubs();
  const hubLabels = new Map((hubsData?.hubs ?? []).map((h) => [`${h.kind}/${h.slug}`, h.label]));

  function cite(n: number) {
    document.getElementById(`ask-src-${n}`)?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    setFlash(n);
    setTimeout(() => setFlash((cur) => (cur === n ? null : cur)), 1200);
  }

  const parts = data.answer.split(/(\[\d+\])/);
  return (
    <section className={CARD} aria-label="archive answer">
      {/* header, question line, answer <p>, sources <ol>, disclaimer <p>: copy verbatim from AskAnswer.tsx */}
      {footer && <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-line pt-2.5">{footer}</div>}
    </section>
  );
}

// What happened after a share: "link copied", or the link itself to copy by hand.
export function ShareNote({ result, url }: { result: ShareResult | null; url: string }) {
  if (result === "copied") return <span className="font-mono text-[10px] text-faint">link copied</span>;
  if (result !== "failed") return null;
  return (
    <input
      readOnly
      value={absUrl(url)}
      aria-label="share link"
      onFocus={(e) => e.currentTarget.select()}
      className="min-w-0 flex-1 rounded-md border border-line bg-transparent px-2 py-1 font-mono text-[10px] text-ink"
    />
  );
}
```

The two "copy verbatim" markers are moves, not new code: cut the `HubChips` function and the JSX between `<section …>` and the old action row out of `AskAnswer.tsx` and paste them at those markers. Delete the markers.

- [ ] **Step 4: Rewrite `AskAnswer.tsx`**:

```tsx
// Live "Ask the Archive" answer: fetches /api/ask, shows loading/error states,
// and lets the asker share it as a public page (Spec 8 §3.3).
import { useState } from "react";
import { useAsk, useShareAsk } from "../api/queries";
import { ApiError } from "../api/client";
import { shareLink, xIntent, type ShareResult } from "../lib/shareLink";
import { AskCard, ShareNote, CARD, ACTION } from "./AskCard";
import type { AskResponse } from "../api/types";

function errorCopy(e: unknown) {
  if (e instanceof ApiError && e.status === 429) return "slow down — too many questions";
  if (e instanceof ApiError && e.status === 503) return "Ask is resting — try again later";
  return null;
}

function ShareControls({ question, logId }: { question: string; logId: number }) {
  const share = useShareAsk();
  const [url, setUrl] = useState<string | null>(null);
  const [result, setResult] = useState<ShareResult | null>(null);
  const [failed, setFailed] = useState(false);

  function publish() {
    setFailed(false);
    share.mutate(
      { id: logId, public: true },
      {
        onSuccess: async (r) => {
          setUrl(r.url);
          setResult(await shareLink(question, r.url));
        },
        onError: () => setFailed(true),
      }
    );
  }

  if (!url)
    return (
      <>
        <button type="button" disabled={share.isPending} onClick={publish} className={ACTION}>
          share
        </button>
        {failed && <span className="font-mono text-[10px] text-dim">couldn't share — try again</span>}
      </>
    );
  return (
    <>
      <span className="font-mono text-[10px] text-signal">✓ shared</span>
      <button type="button" onClick={async () => setResult(await shareLink(question, url))} className={ACTION}>
        share link
      </button>
      <a href={xIntent(question, url)} target="_blank" rel="noopener" className={ACTION}>
        post on X
      </a>
      <button
        type="button"
        disabled={share.isPending}
        onClick={() => share.mutate({ id: logId, public: false }, { onSuccess: () => { setUrl(null); setResult(null); } })}
        className={ACTION}
      >
        undo
      </button>
      <ShareNote result={result} url={url} />
    </>
  );
}

export function AskAnswer({ question, onPost }: { question: string; onPost?: (data: AskResponse) => void }) {
  const { data, isLoading, error, refetch } = useAsk(question);

  if (isLoading) return <div className={`${CARD} font-mono text-[11px] text-faint`}>◉ consulting the archive…</div>;
  if (error) {
    const copy = errorCopy(error);
    return (
      <div className={`${CARD} flex items-center gap-3 font-mono text-[11px] text-dim`}>
        <span className="flex-1">{copy ?? "Couldn't reach the archive — try again"}</span>
        {!copy && (
          <button type="button" onClick={() => refetch()} className="rounded-md border border-line2 px-2 py-0.5 text-signal">
            retry
          </button>
        )}
      </div>
    );
  }
  if (!data) return null;

  const canShare = data.sources.length > 0 && data.log_id != null;
  const canPost = data.sources.length > 0 && !!onPost;
  return (
    <AskCard
      question={question}
      data={data}
      footer={
        canShare || canPost ? (
          <>
            {canShare && <ShareControls question={question} logId={data.log_id!} />}
            {canPost && (
              <button type="button" onClick={() => onPost!(data)} className={ACTION}>
                ⤴ post to a board
              </button>
            )}
          </>
        ) : undefined
      }
    />
  );
}

export default AskAnswer;
```

- [ ] **Step 5: Helper copy** — in `web/src/screens/Ask.tsx` replace the `<p className="-mt-2 mb-3 …">` text with:

```tsx
        Questions are logged. Tap “share” on an answer to publish it as a public page — don’t include personal details.
```

and in the header comment replace "The worker serves /ask with robots noindex (AI answers can be wrong)." with "The worker serves /ask with robots noindex; shared answers get their own indexed /ask/:id page."

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm test:web -- src/tests/ask.test.tsx`
Expected: PASS (all pre-existing AskAnswer/Ask screen tests too — they exercise the moved card markup).

- [ ] **Step 7: Commit**

```bash
git add web/src/components/AskCard.tsx web/src/components/AskAnswer.tsx web/src/screens/Ask.tsx web/src/tests/ask.test.tsx
git commit -m "feat(web): one-tap share for Ask answers (public page + share sheet), AskCard split out"
```

---

### Task 8: `/ask/:id` screen and shared-list links

**Files:**
- Create: `web/src/screens/AskShared.tsx`
- Modify: `web/src/router.tsx`, `web/src/components/AskHistory.tsx`
- Test: `web/src/tests/askShared.test.tsx` (new), `web/src/tests/ask.test.tsx`

**Interfaces:**
- Consumes: `useSharedAsk`, `SharedAsk` (Task 6); `shareLink`, `xIntent`, `askIdOf`, `ShareResult` (Task 6); `AskCard`, `ShareNote`, `CARD`, `ACTION` (Task 7); `ApiError(status, message)` (`web/src/api/client.ts`); `addAskHistory` (`web/src/lib/askHistory.ts`).

- [ ] **Step 1: Write the failing tests** — `web/src/tests/askShared.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, act } from "@testing-library/react";
import { ApiError } from "../api/client";
import { renderAppAt } from "./util";

const useSharedAskMock = vi.fn();
const useAskMock = vi.fn();
const shareMutate = vi.fn();
let askFeature = true;
vi.mock("../api/queries", () => ({
  useSharedAsk: (id: number | null) => useSharedAskMock(id),
  useAsk: (q: string) => useAskMock(q),
  useAskRecent: () => ({ data: undefined }),
  useShareAsk: () => ({ mutate: shareMutate, isPending: false }),
  useAddComment: () => ({ mutate: vi.fn(), isPending: false }),
  useAddCaseComment: () => ({ mutate: vi.fn(), isPending: false }),
  useReply: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateThread: () => ({ mutate: vi.fn(), isPending: false }),
  useFacets: () => ({ data: undefined }),
  useBootstrap: () => ({
    data: { archives: [], boards: [], stats: { records: 2 }, ticker: [], sightings: [], cases: [], features: { ask: askFeature } },
    isLoading: false,
  }),
  useRecords: () => ({ data: { count: 0, records: [] }, isLoading: false, isPlaceholderData: false }),
  useHubs: () => ({ data: { hubs: [] } }),
}));
const shareLinkMock = vi.fn();
vi.mock("../lib/shareLink", async (orig) => ({
  ...(await orig<typeof import("../lib/shareLink")>()),
  shareLink: (t: string, u: string) => shareLinkMock(t, u),
}));

const shared = {
  id: 12,
  question: "What about Gimbal?",
  answer: "It rotated [1].",
  sources: [{ n: 1, record_id: "WARGOV-VID-1", title: "Gimbal", page: 0, kind: "video", thumb: null }],
  asked_at: "2026-10-02 08:00:00",
  url: "/ask/12-what-about-gimbal",
};

beforeEach(() => {
  askFeature = true;
  useSharedAskMock.mockReset().mockReturnValue({ data: shared, isLoading: false, error: null, refetch: vi.fn() });
  useAskMock.mockReset().mockReturnValue({ data: undefined, isLoading: true, error: null, refetch: vi.fn() });
  shareLinkMock.mockReset().mockResolvedValue("copied");
  shareMutate.mockReset();
});

describe("shared answer page", () => {
  it("shows the frozen answer and its sources for the id in the URL", async () => {
    renderAppAt("/ask/12-what-about-gimbal");
    expect(await screen.findByText(/It rotated/)).toBeInTheDocument(); // answer text is split around the [1] button
    expect(screen.getByText("What about Gimbal?")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Gimbal/ })).toHaveAttribute("href", "/doc/WARGOV-VID-1");
    expect(useSharedAskMock).toHaveBeenCalledWith(12);
    expect(document.title).toBe("What about Gimbal? · RealUFO");
  });

  it("share opens the share sheet for the page URL without publishing again", async () => {
    renderAppAt("/ask/12-what-about-gimbal");
    fireEvent.click(await screen.findByRole("button", { name: "share" }));
    await act(async () => {});
    expect(shareLinkMock).toHaveBeenCalledWith("What about Gimbal?", "/ask/12-what-about-gimbal");
    expect(shareMutate).not.toHaveBeenCalled();
    expect(screen.getByText("link copied")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "post on X" }).getAttribute("href")).toContain("x.com/intent/post");
  });

  it("an unshared or unknown answer says so", async () => {
    useSharedAskMock.mockReturnValue({ data: undefined, isLoading: false, error: new ApiError(404, "not found"), refetch: vi.fn() });
    renderAppAt("/ask/12-what-about-gimbal");
    expect(await screen.findByText("this answer isn't shared anymore.")).toBeInTheDocument();
  });

  it("a non-numeric id never fetches and says not shared", async () => {
    renderAppAt("/ask/nope");
    expect(await screen.findByText("this answer isn't shared anymore.")).toBeInTheDocument();
    expect(useSharedAskMock).toHaveBeenCalledWith(null);
  });

  it("asking your own question goes to /ask?q=", async () => {
    renderAppAt("/ask/12-what-about-gimbal");
    const box = await screen.findByPlaceholderText(/ask your own question/);
    fireEvent.change(box, { target: { value: "What about Nimitz?" } });
    fireEvent.submit(box.closest("form")!);
    expect(await screen.findByText("◉ consulting the archive…")).toBeInTheDocument();
    expect(useAskMock).toHaveBeenLastCalledWith("What about Nimitz?");
  });

  it("with Ask resting the answer still shows, the ask box doesn't", async () => {
    askFeature = false;
    renderAppAt("/ask/12-what-about-gimbal");
    expect(await screen.findByText(/It rotated/)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/ask your own question/)).toBeNull();
  });
});
```

In `web/src/tests/ask.test.tsx`, inside `describe("Ask screen", …)` add:

```ts
  it("shared questions with a page link to it (free); older ones re-ask", async () => {
    useAskRecentMock.mockReturnValue({
      data: {
        recent: [
          { id: 12, question: "What about Gimbal?", sources: 2, asked_at: "2026-10-02 08:00:00", url: "/ask/12-what-about-gimbal" },
          { id: 3, question: "Old one?", sources: 1, asked_at: "2026-10-01 08:00:00", url: null },
        ],
      },
    });
    renderAppAt("/ask");
    expect(await screen.findByRole("link", { name: /What about Gimbal\?/ })).toHaveAttribute("href", "/ask/12-what-about-gimbal");
    expect(screen.getByRole("button", { name: /Old one\?/ })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:web -- src/tests/askShared.test.tsx src/tests/ask.test.tsx`
Expected: FAIL — `/ask/12-…` renders NotFound; the Gimbal item is a button, not a link.

- [ ] **Step 3: Create `web/src/screens/AskShared.tsx`**:

```tsx
// A shared Ask answer's permanent page (Spec 8 §3.4): the answer frozen when it
// was asked, free to open, and shown even while new asks are resting. The
// worker pre-renders the same URL (indexed) for crawlers and link previews.
import { useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useBootstrap, useSharedAsk } from "../api/queries";
import { AskCard, ShareNote, CARD, ACTION } from "../components/AskCard";
import { LoadError } from "../components/LoadError";
import { addAskHistory } from "../lib/askHistory";
import { askIdOf, shareLink, xIntent, type ShareResult } from "../lib/shareLink";
import { useSetPageTitle } from "../lib/pageTitle";

const GONE = "this answer isn't shared anymore.";

export function AskShared() {
  const { id: param = "" } = useParams();
  const id = askIdOf(param);
  const { data, isLoading, error, refetch } = useSharedAsk(id);
  const { data: boot } = useBootstrap();
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [result, setResult] = useState<ShareResult | null>(null);
  useSetPageTitle("ASK THE ARCHIVE", "shared answer", data?.question);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = input.replace(/\s+/g, " ").trim();
    if (q.length < 3) return;
    addAskHistory(q);
    navigate(`/ask?q=${encodeURIComponent(q)}`);
  }

  if (id == null) return <LoadError error={null} onRetry={() => {}} notFound={GONE} />;
  if (isLoading) return <div className={`${CARD} font-mono text-[11px] text-faint`}>◉ consulting the archive…</div>;
  if (error || !data) return <LoadError error={error} onRetry={() => refetch()} notFound={GONE} />;

  return (
    <div data-screen="ask-shared" className="animate-[fadeup_.35s_ease_both]">
      <AskCard
        question={data.question}
        data={data}
        footer={
          <>
            <button type="button" onClick={async () => setResult(await shareLink(data.question, data.url))} className={ACTION}>
              share
            </button>
            <a href={xIntent(data.question, data.url)} target="_blank" rel="noopener" className={ACTION}>
              post on X
            </a>
            <ShareNote result={result} url={data.url} />
          </>
        }
      />
      {boot?.features?.ask && (
        <form onSubmit={submit} className="flex items-center gap-[9px] rounded-xl border border-line2 bg-surface px-[13px] py-2.5">
          <span aria-hidden="true" className="text-[15px] text-faint">
            ◉
          </span>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            enterKeyHint="go"
            aria-label="Ask the archive"
            placeholder="ask your own question…"
            className="min-w-0 flex-1 border-0 bg-transparent font-mono text-[12.5px] text-ink outline-none placeholder:text-faint"
          />
          <button type="submit" className="flex-none rounded-md bg-signal px-2 py-0.5 font-mono text-[10px] font-bold text-[#04140c]">
            ↵ ASK
          </button>
        </form>
      )}
    </div>
  );
}

export default AskShared;
```

- [ ] **Step 4: Route** — in `web/src/router.tsx` add after the `/ask` entry:

```tsx
          { path: "/ask/:id", lazy: screen(() => import("./screens/AskShared")) },
```

- [ ] **Step 5: Shared list links** — in `web/src/components/AskHistory.tsx` add `import { Link } from "react-router-dom";` and replace the `recent.map(...)` body with:

```tsx
            {recent.map((r) => {
              const inner = (
                <>
                  <span className="min-w-0 flex-1 truncate">{r.question}</span>
                  <span className="flex-none font-mono text-[10px] text-faint">
                    {r.sources} {r.sources === 1 ? "source" : "sources"}
                  </span>
                </>
              );
              // A shared answer's page is free; rows shared before answers were stored re-ask.
              return r.url ? (
                <Link key={r.question} to={r.url} className={`${ITEM} flex items-center gap-2`}>
                  {inner}
                </Link>
              ) : (
                <button key={r.question} type="button" onClick={() => onPick(r.question)} className={`${ITEM} flex items-center gap-2`}>
                  {inner}
                </button>
              );
            })}
```

Update the header comment's second sentence to: "Tapping an item asks it, or opens its shared page when it has one."

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm test:web`
Expected: PASS (whole web suite).

- [ ] **Step 7: Commit**

```bash
git add web/src/screens/AskShared.tsx web/src/router.tsx web/src/components/AskHistory.tsx web/src/tests/askShared.test.tsx web/src/tests/ask.test.tsx
git commit -m "feat(web): /ask/:id shared answer page; shared questions link to it"
```

---

### Task 9: IndexNow for shared answers + seeding script

**Files:**
- Modify: `crawler/indexnow.py`
- Create: `crawler/ingest/seed_asks.py`, `crawler/ingest/data/ask_seed.json`
- Test: `crawler/ingest/tests/test_indexnow_asks.py` (new), `crawler/ingest/tests/test_seed_asks.py` (new)

**Interfaces:**
- Consumes: `ingest.d1._d1_json(sql) -> list[dict]`, `ingest.d1.sql_q(v) -> str` (existing).
- Produces: `indexnow.ask_urls(locs: list[str], ids: set[int]) -> list[str]`; `ingest.seed_asks.local_sql(rows: list[dict]) -> str`; CLI `python3 -m ingest.seed_asks --ask | --share ID… | --to-local`.

- [ ] **Step 1: Write the failing tests**

`crawler/ingest/tests/test_indexnow_asks.py`:

```python
from indexnow import ask_urls


def test_ask_urls_keeps_only_listed_ids_and_never_rebuilds_slugs():
    locs = [
        "https://realufo.org/ask/12-what-about-gimbal",
        "https://realufo.org/ask/13",
        "https://realufo.org/ask/130-other",
        "https://realufo.org/doc/ask-12",
        "https://realufo.org/archive",
    ]
    assert ask_urls(locs, {12, 13}) == ["https://realufo.org/ask/12-what-about-gimbal", "https://realufo.org/ask/13"]
    assert ask_urls(locs, set()) == []
```

`crawler/ingest/tests/test_seed_asks.py`:

```python
import json, pathlib
from ingest.seed_asks import local_sql, COLS

def test_local_sql_quotes_text_and_nulls_in_column_order():
    row = {"id": 5, "question": "Pilot's view?", "actor_id": "abc", "sources": 2, "cached": 0, "public": 1,
           "created_at": "2026-10-02 08:00:00", "answer": None}
    sql = local_sql([row])
    assert sql == ("INSERT OR REPLACE INTO ask_log(" + ",".join(COLS) + ") VALUES("
                   "'5','Pilot''s view?','abc','2','0','1','2026-10-02 08:00:00',NULL);\n")

def test_seed_questions_are_distinct_and_valid():
    qs = json.loads((pathlib.Path(__file__).parent.parent / "data" / "ask_seed.json").read_text())
    assert len(qs) >= 20
    assert len({q.lower() for q in qs}) == len(qs)
    assert all(isinstance(q, str) and 3 <= len(q) <= 300 for q in qs)
```

(`sql_q` quotes every non-empty value as text; SQLite's INTEGER affinity stores `'5'` as `5`, matching how `ingest.d1.emit_sql` already writes rows.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd crawler && python3 -m pytest ingest/tests/test_indexnow_asks.py ingest/tests/test_seed_asks.py -q`
Expected: FAIL — `ImportError: cannot import name 'ask_urls'`, `No module named 'ingest.seed_asks'`.

- [ ] **Step 3: IndexNow** — in `crawler/indexnow.py`:

Add to the module docstring's `--since-hours` paragraph: "…and shared Ask answers published in that window."

After `CHANGED_SQL` add:

```python
ASK_SQL = "SELECT DISTINCT id FROM ask_log WHERE public=1 AND answer IS NOT NULL AND created_at >= datetime('now', '-{h} hours')"


def ask_urls(locs: list[str], ids: set[int]) -> list[str]:
    """Sitemap URLs of shared answers whose ask_log id is in ids. The slug comes from the sitemap, never rebuilt here."""
    out = []
    for u in locs:
        m = re.search(r"/ask/(\d+)(?:-|$)", u)
        if m and int(m.group(1)) in ids:
            out.append(u)
    return out
```

Replace `changed_urls` with:

```python
def changed_urls(hours: int) -> list[str]:
    from ingest import d1  # run from crawler/
    ids = {r["id"] for r in d1._d1_json(" ".join(CHANGED_SQL.format(h=int(hours)).split()))}
    asks = {int(r["id"]) for r in d1._d1_json(ASK_SQL.format(h=int(hours)))}
    if not ids and not asks:
        return []
    if ids:
        q = ",".join(d1.sql_q(i) for i in sorted(ids))
        ids |= {r["id"] for r in d1._d1_json(f"SELECT DISTINCT record_id id FROM record_links WHERE related_id IN ({q})")}
    locs = [u.replace("&amp;", "&") for u in sitemap_urls()]
    doc_id = lambda u: urllib.parse.unquote(u.split("/doc/", 1)[1])
    pages = [u for u in locs if "/ask/" not in u and ("/doc/" not in u or doc_id(u) in ids)] if ids else []
    return pages + ask_urls(locs, asks)
```

- [ ] **Step 4: Seed question list** — `crawler/ingest/data/ask_seed.json`. Start from the 10 golden questions (`crawler/ingest/data/ask_golden.json`, the `q` values) plus these 15; they are re-checked against the archive in Task 10 before anything is asked:

```json
[
  "What was discussed at the 1949 Los Alamos conference on aerial phenomena?",
  "What did NASA's independent UAP study team recommend?",
  "How did AARO explain the GoFast video?",
  "What happened at Harare International Airport in July 2008?",
  "Did the analysis of flying object incidents consider Soviet aircraft?",
  "What did Captain Edward Ruppelt present in 1952?",
  "What did Project Blue Book conclude about the Tremonton, Utah film?",
  "What was the AAWSAP program solicitation in 2008?",
  "What was reported in the 2022 mission report from Iraq?",
  "What does the 2024 NDAA require for UAP records?",
  "What did Navy pilots report about the 2004 Nimitz Tic Tac encounter?",
  "What does the GIMBAL video show, according to the files?",
  "What did AARO's historical record report conclude about government UFO programs?",
  "What did the FBI's 1947 flying disc memos say?",
  "What did the Robertson Panel recommend in 1953?",
  "What do the files say about the Roswell incident?",
  "How many UAP reports did AARO receive, and how many were resolved?",
  "Which UAP sightings were explained as balloons?",
  "What did the CIA say about UFO sightings in the 1950s?",
  "What did the 2021 ODNI preliminary assessment on UAP find?",
  "What did the Condon report conclude about UFOs?",
  "Have any UAP been seen near nuclear weapons sites?",
  "What do military radar reports say about objects moving at high speed?",
  "What did AARO say about the Mount Etna UAP video?",
  "What reporting procedures did the military set up for UAP sightings?"
]
```

- [ ] **Step 5: Seeding script** — `crawler/ingest/seed_asks.py`:

```python
"""Seed shared Ask answers (Spec 8 §4). Answers come from the live API, so they are real.

    python3 -m ingest.seed_asks --ask [--out seed_asks.json]   # ask each question, save for review
    python3 -m ingest.seed_asks --share 12 15 19               # publish reviewed answers, print their URLs
    python3 -m ingest.seed_asks --to-local                     # copy prod's shared answers into local D1

Run from crawler/. --ask costs one AI answer per uncached question.
"""
import argparse, json, pathlib, subprocess, tempfile, time, urllib.parse, urllib.request
from ingest import d1

BASE = "https://realufo.org"
ANON = "realufo-seed"  # one fixed browser id: --share must come from the asker
UA = "realufo-seed/1.0 (+https://realufo.org)"
QUESTIONS = pathlib.Path(__file__).parent / "data" / "ask_seed.json"
REPO = pathlib.Path(__file__).resolve().parents[2]  # wrangler.jsonc + local D1 state live here
COLS = ("id", "question", "actor_id", "sources", "cached", "public", "created_at", "answer")


def _api(path: str, body: dict | None = None) -> dict:
    req = urllib.request.Request(
        BASE + path,
        data=None if body is None else json.dumps(body).encode(),
        headers={"X-Anon-Id": ANON, "user-agent": UA, "content-type": "application/json"},
        method="GET" if body is None else "POST",
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def ask_all(out: str) -> None:
    rows = []
    for q in json.loads(QUESTIONS.read_text()):
        try:
            a = _api("/api/ask?q=" + urllib.parse.quote(q))
        except Exception as e:
            print(f"ERR  {q}: {e}")
            continue
        srcs = a.get("sources", [])
        rows.append({"log_id": a.get("log_id"), "question": q, "sources": [s["record_id"] for s in srcs], "answer": a.get("answer")})
        print(f"{a.get('log_id')!s:>6}  {len(srcs)} src  {q}")
        time.sleep(4)  # per-browser limit is 20/min
    pathlib.Path(out).write_text(json.dumps(rows, indent=2, ensure_ascii=False))
    print(f"saved {len(rows)} answers to {out} — read every one before --share")


def share(ids: list[int]) -> None:
    for i in ids:
        print(BASE + _api(f"/api/ask/{int(i)}/public", {"public": True})["url"])


def local_sql(rows: list[dict]) -> str:
    cols = ",".join(COLS)
    return "".join(f"INSERT OR REPLACE INTO ask_log({cols}) VALUES({','.join(d1.sql_q(r[c]) for c in COLS)});\n" for r in rows)


def to_local() -> None:
    rows = d1._d1_json(f"SELECT {','.join(COLS)} FROM ask_log WHERE public=1 AND answer IS NOT NULL")
    with tempfile.NamedTemporaryFile("w", suffix=".sql", delete=False) as f:
        f.write(local_sql(rows))
    subprocess.run(["wrangler", "d1", "execute", "realufo-db", "--local", "--file", f.name], check=True, cwd=REPO)
    print(f"copied {len(rows)} shared answers to local D1")


def main(argv=None):
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--ask", action="store_true")
    g.add_argument("--share", nargs="+", type=int, metavar="ID")
    g.add_argument("--to-local", action="store_true")
    ap.add_argument("--out", default="seed_asks.json")
    args = ap.parse_args(argv)
    if args.ask:
        ask_all(args.out)
    elif args.share:
        share(args.share)
    else:
        to_local()


if __name__ == "__main__":
    main()
```

Add `crawler/seed_asks.json` to `.gitignore` (the review file is not committed).

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd crawler && python3 -m pytest ingest/tests/ -q`
Expected: PASS (whole crawler suite).

- [ ] **Step 7: Commit**

```bash
git add crawler/indexnow.py crawler/ingest/seed_asks.py crawler/ingest/data/ask_seed.json crawler/ingest/tests/test_indexnow_asks.py crawler/ingest/tests/test_seed_asks.py .gitignore
git commit -m "feat(crawler): IndexNow shared answers; seed_asks script and question list"
```

---

### Task 10: Rollout — migrate, deploy, seed, verify

Outward-facing: ask the user before Step 3 (deploy) and Step 6 (publishing seeds). Follow the project memory rules: deploy from a clean worktree of HEAD; check pending D1 migrations first.

- [ ] **Step 1: Full test run on HEAD**

Run: `pnpm test:worker && pnpm test:web && (cd crawler && python3 -m pytest ingest/tests/ -q)`
Expected: all PASS.

- [ ] **Step 2: Check pending migrations**

Run: `npx wrangler d1 migrations list realufo-db --remote`
Expected: only `0021_ask_answer.sql` pending. Anything else pending → stop and ask the user.

- [ ] **Step 3: Deploy from a clean worktree of HEAD** (after user confirms)

```bash
git worktree add ../realufo-deploy HEAD
cd ../realufo-deploy && pnpm install --frozen-lockfile && pnpm -C web install --frozen-lockfile && pnpm run deploy
```

Expected: migration applied, worker deployed; note the version id.

- [ ] **Step 4: Smoke test prod**

Run: `curl -s https://realufo.org/api/ask/recent | head -c 400` → items have `id` and `url` keys.
Run: `curl -s -o /dev/null -w "%{http_code}\n" https://realufo.org/api/asks/1` → `404` (or `200` if row 1 is public with an answer).

- [ ] **Step 5: Check the seed list against the archive, then ask**

Run (from repo root): `npx wrangler d1 execute realufo-db --remote --command "SELECT id,title FROM records WHERE title LIKE '%Nimitz%' OR title LIKE '%Gimbal%' OR title LIKE '%Robertson%' OR title LIKE '%Roswell%' OR title LIKE '%Condon%' OR title LIKE '%Etna%' OR title LIKE '%ODNI%' OR title LIKE '%Historical Record%' LIMIT 40"`
Reword or drop any question in `ask_seed.json` with no matching material; keep ≥20.
Run: `cd crawler && python3 -m ingest.seed_asks --ask`
Expected: one line per question with a log id and source count.

- [ ] **Step 6: Review every answer, then publish** (after user confirms the keep list)

Read each entry in `crawler/seed_asks.json`: keep only answers that have sources, cite them, read well and say nothing the sources don't. Show the user the keep list (question + first line of the answer).

Run: `cd crawler && python3 -m ingest.seed_asks --share <ids…>`
Expected: one `https://realufo.org/ask/<id>-<slug>` per id.

- [ ] **Step 7: Verify a page as a crawler sees it**

Run: `curl -s https://realufo.org/ask/<first-id>-<slug> | grep -E "<title>|og:image|canonical|robots"`
Expected: question title, `og:image`, canonical to itself, no `robots` line. Also `curl -s https://realufo.org/sitemap.xml | grep -c "/ask/"` ≥ number of distinct shared questions.

- [ ] **Step 8: Copy to local dev DB**

Run: `pnpm db:migrate:local && cd crawler && python3 -m ingest.seed_asks --to-local`
Expected: "copied N shared answers to local D1". Then start `worker-dev` + `web-dev` previews and open `/ask` — "Shared questions" lists them; tapping one opens `/ask/<id>-…` with the answer.

- [ ] **Step 9: IndexNow**

Run: `python3 crawler/indexnow.py <all shared URLs from Step 6>`
Expected: `200 submitted N urls` (or `202`).

- [ ] **Step 10: Clean up and record**

```bash
git worktree remove ../realufo-deploy
```

Update the project-state memory with the deployed version id and that Spec 8 is live.
