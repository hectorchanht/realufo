# Plan 007: "↩ reply" quotes a post, and `>>No` quote-links + backlinks work in threads

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 218df89..HEAD -- web/src/screens/Thread.tsx web/src/tests/thread.test.tsx`
> Plan 005 is expected to have changed `linkifyBody`'s URL branch; that is not drift. Anything else → compare against "Current state"; on mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: S–M
- **Risk**: LOW
- **Depends on**: plans/005-ask-shared-threads-link-sources.md (both edit `linkifyBody`; do 005 first)
- **Category**: direction (product request from the maintainer)
- **Planned at**: commit `218df89`, 2026-10-02

## Why this matters

realufo.org's boards are imageboard-style anonymous threads (posts show `No.24420082`). Every post shows a "↩ reply" label that does nothing (a code comment calls it "decorative"), and there is no way to see who answers whom — the original product brief listed "quote-linking" as a pillar. This plan uses the imageboard convention: "↩ reply" opens the reply composer pre-filled with `>>24420082`; in post bodies `>>N` becomes a link that scrolls to post N; each post lists its replies ("↳ >>A >>B"). Everything is derived from post bodies on the client — **no server or schema change**.

## Current state

- `web/src/screens/Thread.tsx`:
  - `:80-108` `BODY_TOKEN_RE` and `linkifyBody(body: string): ReactNode[]` — module-level; groups: 1 = URL, 2 = record id, 3 = moment suffix. (After plan 005 the URL branch also turns realufo.org `/doc/` URLs into embeds.)
  - `:110-116` `interface PostRowProps { post: Post; sourceRecord: ThreadSourceRecord | null; thread?: { id: string; votes: number } }`
  - `:119` `function PostRow({ post, sourceRecord, thread }: PostRowProps)`; root element at `:135` `<div data-post className="rounded-[14px] border …">`; meta row shows `{post.ago} · No.{post.no}` (`:155-157`); body `{linkifyBody(post.body)}` (`:191`).
  - `:194-206` footer:
    ```tsx
    <div className="mt-[10px] flex items-center gap-4 font-mono text-[11px]" style={{ clear: "both" }}>
      {thread ? (<VoteButton targetType="thread" … />) : (<VoteButton targetType="post" … />)}
      <span className="text-dim">credible</span>
      {/* prototype line 278 is a bare, unwired `<span>` … this stays decorative to match. */}
      <span className="text-faint">↩ reply</span>
    </div>
    ```
  - `:242-244` `function handleReply() { openComposer({ mode: "reply", threadId: id }); }` (sticky "Post a reply" bar).
  - `:281-283` `{posts.map((p) => (<PostRow key={p.id} post={p} sourceRecord={sourceRecord} thread={p.isOp ? thread : undefined} />))}`
- `Post.no: number` and `Post.body: string` (`web/src/api/types.ts:352-368`). Post numbers are 8-digit (`newNo()` in `worker/lib/anon.ts` → 24419000–24428000).
- Composer: `ComposerOpts.presetBody?: string` pre-fills the textarea for any mode (`web/src/overlays/Composer.tsx:57` `useState(composer?.presetBody ?? "")`).
- The page scrolls inside the app shell's `<main data-scroll>` container, so use `element.scrollIntoView(...)`, not `window.scrollTo`.
- Tests: `web/src/tests/thread.test.tsx` mocks `useThread` (fixture `mockThreadDetail`, posts `op1` no 42 and `post2`, lines 76-120) and `useOverlay` (`mockOpenComposer`, line 22-23); render helper `renderThread()`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Web tests | `cd web && NODE_OPTIONS=--no-experimental-webstorage npx vitest run` | all pass |
| Typecheck | `cd web && npx tsc -b` | exit 0 |
| Lint | `cd web && npx oxlint src` | 0 errors |

## Scope

**In scope**: `web/src/lib/quoteLinks.ts` (create), `web/src/screens/Thread.tsx`, `web/src/tests/quoteLinks.test.ts` (create), `web/src/tests/thread.test.tsx`

**Out of scope**: `worker/` (the unused `posts.reply_to` column stays unused — do not write it), `Composer.tsx`, record/case comments (flat by design for now).

## Git workflow

- Worktree branch `advisor/007-quote-links`; conventional commits (`feat(thread): …`); do NOT push.

## Steps

### Step 1: Pure helpers + tests

Create `web/src/lib/quoteLinks.ts`:
```ts
// Imageboard-style quote links: ">>24420082" in a post body points at post No.24420082.
export const QUOTE_SOURCE = String.raw`>>(\d{4,10})`;

export function quotedNos(body: string): number[] {
  return [...new Set([...body.matchAll(new RegExp(QUOTE_SOURCE, "g"))].map((m) => Number(m[1])))];
}

