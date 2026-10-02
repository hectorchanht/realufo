# Ask history + post an answer to a board — design

Date: 2026-10-02 · Builds on Spec 3 (`2026-10-02-realufo-ask-archive-design.md`).

## Goal

Ask the Archive gets two kinds of history and a way to turn an answer into a board thread:

1. **Your questions** — the questions this browser asked, so a user can reopen an earlier answer.
2. **Recently asked** — a public list of questions anyone asked that got a real answer.
3. **Post to a board** — an answer becomes a new thread whose post links and embeds its source files.

Agreed with the user: history = "mine + public"; the public list shows **answered questions only**; storage is
**approach A** (reuse `localStorage` and `ask_cache`, no migration).

## Non-goals

- Follow-up / multi-turn conversation.
- "Most asked" ranking or ask counts (would need an `ask_log` table — approach B).
- Moderation tools or a takedown endpoint for the public list.
- Cross-device history (users are anonymous).

## 1. Worker

### 1.1 Cached answers carry the question

`answer()` in `worker/routes/ask.ts` returns `{ answer, sources }`. The cached JSON gains the user's original
question text (after `normalizeQuestion`, before lowercasing):

```ts
body = { question: q, ...(await answer(env, q, min)) };
```

The `/api/ask` response therefore also returns `question`. Only answers with sources are cached (already true since
b20dea5), so `ask_cache` holds exactly the "answered only" set.

### 1.2 `GET /api/ask/recent`

New handler `recentAsks` in `worker/routes/ask.ts`, registered in `worker/index.ts` (`/api/ask` is an exact path,
so route order does not matter).

- Same flag gate as `/api/ask`: `FEATURE_ASK` not `on`/`hidden` → 503 `RESTING`.
- No AI calls, no rate-limit row, no daily-cap check.
- Query: rows of the **current threshold** only (keys are `${min}|${question}`), within the 7-day cache window,
  newest first, limit 20:

  ```sql
  SELECT key, answer, created_at FROM ask_cache
  WHERE key LIKE ? AND created_at >= datetime('now','-7 days')
  ORDER BY created_at DESC LIMIT 20
  ```

  bound with `${min}|%`.
- Response: `{ recent: [{ question, sources, asked_at }] }` where `question` is the cached `question` field, falling
  back to the key with its `${min}|` prefix removed (rows cached before this change are lowercase-only), `sources` is
  the number of sources, `asked_at` is `created_at`.
- A row whose JSON fails to parse is skipped.

`asked_at` is when the answer was cached, not the latest ask: a cache hit does not bump it. Acceptable for a
"recent" list.

## 2. Web

### 2.1 Types and query

- `AskResponse` gains `question?: string`.
- New `AskRecent { question: string; sources: number; asked_at: string }` and `useAskRecent(enabled)` in
  `api/queries.ts` (`GET /api/ask/recent`, key `["askRecent"]`, `staleTime` 30 s). The list mounts each time the
  answer card closes, so a stale list refetches then and a new question shows up without explicit invalidation.

### 2.2 Local history — `web/src/lib/askHistory.ts`

- `localStorage` key `realufo.askHistory`, a JSON array of question strings, newest first, max 20.
- `readAskHistory(): string[]`, `addAskHistory(q)` (dedupe case-insensitively, move to front, cap 20),
  `clearAskHistory()`.
- Every read/write wrapped in `try/catch`; on failure reads return `[]` and writes do nothing.
- Archive calls `addAskHistory(q)` in `submitAsk` (only when a question is actually submitted).

### 2.3 History lists — `web/src/components/AskHistory.tsx`

Shown on the Archive screen when **Ask mode is on and no question is open** (`askMode && !ask`), in place of the
answer card.

- **Your questions** — from `readAskHistory()`. Each item is a button; tapping sets `?ask=<question>` (same path as
  submitting). A small "clear" button calls `clearAskHistory()`. Hidden when empty.
- **Recently asked** — from `useAskRecent(askMode)`. Each item shows the question and "N sources"; tapping sets
  `?ask=`. Hidden when empty, loading, or errored.
- If both are empty, nothing renders.

Archive passes an `onPick(q)` callback that does what `submitAsk` does for a question (`setAskInput`, history add,
`?ask=` write).

### 2.4 Post to a board — in `AskAnswer.tsx`

A "⤴ post to a board" button at the bottom of the answer card, shown only when `data.sources.length > 0`. It calls
`openComposer` (from `useOverlay`) with:

| Field | Value |
|---|---|
| `mode` | `"newThread"` |
| `boardId` | `"uap"` (the default board, same as Doc) |
| `presetTitle` | the question, cut to 120 characters |
| `presetBody` | `askThreadBody(question, data)` — see below |
| `sourceRecordId` | record id of the first source |
| `refLabel` | title of the first source |

`askThreadBody` (pure, exported from `web/src/lib/askThread.ts`):

```
Q: <question>

<answer with every [n] replaced by the record id of source n>

Sources: <id1>, <id2>, …

— via Ask the Archive
```

- A citation `[n]` with no matching source is removed.
- Duplicate record ids in "Sources:" are listed once, in first-seen order.
- Record ids in the body are picked up by the thread screen's existing record-id embeds (link + inline media).

The user can edit everything in the Composer before posting. Posting uses the normal `createThread` path and its
rate limit.

## 3. Errors

- `/api/ask/recent` failing (503/500/network) → the "Recently asked" list is hidden; nothing else changes.
- `localStorage` unavailable → "Your questions" is empty and saving silently does nothing.
- No sources → no post button (not-covered answers never reach a board).

## 4. Testing

Worker (`worker/tests/ask.spec.ts`):
- `/api/ask` response and cache row include `question` in its original case.
- `/api/ask/recent` lists answered questions newest first, only for the current `ASK_MIN_SCORE`, falls back to the
  key text for rows without `question`, skips rows that fail to parse, and makes no AI calls.
- `/api/ask/recent` returns 503 when `FEATURE_ASK` is `off`.

Web:
- `askHistory`: add/dedupe (case-insensitive)/cap 20/clear; returns `[]` when `localStorage` throws.
- `askThreadBody`: replaces `[n]` with ids, drops unknown citations, dedupes the Sources line.
- Archive (Ask on, no `?ask=`): shows "Your questions" from storage and "Recently asked" from the mocked hook;
  tapping one sets `?ask=`; submitting saves to history.
- AskAnswer: "post to a board" opens the Composer with the preset title/body/sourceRecordId; button absent when
  there are no sources.

## 5. Rollout

Ships behind the existing `FEATURE_ASK` flag: with `hidden`, `/api/ask/recent` works but no UI shows; the lists and
the post button appear once the flag is `on`. No migration.
