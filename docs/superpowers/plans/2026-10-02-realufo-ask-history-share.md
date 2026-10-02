# Ask History + Post Answer to Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ask the Archive shows "Your questions" (this browser) and "Recently asked" (public, answered only), and an answer can be posted as a new board thread whose body links/embeds its source files.

**Architecture:** No migration. The Worker stores the original question inside the existing `ask_cache` JSON and exposes the latest answered rows at `GET /api/ask/recent`. The web keeps a per-browser list in `localStorage`, renders both lists in Ask mode when no answer is open, and reuses the existing Composer "new thread" sheet with a pre-filled title/body for posting.

**Tech Stack:** Cloudflare Worker + D1 (vitest-pool-workers tests), React 19 + react-router + TanStack Query + Vitest/Testing Library, Tailwind.

**Spec:** `docs/superpowers/specs/2026-10-02-realufo-ask-history-share-design.md`

## Global Constraints

- No D1 migration; reuse `ask_cache(key, answer, created_at)`. Cache keys are `${min}|${question.toLowerCase()}` where `min = Number(env.ASK_MIN_SCORE) || 0.45`.
- `/api/ask/recent` uses the same flag gate as `/api/ask` (`FEATURE_ASK` must be `on` or `hidden`, else 503 `RESTING`), makes no AI calls, writes no `rate_events` rows.
- Recent list: current threshold only, last 7 days, newest first, max 20.
- `localStorage` key `realufo.askHistory`, newest first, max 20, case-insensitive dedupe; every access in `try/catch`.
- Post button only when the answer has sources. Thread title = question cut to 120 chars; board `"uap"`.
- Thread body format (exact):
  ```
  Q: <question>

  <answer with [n] → record id of source n; unknown [n] removed>

  Sources: <id1>, <id2>, …

  — via Ask the Archive
  ```
- Other Claude chats commit in this checkout (Ask code included). Before each commit run `git status`, stage only the files the task lists, never `git add -A`.
- Node 22: `export PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH"`. Worker tests: `pnpm test:worker`; web tests: `pnpm -C web test`. In the main checkout 8 pre-existing `client.test.ts`/`theme.test.tsx` failures (Node localStorage) are expected; they pass in a clean worktree.

## Review Focus

- `localStorage` holding corrupted JSON or a non-array value → "Your questions" is empty, nothing crashes (test in Task 2).
- `localStorage` throwing on every call (Safari private mode, blocked storage) → reads return `[]`, writes are no-ops (test in Task 2).
- A 300-character question posted to a board → title is cut to 120 chars, body keeps the full question (test in Task 2).
- An answer citing two chunks of the same file (`[1]` and `[2]` both `CIA-UAP-017`) → "Sources:" lists the id once (test in Task 2).
- Rows cached before this change (no `question` field) or with broken JSON → recent list falls back to the key text / skips the row instead of 500 (test in Task 1).

---

## File Structure

| File | Responsibility |
|---|---|
| `worker/routes/ask.ts` (modify) | add `question` to answered body; new `recentAsks` handler |
| `worker/index.ts` (modify) | register `GET /api/ask/recent` |
| `worker/tests/ask.spec.ts` (modify) | tests for `question` + `/recent` |
| `web/src/lib/askHistory.ts` (create) | per-browser question list in `localStorage` |
| `web/src/lib/askThread.ts` (create) | pure: answer → thread body / Composer opts |
| `web/src/tests/askLib.test.ts` (create) | tests for both libs |
| `web/src/api/types.ts` (modify) | `AskResponse.question`, `AskRecent`, `AskRecentResponse` |
| `web/src/api/queries.ts` (modify) | `useAskRecent()` |
| `web/src/components/AskHistory.tsx` (create) | the two history lists |
| `web/src/components/AskAnswer.tsx` (modify) | `onPost` prop + button |
| `web/src/screens/Archive.tsx` (modify) | `openAsk`, history mount, `onPost` wiring |
| `web/src/tests/ask.test.tsx` (modify) | UI tests |

---

### Task 1: Worker — question in cached answers + `GET /api/ask/recent`

**Files:**
- Modify: `worker/routes/ask.ts`
- Modify: `worker/index.ts`
- Test: `worker/tests/ask.spec.ts`