/** quoted No → the Nos of later posts in this thread that quote it (in post order). */
export function backlinks(posts: { no: number; body: string }[]): Map<number, number[]> {
  const inThread = new Set(posts.map((p) => p.no));
  const out = new Map<number, number[]>();
  for (const p of posts)
    for (const q of quotedNos(p.body))
      if (q !== p.no && inThread.has(q)) out.set(q, [...(out.get(q) ?? []), p.no]);
  return out;
}
```
Create `web/src/tests/quoteLinks.test.ts`: `quotedNos(">>123456 yes >>123456 and >>777777")` → `[123456, 777777]`; `backlinks([{no:1000,body:"op"},{no:2000,body:">>1000 agree"},{no:3000,body:">>1000 >>2000 >>9999"}])` → map `1000→[2000,3000]`, `2000→[3000]`, no key `9999`; a self-quote is ignored.

**Verify**: `cd web && NODE_OPTIONS=--no-experimental-webstorage npx vitest run src/tests/quoteLinks.test.ts` → pass.

### Step 2: Linkify `>>N`

- Extend `BODY_TOKEN_RE` with a 4th alternative appended at the end: `|${QUOTE_SOURCE}` → group 4 is the quoted number. Check the existing branches still read groups 1–3 correctly.
- Change the signature to `linkifyBody(body: string, nos: Set<number>)`. In the loop, when `m[4]` is set and `nos.has(Number(m[4]))`, push:
  ```tsx
  <a key={m.index} href={`#p${m[4]}`} className="text-cyan"
     onClick={(e) => { e.preventDefault(); document.getElementById(`p${m[4]}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); }}>
    &gt;&gt;{m[4]}
  </a>
  ```
  otherwise push the raw text `m[0]`.
- Update the comment above the regex.

### Step 3: PostRow — anchor, reply button, backlinks

- Props: add `nos: Set<number>`, `replies: number[]`, `onQuote: (no: number) => void`.
- Root `<div data-post …>` gets `id={\`p${post.no}\`}`.
- Body: `{linkifyBody(post.body, nos)}`.
- Replace the inert span (and its comment) with
  `<button type="button" onClick={() => onQuote(post.no)} className="text-dim hover:text-signal">↩ reply</button>`.
- After the footer row, when `replies.length`, render
  `<div className="mt-2 font-mono text-[10px] text-faint">↳ {replies.map((n) => <a key={n} href={`#p${n}`} … same onClick scroll … className="mr-2 text-cyan">&gt;&gt;{n}</a>)}</div>`.

### Step 4: Thread wiring

In `Thread()` after the not-found guard:
```ts
const nos = new Set(posts.map((p) => p.no));
const replyMap = backlinks(posts);
function handleQuote(no: number) {
  openComposer({ mode: "reply", threadId: id, presetBody: `>>${no}\n` });
}
```
Pass `nos={nos} replies={replyMap.get(p.no) ?? []} onQuote={handleQuote}` to each `PostRow`. (`posts` is the array already mapped at line ~281 — confirm its variable name.)

**Verify**: `cd web && npx tsc -b` → exit 0.

### Step 5: Thread tests

In `web/src/tests/thread.test.tsx` add (override the `useThread` mock like the test at line ~158 does):
1. A post with body `">>42 good point"` (42 = OP's `no`) renders a link with text `>>42` and `href="#p42"`; the OP row shows a backlink `>>{that post's no}`.
2. `>>99999999` (not in thread) renders as plain text (no link with that text).
3. Clicking the OP row's "↩ reply" button calls `mockOpenComposer` with `expect.objectContaining({ mode: "reply", threadId: "th1", presetBody: ">>42\n" })`.

**Verify**: full web test command → all pass; lint 0 errors.

## Test plan

Steps 1 and 5. Existing thread tests (record-id embeds, URLs, moments) must still pass — they cover the regex group shift.

## Done criteria

- [ ] `cd web && npx tsc -b` exits 0
- [ ] Full web suite passes incl. `quoteLinks.test.ts` and 3 new thread tests
- [ ] `grep -n 'text-faint">↩ reply' web/src/screens/Thread.tsx` → no matches
- [ ] `git diff --stat` shows no `worker/` changes
- [ ] `plans/README.md` row updated

## STOP conditions

- Adding the 4th regex alternative breaks an existing id/URL/moment test and the cause isn't a group-index mistake.
- `presetBody` is ignored for `mode: "reply"` in Composer (then report; do not edit Composer).

## Maintenance notes

- Quote links are body-derived; the server still never writes `posts.reply_to`. If server-side reply notifications are wanted later, parse `>>N` in `worker/routes/posts.ts` then.
- Reviewer: on a real thread, tap "↩ reply" on a post → composer opens with `>>No` on line 1; after posting, the quoted post shows "↳ >>yourNo" and tapping it scrolls to your post.
