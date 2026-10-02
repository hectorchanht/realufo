# Plan 005: Ask answers shared to a thread link their sources instead of dumping raw ids

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 218df89..HEAD -- web/src/lib/askThread.ts web/src/screens/Thread.tsx web/src/tests/askLib.test.ts web/src/tests/thread.test.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plan 007 also edits `linkifyBody` in Thread.tsx — run 005 first, or rebase carefully
- **Category**: bug
- **Planned at**: commit `218df89`, 2026-10-02

## Why this matters

"Ask the Archive" (AI Q&A over the records) lets a visitor post an answer as a new board thread. The answer's `[n]` citations are replaced with raw record ids inline, e.g. "…a classified project 255413270UFOsandDefenseWhatShouldwePrepareFor. Some witnesses…". The thread page only turns ids matching `XXX-UAP-D001` into links/embeds, and most ids don't match: all 95 AARO, 50 NARA, 4 NASA and 90 of 445 war.gov ids (e.g. `AARO-956955`, `NARA-Pentagon-Papers-Index`, `WARGOV-VID-111688723`, `255413270UFOsandDefenseWhatShouldwePrepareFor`; one id even contains a space: `AARO-Case_Resolution_of _Western_United_States_Uap_508-02262024.pdf`). Live example: https://realufo.org/thread/ut_414A673B. After this plan, the prose keeps readable `[n]` markers and a Sources list carries one realufo.org doc URL per source; the thread page renders realufo.org `/doc/` URLs as record embeds. This also makes any pasted realufo.org file link render as an embed.

## Current state

- `web/src/lib/askThread.ts:8-18`:
  ```ts
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
  ```
  `data.sources` items have `n: number`, `record_id: string`, `title` (see `AskResponse` in `web/src/api/types.ts`).
- `web/src/screens/Thread.tsx:80-108` — `BODY_TOKEN_RE` = `(https?://[^\s<>"]+)|(RECORD_ID)(?:MOMENT_SUFFIX)?`; `linkifyBody(body)` renders group 1 (URL) as an external `<a>` (after trimming trailing punctuation `/[.,;:!?)\]'"]+$/`), group 2 (record id) as `<RecordEmbed id t withMedia={!seen.has(id)} />` (media only on first mention), group 3 is the moment suffix parsed by `parseMoment`.
- `web/src/components/RecordEmbed.tsx:13` — `RecordEmbed({ id, t, withMedia })` fetches the record itself via `useRecord(id)`.
- `parseMoment` (from `web/src/lib/recordMedia.ts`) parses `"1:23.04"`-style strings; Doc pages read a moment from the `t` query param (`web/src/screens/Doc.tsx:214`: `parseMoment(searchParams.get("t"))`).
- Tests: `web/src/tests/askLib.test.ts:62-67` asserts the current body exactly; `web/src/tests/thread.test.tsx:189-230` covers id embeds and URL links.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Web tests | `cd web && NODE_OPTIONS=--no-experimental-webstorage npx vitest run` | all pass |
| Typecheck | `cd web && npx tsc -b` | exit 0 |

## Scope

**In scope**: `web/src/lib/askThread.ts`, `web/src/screens/Thread.tsx` (`linkifyBody` only), `web/src/tests/askLib.test.ts`, `web/src/tests/thread.test.tsx`

**Out of scope**:
- Rewriting existing posts in D1 (e.g. thread `ut_414A673B`) — operator decision; mention in your report.
- `RECORD_ID_RE` in `web/src/lib/recordMedia.ts` — keep as is (users type those ids).
- Worker SSR (`worker/lib/ssr.ts`) — it prints bodies as text; URLs are fine there.

## Git workflow

- Worktree branch `advisor/005-ask-sources`; conventional commits (`fix(ask): …`); do NOT push.

## Steps

### Step 1: New body format

Rewrite `askThreadBody`:
```ts
const SITE = "https://realufo.org";
export const docUrl = (id: string) => `${SITE}/doc/${encodeURIComponent(id)}`;

export function askThreadBody(question: string, data: Answer): string {
  const known = new Set(data.sources.map((s) => s.n));
  // keep [n] markers that have a source; drop dangling ones
  const answer = data.answer.replace(/\s*\[(\d+)\]/g, (m, d: string) => (known.has(Number(d)) ? m : "")).trim();
  const lines = data.sources.map((s) => `[${s.n}] ${docUrl(s.record_id)}`);
  return `Q: ${question}\n\n${answer}\n\nSources:\n${lines.join("\n")}\n\n— via Ask the Archive`;
}
```
Update the file header comment ("each [n] stays as a marker; the Sources list links each n to its file").

Update `askLib.test.ts:62-67` expectation to the new format, and add a case with id `"AARO-Case_Resolution_of _Western"` asserting the body contains `https://realufo.org/doc/AARO-Case_Resolution_of%20_Western`.

**Verify**: `cd web && NODE_OPTIONS=--no-experimental-webstorage npx vitest run src/tests/askLib.test.ts` → pass.

### Step 2: Thread renders realufo.org doc URLs as embeds

In `linkifyBody`, inside the URL branch after trimming punctuation:
```ts
const doc = /^https?:\/\/(?:www\.)?realufo\.org\/doc\/([^/?#\s]+)(?:\?([^#\s]*))?/.exec(tok);
if (doc) {
  const id = decodeURIComponent(doc[1]);
  const t = parseMoment(new URLSearchParams(doc[2] ?? "").get("t")) ?? undefined;
  out.push(<RecordEmbed key={m.index} id={id} t={t} withMedia={!seen.has(id)} />);
  seen.add(id);
} else {
  /* existing external <a> */
}
```
Wrap `decodeURIComponent` in try/catch; on failure fall back to the external link. Update the comment above `BODY_TOKEN_RE` to mention realufo.org doc URLs.

**Verify**: `cd web && npx tsc -b` → exit 0.

### Step 3: Thread test

In `web/src/tests/thread.test.tsx`, add a test modelled on "turns record ids in a post body into links with inline media (once per id)" (line 189): a post body `"see https://realufo.org/doc/NARA-Pentagon-Papers-Index and https://realufo.org/doc/AARO-956955."`; assert two `RecordEmbed` renders (follow how the existing test detects embeds — read lines 189-216 first) and that no external `<a href="https://realufo.org/doc/...">` with `target="_blank"` exists.

**Verify**: full web test command → all pass.

## Test plan

Steps 1 and 3. Existing URL/id tests in thread.test.tsx must still pass.

## Done criteria

- [ ] `cd web && npx tsc -b` exits 0
- [ ] Full web suite passes; new askLib + thread tests exist
- [ ] `grep -n 'Sources: \${ids' web/src/lib/askThread.ts` → no matches
- [ ] Only in-scope files changed
- [ ] `plans/README.md` row updated

## STOP conditions

- `AskResponse.sources` lacks `n` or `record_id`.
- The thread test's embed detection relies on mocks that make RecordEmbed impossible to detect for arbitrary ids — report instead of rewriting the mock setup.

## Maintenance notes

- Existing Ask-shared posts keep raw ids; an operator can fix them with a one-off SQL update if wanted.
- If the site domain changes, update `SITE` and the regex in Thread.tsx together.
- Reviewer: share an Ask answer citing an AARO file → thread shows the embed card, prose shows `[1]`.