**Interfaces:**
- Produces: `GET /api/ask` JSON gains `question: string` (original case). `GET /api/ask/recent` → `{ recent: { question: string; sources: number; asked_at: string }[] }`. Exported handler `recentAsks(req: Request, env: Env): Promise<Response>`.

- [ ] **Step 1: Write the failing tests**

In `worker/tests/ask.spec.ts`, add inside `describe("GET /api/ask", …)` (after the first `it`):

```ts
  it("returns and caches the question in its original case", async () => {
    const b = await body(await ask("  What Did RADAR See?  "));
    expect(b.question).toBe("What Did RADAR See?");
    const row = await env.DB.prepare("SELECT answer FROM ask_cache").first<{ answer: string }>();
    expect(JSON.parse(row!.answer).question).toBe("What Did RADAR See?");
  });
```

At the end of the file, add a new describe (the file's top-level `beforeEach` already empties `ask_cache`):

```ts
const recent = (extra: Record<string, unknown> = {}) =>
  worker.fetch(new Request("https://x/api/ask/recent"), { ...env, FEATURE_ASK: "on", AI, VECTORIZE, ...extra } as any, {} as any);

describe("GET /api/ask/recent", () => {
  const put = (key: string, answer: string, age: string) =>
    env.DB.prepare("INSERT INTO ask_cache(key,answer,created_at) VALUES(?,?,datetime('now',?))").bind(key, answer, age);

  it("lists answered questions newest first, current threshold only, no AI calls", async () => {
    await env.DB.batch([
      put("0.45|older question", JSON.stringify({ question: "Older Question", answer: "a [1]", sources: [{ n: 1 }] }), "-2 hours"),
      put("0.45|newer question?", JSON.stringify({ question: "Newer Question?", answer: "b [1][2]", sources: [{ n: 1 }, { n: 2 }] }), "-1 hours"),
      put("0.45|legacy lowercase", JSON.stringify({ answer: "c [1]", sources: [{ n: 1 }] }), "-3 hours"),
      put("0.5|other threshold", JSON.stringify({ question: "Other", answer: "d", sources: [{ n: 1 }] }), "-1 hours"),
      put("0.45|broken row", "not json", "-1 hours"),
      put("0.45|stale question", JSON.stringify({ question: "Stale", answer: "e", sources: [{ n: 1 }] }), "-8 days"),
    ]);
    aiCalls = [];
    const r = await recent();
    expect(r.status).toBe(200);
    const b = await body(r);
    expect(b.recent.map((x: any) => [x.question, x.sources])).toEqual([
      ["Newer Question?", 2],
      ["Older Question", 1],
      ["legacy lowercase", 1],
    ]);
    expect(typeof b.recent[0].asked_at).toBe("string");
    expect(aiCalls).toEqual([]);
  });

  it("a real answer shows up in the recent list", async () => {
    await ask("What did radar see?");
    const b = await body(await recent());
    expect(b.recent.map((x: any) => x.question)).toEqual(["What did radar see?"]);
  });

  it("returns 503 when FEATURE_ASK is off, serves when hidden", async () => {
    expect((await recent({ FEATURE_ASK: "off" })).status).toBe(503);
    expect((await recent({ FEATURE_ASK: "hidden" })).status).toBe(200);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:worker -- ask`
Expected: FAIL — `b.question` is `undefined`; `/api/ask/recent` returns 404 (no route).

- [ ] **Step 3: Implement**

In `worker/routes/ask.ts`, change the body declaration and assignment inside `ask()`:

```ts
  let body: { question: string; answer: string; sources: unknown[] };
  try {
    body = { question: q, ...(await answer(env, q, min)) };
  } catch {
    return error(503, RESTING);
  }
```

Append to `worker/routes/ask.ts`:

```ts
// GET /api/ask/recent — answered questions (only answers with sources are
// cached) for the current threshold, newest first. Free: no AI, no rate row.
export async function recentAsks(_req: Request, env: Env) {
  if (env.FEATURE_ASK !== "on" && env.FEATURE_ASK !== "hidden") return error(503, RESTING);
  const prefix = `${Number(env.ASK_MIN_SCORE) || 0.45}|`;
  const rows = await env.DB.prepare(
    "SELECT key, answer, created_at FROM ask_cache WHERE key LIKE ? AND created_at >= datetime('now','-7 days') ORDER BY created_at DESC LIMIT 20"
  )
    .bind(prefix + "%")
    .all<{ key: string; answer: string; created_at: string }>();
  const recent = rows.results.flatMap((r) => {
    try {
      const a = JSON.parse(r.answer) as { question?: string; sources?: unknown[] };
      // Rows cached before `question` existed only have the lowercased key.
      return [{ question: a.question || r.key.slice(prefix.length), sources: a.sources?.length ?? 0, asked_at: r.created_at }];
    } catch {
      return [];
    }
  });
  return json({ recent });
}
```

In `worker/index.ts`, change the import and add the route right after `on("GET", "/api/ask", ask);`:

```ts
import { ask, recentAsks } from "./routes/ask";
```

```ts
on("GET", "/api/ask/recent", recentAsks);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:worker`
Expected: all pass (previous 124 + 4 new).

- [ ] **Step 5: Commit**

```bash
git status --short
git add worker/routes/ask.ts worker/index.ts worker/tests/ask.spec.ts
git commit -m "feat(ask): cache the original question; GET /api/ask/recent lists answered questions"
```

---

### Task 2: Web libs — `askHistory` and `askThread`

**Files:**
- Create: `web/src/lib/askHistory.ts`
- Create: `web/src/lib/askThread.ts`
- Test: `web/src/tests/askLib.test.ts`

**Interfaces:**
- Consumes: `AskResponse`, `AskSource` from `web/src/api/types.ts` (exists: `{ answer: string; sources: AskSource[]; cached: boolean }`, `AskSource = { n, record_id, title, page, kind, thumb }`); `ComposerOpts` from `web/src/overlays/OverlayProvider.tsx` (exists).
- Produces:
  - `ASK_HISTORY_KEY = "realufo.askHistory"`
  - `readAskHistory(): string[]`
  - `addAskHistory(q: string): string[]` (returns the new list)
  - `clearAskHistory(): void`
  - `askThreadBody(question: string, data: Pick<AskResponse, "answer" | "sources">): string`
  - `askComposerOpts(question: string, data: Pick<AskResponse, "answer" | "sources">): ComposerOpts`

- [ ] **Step 1: Write the failing tests**

Create `web/src/tests/askLib.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ASK_HISTORY_KEY, addAskHistory, clearAskHistory, readAskHistory } from "../lib/askHistory";
import { askComposerOpts, askThreadBody } from "../lib/askThread";

// In-memory Storage so these tests don't depend on the runner's localStorage.
function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
  };
}

describe("askHistory", () => {
  beforeEach(() => vi.stubGlobal("localStorage", memoryStorage()));
  afterEach(() => vi.unstubAllGlobals());

  it("adds newest first, dedupes case-insensitively, caps at 20, clears", () => {
    addAskHistory("first question");
    addAskHistory("Second question");
    expect(addAskHistory("FIRST question")).toEqual(["FIRST question", "Second question"]);
    for (let i = 0; i < 25; i++) addAskHistory(`q${i}`);
    const list = readAskHistory();
    expect(list).toHaveLength(20);
    expect(list[0]).toBe("q24");
    clearAskHistory();
    expect(readAskHistory()).toEqual([]);
  });

  it("corrupted or non-array storage reads as empty", () => {
    localStorage.setItem(ASK_HISTORY_KEY, "{not json");
    expect(readAskHistory()).toEqual([]);
    localStorage.setItem(ASK_HISTORY_KEY, JSON.stringify({ a: 1 }));
    expect(readAskHistory()).toEqual([]);
    localStorage.setItem(ASK_HISTORY_KEY, JSON.stringify(["ok", 3, null]));
    expect(readAskHistory()).toEqual(["ok"]);
  });

  it("storage that throws reads as empty and writes are no-ops", () => {
    const boom = () => {
      throw new Error("blocked");
    };
    vi.stubGlobal("localStorage", { getItem: boom, setItem: boom, removeItem: boom, clear: boom });
    expect(readAskHistory()).toEqual([]);
    expect(() => addAskHistory("q")).not.toThrow();
    expect(() => clearAskHistory()).not.toThrow();
  });
});

const data = {
  answer: "Radar tracked it [1] and pilots saw it [2], see also [9].",
  sources: [
    { n: 1, record_id: "CIA-UAP-017", title: "High Alert", page: 2, kind: "pdf" as const, thumb: null },
    { n: 2, record_id: "CIA-UAP-017", title: "High Alert", page: 4, kind: "pdf" as const, thumb: null },
  ],
};

describe("askThread", () => {
  it("builds the thread body: ids for citations, unknown citations dropped, sources deduped", () => {
    expect(askThreadBody("What did radar see?", data)).toBe(
      "Q: What did radar see?\n\n" +
        "Radar tracked it CIA-UAP-017 and pilots saw it CIA-UAP-017, see also.\n\n" +
        "Sources: CIA-UAP-017\n\n" +
        "— via Ask the Archive",
    );
  });

  it("Composer opts: new thread on uap, title cut to 120, first source referenced", () => {
    const long = "x".repeat(300);
    const o = askComposerOpts(long, data);
    expect(o).toMatchObject({ mode: "newThread", boardId: "uap", sourceRecordId: "CIA-UAP-017", refLabel: "High Alert" });
    expect(o.presetTitle).toHaveLength(120);
    expect(o.presetBody!.startsWith(`Q: ${long}\n`)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm -C web test -- askLib`
Expected: FAIL — `Failed to resolve import "../lib/askHistory"`.

- [ ] **Step 3: Implement**

Create `web/src/lib/askHistory.ts`:

```ts
// Questions this browser asked the archive, newest first. Per-browser only
// (users are anonymous); storage can be missing or blocked, so every access
// is guarded and failure just means an empty list.
export const ASK_HISTORY_KEY = "realufo.askHistory";
const MAX = 20;

export function readAskHistory(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(ASK_HISTORY_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function addAskHistory(q: string): string[] {
  const next = [q, ...readAskHistory().filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, MAX);
  try {
    localStorage.setItem(ASK_HISTORY_KEY, JSON.stringify(next));
  } catch {
    /* storage blocked */
  }
  return next;
}

export function clearAskHistory(): void {
  try {
    localStorage.removeItem(ASK_HISTORY_KEY);
  } catch {
    /* storage blocked */
  }
}
```

Create `web/src/lib/askThread.ts`:

```ts
// Turns an Ask answer into a board thread: each [n] becomes source n's record
// id, which the thread screen links and embeds (RecordEmbed).
import type { AskResponse } from "../api/types";
import type { ComposerOpts } from "../overlays/OverlayProvider";

type Answer = Pick<AskResponse, "answer" | "sources">;

export function askThreadBody(question: string, data: Answer): string {
  const idOf = new Map(data.sources.map((s) => [s.n, s.record_id]));
  const answer = data.answer
    .replace(/\s*\[(\d+)\]/g, (_m, d: string) => {
      const id = idOf.get(Number(d));
      return id ? ` ${id}` : "";
    })
    .trim();
  const ids = [...new Set(data.sources.map((s) => s.record_id))];
  return `Q: ${question}\n\n${answer}\n\nSources: ${ids.join(", ")}\n\n— via Ask the Archive`;
}

export function askComposerOpts(question: string, data: Answer): ComposerOpts {
  const first = data.sources[0];
  return {
    mode: "newThread",
    boardId: "uap",
    presetTitle: question.slice(0, 120),
    presetBody: askThreadBody(question, data),
    sourceRecordId: first?.record_id,
    refLabel: first?.title,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm -C web test -- askLib`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git status --short
git add web/src/lib/askHistory.ts web/src/lib/askThread.ts web/src/tests/askLib.test.ts
git commit -m "feat(ask): per-browser question history and answer-to-thread helpers"
```

---

### Task 3: Web — "Your questions" + "Recently asked" lists

**Files:**
- Modify: `web/src/api/types.ts` (next to `AskResponse`, ~line 423)
- Modify: `web/src/api/queries.ts` (`qk` ~line 56, after `useAsk` ~line 157)
- Create: `web/src/components/AskHistory.tsx`
- Modify: `web/src/screens/Archive.tsx` (imports ~line 41-48; ask logic ~line 288-316; JSX ~line 437)
- Test: `web/src/tests/ask.test.tsx`

**Interfaces:**
- Consumes: `GET /api/ask/recent` (Task 1); `readAskHistory`, `addAskHistory`, `clearAskHistory` (Task 2).
- Produces: `AskRecent`, `AskRecentResponse` types; `useAskRecent()`; `<AskHistory onPick={(q: string) => void} />`; Archive's `openAsk(q: string)`.

- [ ] **Step 1: Write the failing tests**

In `web/src/tests/ask.test.tsx`:

1. Extend the imports and mock:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ASK_HISTORY_KEY } from "../lib/askHistory";
```

```ts
const useAskMock = vi.fn();
const useAskRecentMock = vi.fn();
let askFeature = true;
vi.mock("../api/queries", () => ({
  useAsk: (q: string) => useAskMock(q),
  useAskRecent: () => useAskRecentMock(),
  // …keep the existing useFacets / useBootstrap / useRecords entries unchanged…
}));
```

2. Add a storage helper above `describe("Archive ASK toggle", …)`:

```ts
function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
  };
}
```

3. In that describe's `beforeEach`, add storage + recent defaults, and an `afterEach`:

```ts
  beforeEach(() => {
    askFeature = true;
    useAskMock.mockReturnValue({ data: undefined, isLoading: false, error: null, refetch: vi.fn() });
    useAskRecentMock.mockReturnValue({ data: undefined });
    vi.stubGlobal("localStorage", memoryStorage());
  });
  afterEach(() => vi.unstubAllGlobals());
```

4. Add these tests inside that describe:

```ts
  it("ask mode with no question shows your questions and recently asked; tapping one asks it", async () => {
    localStorage.setItem(ASK_HISTORY_KEY, JSON.stringify(["Earlier question one"]));
    useAskRecentMock.mockReturnValue({
      data: { recent: [{ question: "What about Gimbal?", sources: 2, asked_at: "2026-10-02 08:00:00" }] },
    });
    useAskMock.mockReturnValue({ data: undefined, isLoading: true, error: null, refetch: vi.fn() });
    renderAppAt("/archive");
    fireEvent.click(await screen.findByRole("button", { name: "Ask the archive" }));
    expect(screen.getByText("YOUR QUESTIONS")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Earlier question one" })).toBeInTheDocument();
    expect(screen.getByText("RECENTLY ASKED")).toBeInTheDocument();
    expect(screen.getByText("2 sources")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /What about Gimbal\?/ }));
    expect(await screen.findByText("◉ consulting the archive…")).toBeInTheDocument();
    expect(useAskMock).toHaveBeenLastCalledWith("What about Gimbal?");
    expect(screen.queryByText("RECENTLY ASKED")).toBeNull(); // lists hide while an answer is open
    expect(JSON.parse(localStorage.getItem(ASK_HISTORY_KEY)!)[0]).toBe("What about Gimbal?");
  });

  it("submitting a question saves it to your questions", async () => {
    renderAppAt("/archive");
    fireEvent.click(await screen.findByRole("button", { name: "Ask the archive" }));
    const box = screen.getByPlaceholderText(/ask the archive — e\.g\./);
    fireEvent.change(box, { target: { value: "  what did radar see?  " } });
    fireEvent.submit(box.closest("form")!);
    await waitFor(() => expect(JSON.parse(localStorage.getItem(ASK_HISTORY_KEY)!)).toEqual(["what did radar see?"]));
  });

  it("clear button empties your questions", async () => {
    localStorage.setItem(ASK_HISTORY_KEY, JSON.stringify(["Old one"]));
    renderAppAt("/archive");
    fireEvent.click(await screen.findByRole("button", { name: "Ask the archive" }));
    fireEvent.click(screen.getByRole("button", { name: "clear your questions" }));
    expect(screen.queryByRole("button", { name: "Old one" })).toBeNull();
    expect(localStorage.getItem(ASK_HISTORY_KEY)).toBeNull();
  });

  it("shows nothing extra when both lists are empty", async () => {
    renderAppAt("/archive");
    fireEvent.click(await screen.findByRole("button", { name: "Ask the archive" }));
    expect(screen.queryByText("YOUR QUESTIONS")).toBeNull();
    expect(screen.queryByText("RECENTLY ASKED")).toBeNull();
  });
```

Add `waitFor` to the `@testing-library/react` import: `import { render, screen, fireEvent, waitFor } from "@testing-library/react";`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm -C web test -- ask.test`
Expected: FAIL — "Unable to find an element with the text: YOUR QUESTIONS" (and storage not written).

- [ ] **Step 3: Implement types + hook**

In `web/src/api/types.ts`, change `AskResponse` and add the recent types right after it:

```ts
export interface AskResponse {
  /** The question as asked (original case); absent on answers cached before it existed. */
  question?: string;
  answer: string;
  sources: AskSource[];
  cached: boolean;
}

/** GET /api/ask/recent — answered questions, newest first. */
export interface AskRecent {
  question: string;
  sources: number;
  asked_at: string;
}
export interface AskRecentResponse {
  recent: AskRecent[];
}
```

In `web/src/api/queries.ts`: add `AskRecentResponse,` to the `./types` import list (after `AskResponse,`); add to `qk` after the `ask:` line:

```ts
  askRecent: ["askRecent"] as const,
```

and after `useAsk`:

```ts
// Free (no AI): mounted only in Ask mode, so a short staleTime refreshes it each
// time the answer card closes.
export function useAskRecent() {
  return useQuery({
    queryKey: qk.askRecent,
    queryFn: () => api.get<AskRecentResponse>("/api/ask/recent"),
    staleTime: 30_000,
    retry: false,
  });
}
```

- [ ] **Step 4: Implement the component**

Create `web/src/components/AskHistory.tsx`:

```tsx
// Ask mode with no question open: this browser's past questions and the
// public "recently asked" list (answered questions only). Tapping an item
// asks it. Each list hides when empty; the recent list also hides on error.
import { useState } from "react";
import { useAskRecent } from "../api/queries";
import { clearAskHistory, readAskHistory } from "../lib/askHistory";

const HEAD = "mb-1.5 flex items-center justify-between font-mono text-[9px] tracking-[.5px] text-faint";
const ITEM = "block w-full truncate rounded-lg border border-line px-2.5 py-1.5 text-left text-[12px] text-ink hover:border-signal";

export function AskHistory({ onPick }: { onPick: (q: string) => void }) {
  const [mine, setMine] = useState(readAskHistory);
  const { data } = useAskRecent();
  const recent = data?.recent ?? [];
  if (!mine.length && !recent.length) return null;

  return (
    <div className="mb-3.5 flex flex-col gap-3">
      {mine.length > 0 && (
        <section>
          <div className={HEAD}>
            <span>YOUR QUESTIONS</span>
            <button
              type="button"
              aria-label="clear your questions"
              onClick={() => {
                clearAskHistory();
                setMine([]);
              }}
              className="text-dim hover:text-signal"
            >
              clear
            </button>
          </div>
          <div className="flex flex-col gap-1">
            {mine.map((q) => (
              <button key={q} type="button" onClick={() => onPick(q)} className={ITEM}>
                {q}
              </button>
            ))}
          </div>
        </section>
      )}
      {recent.length > 0 && (
        <section>
          <div className={HEAD}>
            <span>RECENTLY ASKED</span>
          </div>
          <div className="flex flex-col gap-1">
            {recent.map((r) => (
              <button key={r.question} type="button" onClick={() => onPick(r.question)} className={`${ITEM} flex items-center gap-2`}>
                <span className="min-w-0 flex-1 truncate">{r.question}</span>
                <span className="flex-none font-mono text-[10px] text-faint">
                  {r.sources} {r.sources === 1 ? "source" : "sources"}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Wire into Archive**

In `web/src/screens/Archive.tsx`, add imports:

```ts
import { AskHistory } from "../components/AskHistory";
import { addAskHistory } from "../lib/askHistory";
```

Replace `submitAsk` with `openAsk` + a thin `submitAsk`:

```ts
  // Ask one question: echo it in the box, remember it in this browser, and
  // write ?ask= (a history entry, so back returns to the lists).
  function openAsk(q: string) {
    setAskInput(q);
    addAskHistory(q);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("ask", q);
        return next;
      },
      { replace: false },
    );
  }

  function submitAsk(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!askMode) return;
    const q = askInput.replace(/\s+/g, " ").trim();
    if (q.length < 3) return;
    openAsk(q);
  }
```

Replace the answer line `{askMode && ask && <AskAnswer question={ask} />}` with:

```tsx
      {askMode && ask && <AskAnswer question={ask} />}
      {askMode && !ask && <AskHistory onPick={openAsk} />}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm -C web test -- ask.test`
Expected: PASS. Then `pnpm -C web test` — no new failures beyond the 8 known localStorage ones in the main checkout. If another test file renders Archive in Ask mode and fails with `No "useAskRecent" export is defined on the "../api/queries" mock`, add `useAskRecent: () => ({ data: undefined }),` to that file's `vi.mock("../api/queries", …)`.

- [ ] **Step 7: Typecheck and commit**

Run: `cd web && npx tsc -b` — expected: no output.

```bash
git status --short
git add web/src/api/types.ts web/src/api/queries.ts web/src/components/AskHistory.tsx web/src/screens/Archive.tsx web/src/tests/ask.test.tsx
git commit -m "feat(ask): your questions + recently asked lists in Ask mode"
```

---

### Task 4: Web — "⤴ post to a board" on answers

**Files:**
- Modify: `web/src/components/AskAnswer.tsx`
- Modify: `web/src/screens/Archive.tsx`
- Test: `web/src/tests/ask.test.tsx`

**Interfaces:**
- Consumes: `askComposerOpts(question, data)` (Task 2); `useOverlay().openComposer(opts: ComposerOpts)` (exists, `web/src/overlays/OverlayProvider.tsx`).
- Produces: `AskAnswer` props become `{ question: string; onPost?: (data: AskResponse) => void }`.

- [ ] **Step 1: Write the failing tests**

In `web/src/tests/ask.test.tsx`, add to the `vi.mock("../api/queries", …)` object (the Composer sheet calls these when it opens):

```ts
  useAddComment: () => ({ mutate: vi.fn(), isPending: false }),
  useAddCaseComment: () => ({ mutate: vi.fn(), isPending: false }),
  useReply: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateThread: () => ({ mutate: vi.fn(), isPending: false }),
```

Inside `describe("AskAnswer", …)` add:

```ts
  it("post to a board hands the answer to onPost; hidden without sources or without onPost", () => {
    useAskMock.mockReturnValue(answered);
    const onPost = vi.fn();
    const { rerender } = render(<MemoryRouter><AskAnswer question="what did radar see?" onPost={onPost} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "⤴ post to a board" }));
    expect(onPost).toHaveBeenCalledWith(answered.data);

    rerender(<MemoryRouter><AskAnswer question="what did radar see?" /></MemoryRouter>);
    expect(screen.queryByRole("button", { name: "⤴ post to a board" })).toBeNull();

    useAskMock.mockReturnValue({ ...answered, data: { ...answered.data, sources: [] } });
    rerender(<MemoryRouter><AskAnswer question="what did radar see?" onPost={onPost} /></MemoryRouter>);
    expect(screen.queryByRole("button", { name: "⤴ post to a board" })).toBeNull();
  });
```

Inside `describe("Archive ASK toggle", …)` add:

```ts
  it("post to a board opens the new-thread composer pre-filled from the answer", async () => {
    useAskMock.mockReturnValue(answered);
    renderAppAt("/archive?ask=what%20did%20radar%20see%3F");
    fireEvent.click(await screen.findByRole("button", { name: "⤴ post to a board" }));
    expect(await screen.findByPlaceholderText("Thread title")).toHaveValue("what did radar see?");
    const bodyBox = screen.getByPlaceholderText("Say your piece. Keep it sourced.") as HTMLTextAreaElement;
    expect(bodyBox.value).toContain("Radar tracked it DOE-UAP-D004 and pilots saw it WARGOV-VID-1.");
    expect(bodyBox.value).toContain("Sources: DOE-UAP-D004, WARGOV-VID-1");
    expect(screen.getByText("REFERENCING FILE")).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm -C web test -- ask.test`
Expected: FAIL — "Unable to find an accessible element with the role "button" and name "⤴ post to a board"".

- [ ] **Step 3: Implement the button**

In `web/src/components/AskAnswer.tsx`:

- Add the type import: `import type { AskResponse } from "../api/types";`
- Change the signature: `export function AskAnswer({ question, onPost }: { question: string; onPost?: (data: AskResponse) => void }) {`
- Replace the disclaimer `<div className="mt-2.5 font-mono text-[9.5px] text-faint">…</div>` block with:

```tsx
      <div className="mt-2.5 flex items-center gap-3">
        <span className="flex-1 font-mono text-[9.5px] text-faint">
          AI answer drawn from archive text &amp; OCR — can be wrong. Check the sources.
        </span>
        {onPost && data.sources.length > 0 && (
          <button
            type="button"
            onClick={() => onPost(data)}
            className="flex-none rounded-md border border-line2 px-2 py-0.5 font-mono text-[10px] text-signal hover:border-signal"
          >
            ⤴ post to a board
          </button>
        )}
      </div>
```

- [ ] **Step 4: Wire into Archive**

In `web/src/screens/Archive.tsx`, add imports:

```ts
import { useOverlay } from "../overlays/OverlayProvider";
import { askComposerOpts } from "../lib/askThread";
```

Inside `Archive()`, next to the other hooks (after `const { data: facets } = useFacets();`):

```ts
  const { openComposer } = useOverlay();
```

Change the answer line to:

```tsx
      {askMode && ask && <AskAnswer question={ask} onPost={(d) => openComposer(askComposerOpts(ask, d))} />}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm -C web test -- ask.test` — expected PASS. Then `pnpm -C web test` — no new failures; if `archive.test.tsx` or `pagetitle.test.tsx` now fails with "useOverlay must be used within an OverlayProvider", that test renders Archive outside `renderAppAt`; switch it to `renderAppAt` (which includes `OverlayProvider`).

- [ ] **Step 6: Typecheck and commit**

Run: `cd web && npx tsc -b` — expected: no output.

```bash
git status --short
git add web/src/components/AskAnswer.tsx web/src/screens/Archive.tsx web/src/tests/ask.test.tsx
git commit -m "feat(ask): post an answer to a board as a pre-filled new thread"
```

---

### Task 5: Verification in the browser

**Files:** none committed (temporary `.dev.vars` override only).

- [ ] **Step 1: Full test + typecheck in a clean worktree**

```bash
D=$(mktemp -d)/v && git worktree add --detach "$D" HEAD && cp .dev.vars "$D"/ 2>/dev/null
cd "$D" && pnpm install --frozen-lockfile && pnpm -C web install --frozen-lockfile
pnpm test:worker && pnpm -C web test && (cd web && npx tsc -b) && npx tsc --noEmit -p .
cd - && git worktree remove --force "$D"
```

Expected: all worker and web tests pass (0 failures), both typechecks silent.

- [ ] **Step 2: Local browser check**

Temporarily add `FEATURE_ASK=on` to `.dev.vars` (do not commit), start `worker-dev` and `web-dev-alt` via the preview tools, open `/archive`, press ASK:
- With no question: lists hidden (fresh storage; local Vectorize has no simulator so no answered rows).
- Seed one row locally: `npx wrangler d1 execute realufo-db --local --command "INSERT INTO ask_cache(key,answer) VALUES('0.45|test q','{\"question\":\"Test Q\",\"answer\":\"Seen [1]\",\"sources\":[{\"n\":1,\"record_id\":\"CIA-UAP-017\",\"title\":\"t\",\"page\":0,\"kind\":\"pdf\",\"thumb\":null}]}')"` → reload: "RECENTLY ASKED · Test Q · 1 source" shows; tap it → answer card (cache hit) with "⤴ post to a board"; tap → Composer with title "Test Q" and body containing `CIA-UAP-017`.
- Check console has no errors, and 375px width has no horizontal scroll.

Afterwards remove the `.dev.vars` override and delete the seeded row: `npx wrangler d1 execute realufo-db --local --command "DELETE FROM ask_cache WHERE key='0.45|test q'"`.

- [ ] **Step 3: Report**

Report to the user: commits, test counts, screenshots. Deploying is the user's call (`FEATURE_ASK` is `hidden` in production, so the new UI stays invisible until it is `on`).
