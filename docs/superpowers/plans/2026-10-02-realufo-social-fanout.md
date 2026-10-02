# Social Fan-out Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every X bot post (`x_posts` row) is automatically mirrored to Facebook Page, Instagram, Threads, Bluesky, YouTube Shorts and TikTok from the existing 3-hourly Worker cron.

**Architecture:** A new `social.tick` runs after `xbot.tick` in `scheduled()`. For each platform whose `FEATURE_SOCIAL_<P>` flag is `dry`/`on` it resumes in-flight rows, picks the oldest unmirrored `x_posts` row, inserts a `social_posts` row (UNIQUE(x_post_id, platform) = double-post guard) and calls that platform's adapter (`worker/lib/social/<p>.ts`). Rotating tokens live in D1 `social_auth`. A Python ingest step cuts 9:16 vertical clips for IG/YT/TikTok; a local Python script does the one-time OAuth.

**Tech Stack:** Cloudflare Workers (TypeScript, D1, R2), vitest + `@cloudflare/vitest-pool-workers`, Python 3 (stdlib + ffmpeg) for ingest, wrangler 4.

**Spec:** `docs/superpowers/specs/2026-10-02-realufo-social-fanout-design.md`

## Global Constraints

- X bot code (`worker/lib/xbot.ts`, `x.ts`, `xpick.ts`, `xcopy.ts`) and table `x_posts` are **not modified**. Social only reads `x_posts`.
- Migration number is **0017** (`0016_case_facts.sql` was taken by another chat). Re-run `ls db/migrations | tail -2` before committing Task 1; if 0017 is taken too, use the next free number everywhere this plan says 0017.
- Platforms (exact ids): `fb`, `ig`, `threads`, `bsky`, `yt`, `tiktok`.
- Flags: `FEATURE_SOCIAL_FB`, `FEATURE_SOCIAL_IG`, `FEATURE_SOCIAL_THREADS`, `FEATURE_SOCIAL_BSKY`, `FEATURE_SOCIAL_YT`, `FEATURE_SOCIAL_TIKTOK` = `off` | `dry` | `on`, default `off`.
- Mirror source: `x_posts.status IN ('posted','pending','processing')` AND `created_at >= SOCIAL_SINCE`. `SOCIAL_SINCE` empty → mirror nothing.
- One new post per platform per tick.
- YouTube cap: `YT_DAILY_MAX` (default `5`) rows with status `posted|processing|pending` in the rolling last 24 h; over cap → row `failed`, error `quota cap`.
- TikTok privacy from var `TIKTOK_PRIVACY` (default `SELF_ONLY`).
- Public media URL = `https://assets.realufo.org/<key>`. Vertical twin key = landscape key with `clips/` → `clips-v/`.
- Container/job still processing after 1 h → `failed`, error `processing timeout`.
- Retry: 429/5xx → `pending`, `attempts+1`, `failed` at 3. Other 4xx → `failed`. Auth error (HTTP 401, or Meta error code 190) → row **deleted**. Non-HTTP exception (network) → `pending`, `attempts=0`, never auto-retried.
- Text limits: threads 500 chars, bsky 300 graphemes, ig 2200, tiktok 2200, yt title 100 / description 5000.
- Logs are one-line JSON with `social: true` (mirrors xbot's `xbot: true`).
- Worker tests run under **Node 22**: prefix commands with `PATH=$HOME/.nvm/versions/node/v22.22.0/bin:$PATH` (default shell Node is 25; repo `engines` is `>=22 <23`).
- Worker tests inherit `wrangler.jsonc` prod vars via `cloudflare:test` env — every spec pins the vars it depends on.
- Other chats share this checkout: before each commit run `git status --short` and stage **only** the files the task lists.

**Deviations from the spec (deliberate, smaller or safer):**
1. Token refresh (spec §3 step 1, §5) happens lazily inside the threads/tiktok adapters via `token()`; a failed refresh of an *expired* token throws a 401 `SocialError`, so the row is deleted exactly like an auth error — same outcome as "skip platform, no row".
2. Rollout (spec §9 step 5) **keeps** the platform's `draft` rows when flipping to `on`. Drafts mark dry-period items as handled; deleting them would make the platform backfill every dry-period item one per tick.
3. The OAuth helper lives at `crawler/ingest/social_auth.py` (run `python -m ingest.social_auth …`) instead of `crawler/social_auth.py`, so it reuses `ingest.d1` and gets tested with the other ingest tests. It also gains `meta` and `bsky` subcommands that set the static secrets.
4. Instagram falls back to a photo when the vertical twin is missing (spec §7), using `xpick.mediaFor` to find the record's thumb.

## Review Focus

1. **Emoji before the link in Bluesky text** (X copy uses 📼 📍): link facet byte offsets must be UTF-8 byte offsets, not JS string indexes, or the wrong span becomes the link. → Task 2 test `bsky facet offsets are UTF-8 bytes with emoji before the link`.
2. **X text near 280 chars + a long `/doc/<id>` link on Bluesky / Threads**: trimming must cut the body, never the link. → Task 2 test `bsky trims the body, never the link`.
3. **A video item whose vertical twin isn't cut yet** (new video, CI vertical step not run): IG must post the thumb photo, YT/TikTok must record `no video`, nothing may throw. → Task 8 test `missing vertical twin: ig falls back to the thumb, yt records no video`.
4. **Network error after a publish request was sent**: the next tick must not post that item again. → Task 8 test `ambiguous network error parks the row and the next tick does not re-post`.
5. **Threads token past expiry with refresh failing vs. still valid with refresh failing**: expired → auth error (row deleted, retried later); still valid → keep posting with the old token. → Task 3 tests `refresh failure on a still-valid token keeps the old token` / `refresh failure on an expired token throws 401`.

---

## File Structure

| File | Responsibility |
|---|---|
| `db/migrations/0017_social_posts.sql` | `social_posts`, `social_auth` tables |
| `worker/env.ts` | new flags, vars, secrets |
| `wrangler.jsonc` | flag defaults `off`, `SOCIAL_SINCE`, `YT_DAILY_MAX`, `TIKTOK_PRIVACY` |
| `worker/lib/social/common.ts` | `Platform`, `SocialPost`, `SocialMedia`, `Adapter`, `Ctx`, `Sleep`, `SocialError`, `isAuth`, `readJson`, `log`, `CDN` |
| `worker/lib/social/text.ts` | pure per-platform text: `compose`, `linkOf`, `stripUrls`, `clip`, `graphemes`, `tagsFor`, `archiveOf`, `bskyFacets` |
| `worker/lib/social/auth.ts` | `token(env, platform, now)` — read/refresh `social_auth` |
| `worker/lib/social/meta.ts` | Graph helpers + container flow shared by fb/ig/threads; exports `fb`, `ig`, `threads` adapters |
| `worker/lib/social/bsky.ts` | Bluesky adapter |
| `worker/lib/social/yt.ts` | YouTube adapter |
| `worker/lib/social/tiktok.ts` | TikTok adapter |
| `worker/lib/social/tick.ts` | orchestration: resume, pick, gate, insert, publish, error handling; `ADAPTERS` registry |
| `worker/index.ts` | `scheduled()` runs xbot then social |
| `worker/tests/social-*.spec.ts` | tests per unit |
| `crawler/ingest/clips.py` | `--vertical` path |
| `crawler/ingest/social_auth.py` | one-time OAuth / secret setup CLI |
| `.github/workflows/ingest.yml` | DejaVu font + vertical clips step |

---

### Task 1: Schema, env, flags

**Files:**
- Create: `db/migrations/0017_social_posts.sql`
- Modify: `worker/tests/schema.spec.ts:4` (EXPECTED) and add one test
- Modify: `worker/env.ts` (append fields)
- Modify: `wrangler.jsonc` (`vars`)

**Interfaces:**
- Produces: tables `social_posts(id, x_post_id, platform, status, remote_id, container_id, error, attempts, created_at)` UNIQUE(x_post_id, platform); `social_auth(platform PK, access_token, refresh_token, expires_at, updated_at)`. `Env` fields listed in Step 3.

- [ ] **Step 1: Write the failing schema test**

In `worker/tests/schema.spec.ts` replace the `EXPECTED` line with:

```ts
const EXPECTED = ["archives","ask_cache","ask_log","assets","boards","cases","comments","posts","presence","rate_events","record_links","record_text","records","sightings","social_auth","social_posts","stats","text_index","threads","ticker","users","votes","x_posts"];
```

and add inside `describe("schema", …)`:

```ts
  it("social_posts dedupes on (x_post_id, platform) and checks platform/status", async () => {
    const x = await env.DB.prepare("INSERT INTO x_posts(stream,ref,text,ai,cost_usd,status) VALUES ('pick','SP-1','t',0,0.015,'posted') RETURNING id").first<{ id: number }>();
    const ins = (platform: string, status = "draft") =>
      env.DB.prepare("INSERT INTO social_posts(x_post_id,platform,status) VALUES (?,?,?)").bind(x!.id, platform, status).run();
    await ins("bsky");
    await expect(ins("bsky")).rejects.toThrow(/UNIQUE/);
    await expect(ins("myspace")).rejects.toThrow(/CHECK/);
    await expect(ins("fb", "bogus")).rejects.toThrow(/CHECK/);
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `PATH=$HOME/.nvm/versions/node/v22.22.0/bin:$PATH pnpm test:worker worker/tests/schema.spec.ts`
Expected: FAIL — `no such table: social_posts` and the table list mismatch.

- [ ] **Step 3: Write the migration, env and vars**

`db/migrations/0017_social_posts.sql`:

```sql
-- Spec 5: social fan-out. One row per (x_posts row, platform) ever attempted; the
-- UNIQUE is the double-post guard (row is inserted BEFORE the platform is called).
CREATE TABLE social_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  x_post_id INTEGER NOT NULL REFERENCES x_posts(id),
  platform TEXT NOT NULL CHECK(platform IN ('fb','ig','threads','bsky','yt','tiktok')),
  status TEXT NOT NULL CHECK(status IN ('draft','pending','processing','posted','failed')),
  remote_id TEXT,
  container_id TEXT,
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(x_post_id, platform)
);
CREATE INDEX idx_social_posts_platform ON social_posts(platform, status);

-- Rotating OAuth tokens (threads, tiktok); the Worker can't rewrite its own secrets.
CREATE TABLE social_auth (
  platform TEXT PRIMARY KEY,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TEXT,           -- UTC 'YYYY-MM-DD HH:MM:SS'
  updated_at TEXT DEFAULT (datetime('now'))
);
```

Append to the `Env` interface in `worker/env.ts` (before the closing `}`):

```ts
  // Social fan-out (Spec 5): each off | dry | on
  FEATURE_SOCIAL_FB?: string;
  FEATURE_SOCIAL_IG?: string;
  FEATURE_SOCIAL_THREADS?: string;
  FEATURE_SOCIAL_BSKY?: string;
  FEATURE_SOCIAL_YT?: string;
  FEATURE_SOCIAL_TIKTOK?: string;
  SOCIAL_SINCE?: string; // "YYYY-MM-DD"; x_posts created before it are never mirrored; empty = mirror nothing
  YT_DAILY_MAX?: string; // default "5" (Data API quota ≈ 6 uploads/day)
  TIKTOK_PRIVACY?: string; // SELF_ONLY until TikTok's audit passes, then PUBLIC_TO_EVERYONE
  META_PAGE_ID?: string; // secrets
  META_PAGE_TOKEN?: string;
  IG_USER_ID?: string;
  THREADS_USER_ID?: string;
  BSKY_HANDLE?: string;
  BSKY_APP_PASSWORD?: string;
  YT_CLIENT_ID?: string;
  YT_CLIENT_SECRET?: string;
  YT_REFRESH_TOKEN?: string;
  TIKTOK_CLIENT_KEY?: string;
  TIKTOK_CLIENT_SECRET?: string;
```

In `wrangler.jsonc` `vars`, after `"X_SINCE": "2026-10-02"` add (keep it on the same object):

```jsonc
    ,
    // Social fan-out (Spec 5): mirrors x_posts to other platforms. off | dry | on per platform.
    "FEATURE_SOCIAL_FB": "off", "FEATURE_SOCIAL_IG": "off", "FEATURE_SOCIAL_THREADS": "off",
    "FEATURE_SOCIAL_BSKY": "off", "FEATURE_SOCIAL_YT": "off", "FEATURE_SOCIAL_TIKTOK": "off",
    "SOCIAL_SINCE": "", "YT_DAILY_MAX": "5", "TIKTOK_PRIVACY": "SELF_ONLY"
```

(Concretely: the `vars` line ending `"X_SINCE": "2026-10-02" },` becomes `"X_SINCE": "2026-10-02",` followed by the two comment/flag lines above and `"SOCIAL_SINCE": "", "YT_DAILY_MAX": "5", "TIKTOK_PRIVACY": "SELF_ONLY" },`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `PATH=$HOME/.nvm/versions/node/v22.22.0/bin:$PATH pnpm test:worker worker/tests/schema.spec.ts`
Expected: PASS. Then `npx tsc --noEmit -p worker` (or the repo's worker tsconfig if `-p worker` errors: `npx tsc --noEmit`) → no errors.

- [ ] **Step 5: Commit**

```bash
ls db/migrations | tail -2   # confirm 0017 is still ours
git status --short
git add db/migrations/0017_social_posts.sql worker/tests/schema.spec.ts worker/env.ts wrangler.jsonc
git commit -m "feat(social): social_posts + social_auth tables, flags (all off)"
```

---

### Task 2: Per-platform text (pure)

**Files:**
- Create: `worker/lib/social/common.ts`
- Create: `worker/lib/social/text.ts`
- Test: `worker/tests/social-text.spec.ts`

**Interfaces:**
- Produces (`common.ts`):
  ```ts
  export type Platform = "fb" | "ig" | "threads" | "bsky" | "yt" | "tiktok";
  export type Sleep = (ms: number) => Promise<void>;
  export type Ctx = { now: Date; sleep: Sleep };
  export type SocialMedia = { kind: "video" | "image"; key: string; url: string; size: number };
  export type SocialPost = { text: string; title: string; link: string | null; media: SocialMedia | null };
  export type Published = { remoteId: string } | { containerId: string };
  export type Finished = { remoteId: string } | "processing";
  export interface Adapter {
    needs: "video" | "media" | "any"; // yt/tiktok need video; ig needs any media; others post text too
    vertical: boolean;                // use the clips-v/ twin
    configured(env: Env): boolean;    // secrets present (checked only in `on` mode)
    publish(env: Env, p: SocialPost, ctx: Ctx): Promise<Published>;
    finish?(env: Env, p: SocialPost, containerId: string, ctx: Ctx): Promise<Finished>;
  }
  export class SocialError extends Error { status: number; body: string }
  export const isAuth: (e: SocialError) => boolean;
  export async function readJson(res: Response): Promise<any>; // throws SocialError(res.status, body) when !res.ok
  export const log: (o: Record<string, unknown>) => void;
  export const CDN = "https://assets.realufo.org/";
  export const wait: Sleep;
  ```
- Produces (`text.ts`): `linkOf(text): string | null`, `stripUrls(text): string`, `graphemes(s): number`, `clip(s, max, count?): string`, `tagsFor(archive): string`, `archiveOf(media: string | null): string | null`, `compose(p: Platform, xText: string, archive: string | null): { text: string; title: string; link: string | null }`, `bskyFacets(text): Facet[]`.

- [ ] **Step 1: Write the failing tests**

`worker/tests/social-text.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { compose, linkOf, stripUrls, clip, graphemes, bskyFacets, archiveOf, tagsFor } from "../lib/social/text";

const LINK = "https://realufo.org/doc/DOW-UAP-PR019";
const X = `📼 Gulf of Oman, 2023: the orb that wouldn't quit\n📍 Dept. of War · 30 s clip\n${LINK}`;

describe("social text", () => {
  it("linkOf / stripUrls", () => {
    expect(linkOf(X)).toBe(LINK);
    expect(linkOf("no link here")).toBeNull();
    expect(stripUrls(X)).toBe("📼 Gulf of Oman, 2023: the orb that wouldn't quit\n📍 Dept. of War · 30 s clip");
  });

  it("archiveOf reads the archive segment of an x_posts.media value", () => {
    expect(archiveOf("clip:clips/wargov/V1.mp4")).toBe("wargov");
    expect(archiveOf("thumb:images/aaro/x.png")).toBe("aaro");
    expect(archiveOf(null)).toBeNull();
    expect(tagsFor("aaro")).toBe("#UFO #UAP #Pentagon #declassified #AARO");
    expect(tagsFor(null)).toBe("#UFO #UAP #Pentagon #declassified");
  });

  it("fb / threads keep the link at the end", () => {
    expect(compose("fb", X, "wargov").text).toBe(`${stripUrls(X)}\n\n${LINK}`);
    expect(compose("threads", X, "wargov").text.endsWith(`\n\n${LINK}`)).toBe(true);
  });

  it("ig drops the dead link for 'link in bio' + tags", () => {
    const t = compose("ig", X, "wargov").text;
    expect(t).not.toContain("https://");
    expect(t).toContain("🔗 link in bio");
    expect(t.endsWith("#UFO #UAP #Pentagon #declassified #DeptOfWar")).toBe(true);
  });

  it("ig without a link says nothing about a bio", () => {
    expect(compose("ig", "just text", null).text).toBe("just text\n\n#UFO #UAP #Pentagon #declassified");
  });

  it("yt: title is the first line (≤100), description keeps link + tags", () => {
    const c = compose("yt", X, "wargov");
    expect(c.title).toBe("📼 Gulf of Oman, 2023: the orb that wouldn't quit");
    expect(c.text).toContain(LINK);
    expect(c.text.endsWith("#DeptOfWar")).toBe(true);
    expect(compose("yt", "a".repeat(150), null).title.length).toBeLessThanOrEqual(100);
  });

  it("tiktok: no link, tags appended, ≤2200", () => {
    const t = compose("tiktok", X, "nasa").text;
    expect(t).not.toContain("https://");
    expect(t.endsWith("#NASA")).toBe(true);
    expect(compose("tiktok", "b".repeat(5000), null).text.length).toBeLessThanOrEqual(2200);
  });

  it("bsky trims the body, never the link", () => {
    const long = `${"🛸 word ".repeat(60)}\n${LINK}`;
    const t = compose("bsky", long, null).text;
    expect(graphemes(t)).toBeLessThanOrEqual(300);
    expect(t.endsWith(`…\n\n${LINK}`)).toBe(true);
  });

  it("threads trims to 500 keeping the link", () => {
    const t = compose("threads", `${"x".repeat(700)} ${LINK}`, null).text;
    expect(t.length).toBeLessThanOrEqual(500);
    expect(t.endsWith(LINK)).toBe(true);
  });

  it("bsky facet offsets are UTF-8 bytes with emoji before the link", () => {
    const t = `📼 orb\n\n${LINK}`;
    const [f] = bskyFacets(t);
    const bytes = new TextEncoder().encode(t);
    expect(new TextDecoder().decode(bytes.slice(f.index.byteStart, f.index.byteEnd))).toBe(LINK);
    expect(f.features[0]).toEqual({ $type: "app.bsky.richtext.facet#link", uri: LINK });
    expect(bskyFacets("no links")).toEqual([]);
  });

  it("clip leaves short text alone and ends long text with …", () => {
    expect(clip("short", 10)).toBe("short");
    const c = clip("abcdefghijkl", 8);
    expect(c).toBe("abcdefg…");
    expect(c.length).toBe(8);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `PATH=$HOME/.nvm/versions/node/v22.22.0/bin:$PATH pnpm test:worker worker/tests/social-text.spec.ts`
Expected: FAIL — cannot resolve `../lib/social/text`.

- [ ] **Step 3: Implement**

`worker/lib/social/common.ts`:

```ts
import type { Env } from "../../env";

// Shared types for the social fan-out (Spec 5). Adapters throw SocialError for
// HTTP errors; anything else (network) is treated as "may have posted".

export type Platform = "fb" | "ig" | "threads" | "bsky" | "yt" | "tiktok";
export type Sleep = (ms: number) => Promise<void>;
export type Ctx = { now: Date; sleep: Sleep };
export type SocialMedia = { kind: "video" | "image"; key: string; url: string; size: number };
export type SocialPost = { text: string; title: string; link: string | null; media: SocialMedia | null };
export type Published = { remoteId: string } | { containerId: string };
export type Finished = { remoteId: string } | "processing";

export interface Adapter {
  needs: "video" | "media" | "any";
  vertical: boolean;
  configured(env: Env): boolean;
  publish(env: Env, p: SocialPost, ctx: Ctx): Promise<Published>;
  finish?(env: Env, p: SocialPost, containerId: string, ctx: Ctx): Promise<Finished>;
}

export class SocialError extends Error {
  constructor(public status: number, public body: string) {
    super(`social ${status}: ${body.slice(0, 300)}`);
  }
}

// Meta returns expired/revoked tokens as HTTP 400 with error code 190.
export const isAuth = (e: SocialError) => e.status === 401 || /"code"\s*:\s*190\b/.test(e.body);

export async function readJson(res: Response): Promise<any> {
  const body = await res.text();
  if (!res.ok) throw new SocialError(res.status, body);
  try {
    return JSON.parse(body);
  } catch {
    throw new SocialError(502, `non-JSON response: ${body.slice(0, 200)}`);
  }
}

export const log = (o: Record<string, unknown>) => console.log(JSON.stringify({ social: true, ...o }));
export const CDN = "https://assets.realufo.org/";
export const wait: Sleep = (ms) => new Promise((r) => setTimeout(r, ms));
```

`worker/lib/social/text.ts`:

```ts
import type { Platform } from "./common";

// Per-platform copy from the X text (Spec 5 §3.2). Pure; no I/O.

const URL_RE = /https?:\/\/\S+/g;
const SITE_TAGS = "#UFO #UAP #Pentagon #declassified";
const ARCHIVE_TAG: Record<string, string> = { wargov: "#DeptOfWar", aaro: "#AARO", nara: "#NationalArchives", nasa: "#NASA" };

export type Facet = { index: { byteStart: number; byteEnd: number }; features: { $type: string; uri: string }[] };

export const linkOf = (text: string): string | null => text.match(URL_RE)?.[0] ?? null;
export const stripUrls = (text: string) => text.replace(URL_RE, "").replace(/[ \t]+$/gm, "").trim();

const seg = (s: string) => [...new Intl.Segmenter().segment(s)].map((x) => x.segment);
export const graphemes = (s: string) => seg(s).length;

// Trim to `max` (measured by `count`), ending with "…". ponytail: O(n²) pop loop, inputs are ≤ a few KB.
export function clip(s: string, max: number, count: (t: string) => number = (t) => t.length): string {
  if (count(s) <= max) return s;
  const parts = seg(s);
  while (parts.length && count(parts.join("").trimEnd() + "…") > max) parts.pop();
  return parts.join("").trimEnd() + "…";
}

export const tagsFor = (archive: string | null) => [SITE_TAGS, ARCHIVE_TAG[archive ?? ""]].filter(Boolean).join(" ");

// "clip:clips/wargov/V1.mp4" | "thumb:images/aaro/x.png" → "wargov" | "aaro"
export const archiveOf = (media: string | null) => media?.slice(media.indexOf(":") + 1).split("/")[1] ?? null;

export function compose(p: Platform, xText: string, archive: string | null): { text: string; title: string; link: string | null } {
  const link = linkOf(xText);
  const base = stripUrls(xText);
  const tags = tagsFor(archive);
  const title = clip(base.split("\n")[0].trim() || base, 100);
  const tail = (t: string) => (link ? `${t}\n\n${link}` : t);
  const room = (max: number, suffix: string, count?: (t: string) => number) => clip(base, max - (count ?? ((t: string) => t.length))(suffix), count) + suffix;
  switch (p) {
    case "fb":
      return { text: tail(base), title, link };
    case "threads":
      return { text: room(500, link ? `\n\n${link}` : ""), title, link };
    case "bsky":
      return { text: room(300, link ? `\n\n${link}` : "", graphemes), title, link };
    case "ig":
      return { text: room(2200, `${link ? "\n\n🔗 link in bio" : ""}\n\n${tags}`), title, link };
    case "yt":
      return { text: room(5000, `${link ? `\n\n${link}` : ""}\n\n${tags}`), title, link };
    case "tiktok":
      return { text: room(2200, `\n\n${tags}`), title, link };
  }
}

export function bskyFacets(text: string): Facet[] {
  const enc = new TextEncoder();
  return [...text.matchAll(URL_RE)].map((m) => {
    const byteStart = enc.encode(text.slice(0, m.index)).length;
    return { index: { byteStart, byteEnd: byteStart + enc.encode(m[0]).length }, features: [{ $type: "app.bsky.richtext.facet#link", uri: m[0] }] };
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `PATH=$HOME/.nvm/versions/node/v22.22.0/bin:$PATH pnpm test:worker worker/tests/social-text.spec.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git status --short
git add worker/lib/social/common.ts worker/lib/social/text.ts worker/tests/social-text.spec.ts
git commit -m "feat(social): shared adapter types and per-platform copy"
```

---

### Task 3: Rotating tokens (`social_auth`)

**Files:**
- Create: `worker/lib/social/auth.ts`
- Test: `worker/tests/social-auth.spec.ts`

**Interfaces:**
- Consumes: `SocialError`, `readJson`, `log` from `common.ts`; `sqlTime` from `worker/lib/xpick.ts` (`(d: Date) => "YYYY-MM-DD HH:MM:SS"`).
- Produces: `export async function token(env: Env, platform: "threads" | "tiktok", now: Date): Promise<string>` — returns a usable access token, refreshing (and persisting) when it expires within 7 days (threads) / 1 hour (tiktok). Throws `SocialError(401, …)` when there is no row, or when the token is expired and refresh failed.

- [ ] **Step 1: Write the failing tests**

`worker/tests/social-auth.spec.ts`:

```ts
import { env, applyD1Migrations } from "cloudflare:test";
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { token } from "../lib/social/auth";
import { SocialError } from "../lib/social/common";

beforeAll(() => applyD1Migrations(env.DB, env.TEST_MIGRATIONS));

const NOW = new Date("2026-10-10T12:00:00Z");
const E = { ...env, TIKTOK_CLIENT_KEY: "ck", TIKTOK_CLIENT_SECRET: "cs" } as any;
const put = (platform: string, access: string, expires: string | null, refresh: string | null = null) =>
  env.DB.prepare("INSERT INTO social_auth(platform,access_token,refresh_token,expires_at) VALUES (?,?,?,?)").bind(platform, access, refresh, expires).run();
const row = (p: string) => env.DB.prepare("SELECT * FROM social_auth WHERE platform=?").bind(p).first<any>();

let calls: string[] = [];
let refreshStatus = 200;
beforeEach(async () => {
  await env.DB.prepare("DELETE FROM social_auth").run();
  calls = []; refreshStatus = 200;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any, init?: any) => {
    const u = String(input);
    calls.push(u.split("?")[0]);
    if (refreshStatus !== 200) return new Response('{"error":"nope"}', { status: refreshStatus });
    if (u.startsWith("https://graph.threads.net/refresh_access_token")) return Response.json({ access_token: "TH2", expires_in: 5184000 });
    if (u === "https://open.tiktokapis.com/v2/oauth/token/") {
      expect(String(init.body)).toContain("grant_type=refresh_token");
      return Response.json({ access_token: "TT2", expires_in: 86400, refresh_token: "RT2" });
    }
    throw new Error("unexpected fetch " + u);
  });
});
afterEach(() => vi.restoreAllMocks());

describe("token", () => {
  it("no row → 401", async () => {
    await expect(token(E, "threads", NOW)).rejects.toMatchObject({ status: 401 });
  });
  it("fresh token is returned without a refresh", async () => {
    await put("threads", "TH1", "2026-11-30 00:00:00");
    expect(await token(E, "threads", NOW)).toBe("TH1");
    expect(calls).toEqual([]);
  });
  it("threads within 7 days of expiry refreshes and persists", async () => {
    await put("threads", "TH1", "2026-10-14 00:00:00");
    expect(await token(E, "threads", NOW)).toBe("TH2");
    expect(await row("threads")).toMatchObject({ access_token: "TH2", expires_at: "2026-12-09 12:00:00" });
  });
  it("tiktok within 1 h refreshes and stores the new refresh token", async () => {
    await put("tiktok", "TT1", "2026-10-10 12:30:00", "RT1");
    expect(await token(E, "tiktok", NOW)).toBe("TT2");
    expect(await row("tiktok")).toMatchObject({ access_token: "TT2", refresh_token: "RT2", expires_at: "2026-10-11 12:00:00" });
  });
  it("refresh failure on a still-valid token keeps the old token", async () => {
    await put("threads", "TH1", "2026-10-12 00:00:00");
    refreshStatus = 500;
    expect(await token(E, "threads", NOW)).toBe("TH1");
  });
  it("refresh failure on an expired token throws 401", async () => {
    await put("tiktok", "TT1", "2026-10-10 11:00:00", "RT1");
    refreshStatus = 400;
    const e = await token(E, "tiktok", NOW).catch((x) => x);
    expect(e).toBeInstanceOf(SocialError);
    expect(e.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `PATH=$HOME/.nvm/versions/node/v22.22.0/bin:$PATH pnpm test:worker worker/tests/social-auth.spec.ts`
Expected: FAIL — cannot resolve `../lib/social/auth`.

- [ ] **Step 3: Implement**

`worker/lib/social/auth.ts`:

```ts
import type { Env } from "../../env";
import { sqlTime } from "../xpick";
import { SocialError, readJson, log } from "./common";

// Rotating tokens (Spec 5 §5). Threads: 60-day token, refresh when < 7 days left.
// TikTok: 24 h access + 365 d refresh token, refresh when < 1 h left.

type Rotating = "threads" | "tiktok";
type Row = { access_token: string; refresh_token: string | null; expires_at: string | null };
type Fresh = { access: string; refresh?: string; expiresIn: number };
const LEAD: Record<Rotating, number> = { threads: 7 * 86400_000, tiktok: 3600_000 };

async function refreshThreads(access: string): Promise<Fresh> {
  const q = new URLSearchParams({ grant_type: "th_refresh_token", access_token: access });
  const j = await readJson(await fetch(`https://graph.threads.net/refresh_access_token?${q}`));
  return { access: j.access_token, expiresIn: j.expires_in };
}

async function refreshTikTok(env: Env, refresh: string): Promise<Fresh> {
  const body = new URLSearchParams({ client_key: env.TIKTOK_CLIENT_KEY ?? "", client_secret: env.TIKTOK_CLIENT_SECRET ?? "", grant_type: "refresh_token", refresh_token: refresh });
  const j = await readJson(await fetch("https://open.tiktokapis.com/v2/oauth/token/", { method: "POST", body }));
  if (!j.access_token) throw new SocialError(400, JSON.stringify(j).slice(0, 300));
  return { access: j.access_token, refresh: j.refresh_token, expiresIn: j.expires_in };
}

export async function token(env: Env, platform: Rotating, now: Date): Promise<string> {
  const row = await env.DB.prepare("SELECT access_token, refresh_token, expires_at FROM social_auth WHERE platform=?").bind(platform).first<Row>();
  if (!row) throw new SocialError(401, `no ${platform} token in social_auth (run python -m ingest.social_auth ${platform})`);
  const exp = row.expires_at ? Date.parse(row.expires_at.replace(" ", "T") + "Z") : Infinity;
  if (exp - now.getTime() > LEAD[platform]) return row.access_token;
  try {
    const t = platform === "threads" ? await refreshThreads(row.access_token) : await refreshTikTok(env, row.refresh_token ?? "");
    await env.DB.prepare("UPDATE social_auth SET access_token=?, refresh_token=coalesce(?, refresh_token), expires_at=?, updated_at=? WHERE platform=?")
      .bind(t.access, t.refresh ?? null, sqlTime(new Date(now.getTime() + t.expiresIn * 1000)), sqlTime(now), platform).run();
    log({ platform, refreshed: true });
    return t.access;
  } catch (e) {
    log({ platform, refreshFailed: String(e).slice(0, 200) });
    if (exp > now.getTime()) return row.access_token;
    throw new SocialError(401, `${platform} token expired and refresh failed`);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `PATH=$HOME/.nvm/versions/node/v22.22.0/bin:$PATH pnpm test:worker worker/tests/social-auth.spec.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git status --short
git add worker/lib/social/auth.ts worker/tests/social-auth.spec.ts
git commit -m "feat(social): rotating threads/tiktok tokens in social_auth"
```

---

### Task 4: Meta adapters (Facebook Page, Instagram, Threads)

**Files:**
- Create: `worker/lib/social/meta.ts`
- Test: `worker/tests/social-meta.spec.ts`

**Interfaces:**
- Consumes: `Adapter`, `SocialPost`, `Ctx`, `Published`, `Finished`, `SocialError`, `readJson` (`common.ts`); `token` (`auth.ts`).
- Produces: `export const fb: Adapter; export const ig: Adapter; export const threads: Adapter;` plus `GRAPH = "https://graph.facebook.com/v23.0"`, `THREADS_API = "https://graph.threads.net/v1.0"`.
- Behaviour: fb publishes synchronously (`{ remoteId }`). ig/threads create a container, poll its status up to 6 × 10 s (`ctx.sleep`), publish when `FINISHED`, else return `{ containerId }`; `finish()` polls once: `FINISHED` → publish → `{ remoteId }`, `IN_PROGRESS` → `"processing"`, `ERROR`/`EXPIRED` → throws `SocialError(422, "container ERROR")`.

Before implementing, re-check field names against current docs: Pages API (`/{page-id}/videos` `file_url`, `/photos` `url`, `/feed`), Instagram Content Publishing (`media_type=REELS`, `video_url`, `image_url`, `status_code`, `media_publish`), Threads API (`media_type`, `text`, `status`, `threads_publish`). Adjust only names, not structure.

- [ ] **Step 1: Write the failing tests**

`worker/tests/social-meta.spec.ts`:

```ts
import { env, applyD1Migrations } from "cloudflare:test";
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { fb, ig, threads } from "../lib/social/meta";
import type { SocialPost } from "../lib/social/common";

beforeAll(() => applyD1Migrations(env.DB, env.TEST_MIGRATIONS));

const NOW = new Date("2026-10-10T12:00:00Z");
const ctx = { now: NOW, sleep: async () => {} };
const E = { ...env, META_PAGE_ID: "PG", META_PAGE_TOKEN: "PT", IG_USER_ID: "IG", THREADS_USER_ID: "TU" } as any;
const video = { kind: "video" as const, key: "clips/wargov/V1.mp4", url: "https://assets.realufo.org/clips/wargov/V1.mp4", size: 100 };
const image = { kind: "image" as const, key: "thumbs/wargov/I1.jpg", url: "https://assets.realufo.org/thumbs/wargov/I1.jpg", size: 100 };
const P = (media: SocialPost["media"]): SocialPost => ({ text: "hello", title: "hello", link: "https://realufo.org/doc/V1", media });

let calls: { url: string; body: string }[] = [];
let status = "FINISHED";
let fail: { match: string; code: number; body: string } | null = null;
beforeEach(async () => {
  await env.DB.prepare("DELETE FROM social_auth").run();
  await env.DB.prepare("INSERT INTO social_auth(platform,access_token,expires_at) VALUES ('threads','TH','2027-01-01 00:00:00')").run();
  calls = []; status = "FINISHED"; fail = null;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any, init?: any) => {
    const url = String(input);
    calls.push({ url: url.split("?")[0], body: String(init?.body ?? url.split("?")[1] ?? "") });
    if (fail && url.includes(fail.match)) return new Response(fail.body, { status: fail.code });
    if (url.includes("/PG/videos")) return Response.json({ id: "FBV" });
    if (url.includes("/PG/photos")) return Response.json({ id: "FBP", post_id: "PG_FBP" });
    if (url.includes("/PG/feed")) return Response.json({ id: "PG_FEED" });
    if (url.endsWith("/IG/media") || url.endsWith("/TU/threads")) return Response.json({ id: "C1" });
    if (url.includes("/C1?")) return Response.json({ status_code: status, status });
    if (url.endsWith("/media_publish") || url.endsWith("/threads_publish")) return Response.json({ id: "PUB1" });
    throw new Error("unexpected fetch " + url);
  });
});
afterEach(() => vi.restoreAllMocks());

describe("fb", () => {
  it("video → /videos with file_url and description", async () => {
    expect(await fb.publish(E, P(video), ctx)).toEqual({ remoteId: "FBV" });
    expect(calls[0].url).toBe("https://graph.facebook.com/v23.0/PG/videos");
    expect(calls[0].body).toContain("file_url=https%3A%2F%2Fassets.realufo.org%2Fclips%2Fwargov%2FV1.mp4");
    expect(calls[0].body).toContain("access_token=PT");
  });
  it("image → /photos (post_id preferred); none → /feed with link", async () => {
    expect(await fb.publish(E, P(image), ctx)).toEqual({ remoteId: "PG_FBP" });
    expect(await fb.publish(E, P(null), ctx)).toEqual({ remoteId: "PG_FEED" });
    expect(calls[1].body).toContain("link=https%3A%2F%2Frealufo.org%2Fdoc%2FV1");
  });
  it("Meta code 190 surfaces as an auth SocialError", async () => {
    fail = { match: "/PG/videos", code: 400, body: '{"error":{"code":190,"message":"expired"}}' };
    await expect(fb.publish(E, P(video), ctx)).rejects.toMatchObject({ status: 400 });
  });
  it("configured needs page id + token", () => {
    expect(fb.configured(E)).toBe(true);
    expect(fb.configured({ ...E, META_PAGE_TOKEN: undefined })).toBe(false);
  });
});

describe("ig", () => {
  it("vertical, needs media; finished container publishes in the same call", async () => {
    expect(ig.vertical).toBe(true);
    expect(ig.needs).toBe("media");
    expect(await ig.publish(E, P(video), ctx)).toEqual({ remoteId: "PUB1" });
    expect(calls[0].body).toContain("media_type=REELS");
    expect(calls.map((c) => c.url.replace("https://graph.facebook.com/v23.0", ""))).toEqual(["/IG/media", "/C1", "/IG/media_publish"]);
  });
  it("image uses image_url, no media_type", async () => {
    await ig.publish(E, P(image), ctx);
    expect(calls[0].body).toContain("image_url=");
    expect(calls[0].body).not.toContain("media_type");
  });
  it("still IN_PROGRESS after polling → containerId; finish later", async () => {
    status = "IN_PROGRESS";
    expect(await ig.publish(E, P(video), ctx)).toEqual({ containerId: "C1" });
    expect(await ig.finish!(E, P(video), "C1", ctx)).toBe("processing");
    status = "FINISHED";
    expect(await ig.finish!(E, P(video), "C1", ctx)).toEqual({ remoteId: "PUB1" });
  });
  it("ERROR container → 422", async () => {
    status = "ERROR";
    await expect(ig.finish!(E, P(video), "C1", ctx)).rejects.toMatchObject({ status: 422 });
  });
});

describe("threads", () => {
  it("uses the social_auth token on graph.threads.net; TEXT when no media", async () => {
    expect(await threads.publish(E, P(null), ctx)).toEqual({ remoteId: "PUB1" });
    expect(calls[0].url).toBe("https://graph.threads.net/v1.0/TU/threads");
    expect(calls[0].body).toContain("media_type=TEXT");
    expect(calls[0].body).toContain("access_token=TH");
    expect(calls.at(-1)!.url).toBe("https://graph.threads.net/v1.0/TU/threads_publish");
  });
  it("video → VIDEO + video_url", async () => {
    await threads.publish(E, P(video), ctx);
    expect(calls[0].body).toContain("media_type=VIDEO");
    expect(calls[0].body).toContain("video_url=");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `PATH=$HOME/.nvm/versions/node/v22.22.0/bin:$PATH pnpm test:worker worker/tests/social-meta.spec.ts`
Expected: FAIL — cannot resolve `../lib/social/meta`.

- [ ] **Step 3: Implement**

`worker/lib/social/meta.ts`:

```ts
import type { Env } from "../../env";
import { SocialError, readJson, type Adapter, type Ctx, type Finished, type Published, type SocialPost } from "./common";
import { token } from "./auth";

// Facebook Page, Instagram and Threads (Spec 5 §4). IG and Threads publish in two
// steps: create a media container, wait for it to process, then publish it.

export const GRAPH = "https://graph.facebook.com/v23.0";
export const THREADS_API = "https://graph.threads.net/v1.0";
const POLLS = 6;
const POLL_MS = 10_000;

async function graph(url: string, params: Record<string, string>, method: "GET" | "POST" = "POST"): Promise<any> {
  const q = new URLSearchParams(params);
  return readJson(method === "GET" ? await fetch(`${url}?${q}`) : await fetch(url, { method, body: q }));
}

type Box = { base: string; user: string; token: string; statusField: "status_code" | "status"; publish: "media_publish" | "threads_publish" };

async function finishBox(b: Box, id: string): Promise<Finished> {
  const s = (await graph(`${b.base}/${id}`, { fields: b.statusField, access_token: b.token }, "GET"))[b.statusField];
  if (s === "IN_PROGRESS") return "processing";
  if (s !== "FINISHED") throw new SocialError(422, `container ${s}`);
  const r = await graph(`${b.base}/${b.user}/${b.publish}`, { creation_id: id, access_token: b.token });
  return { remoteId: String(r.id) };
}

async function boxFlow(b: Box, params: Record<string, string>, ctx: Ctx, path: "media" | "threads"): Promise<Published> {
  const { id } = await graph(`${b.base}/${b.user}/${path}`, { ...params, access_token: b.token });
  for (let i = 0; i < POLLS; i++) {
    const f = await finishBox(b, String(id));
    if (f !== "processing") return f;
    await ctx.sleep(POLL_MS);
  }
  return { containerId: String(id) };
}

export const fb: Adapter = {
  needs: "any",
  vertical: false,
  configured: (env) => !!(env.META_PAGE_ID && env.META_PAGE_TOKEN),
  async publish(env, p) {
    const base = `${GRAPH}/${env.META_PAGE_ID}`;
    const access_token = env.META_PAGE_TOKEN!;
    const r =
      p.media?.kind === "video" ? await graph(`${base}/videos`, { file_url: p.media.url, description: p.text, access_token })
      : p.media ? await graph(`${base}/photos`, { url: p.media.url, caption: p.text, access_token })
      : await graph(`${base}/feed`, { message: p.text, ...(p.link ? { link: p.link } : {}), access_token });
    return { remoteId: String(r.post_id ?? r.id) };
  },
};

const igBox = (env: Env): Box => ({ base: GRAPH, user: env.IG_USER_ID!, token: env.META_PAGE_TOKEN!, statusField: "status_code", publish: "media_publish" });
const igParams = (p: SocialPost): Record<string, string> =>
  p.media!.kind === "video" ? { media_type: "REELS", video_url: p.media!.url, caption: p.text } : { image_url: p.media!.url, caption: p.text };

export const ig: Adapter = {
  needs: "media",
  vertical: true,
  configured: (env) => !!(env.IG_USER_ID && env.META_PAGE_TOKEN),
  publish: (env, p, ctx) => boxFlow(igBox(env), igParams(p), ctx, "media"),
  finish: (env, _p, id) => finishBox(igBox(env), id),
};

const threadsBox = async (env: Env, now: Date): Promise<Box> =>
  ({ base: THREADS_API, user: env.THREADS_USER_ID!, token: await token(env, "threads", now), statusField: "status", publish: "threads_publish" });
const threadsParams = (p: SocialPost): Record<string, string> =>
  p.media?.kind === "video" ? { media_type: "VIDEO", video_url: p.media.url, text: p.text }
  : p.media ? { media_type: "IMAGE", image_url: p.media.url, text: p.text }
  : { media_type: "TEXT", text: p.text };

export const threads: Adapter = {
  needs: "any",
  vertical: false,
  configured: (env) => !!env.THREADS_USER_ID,
  publish: async (env, p, ctx) => boxFlow(await threadsBox(env, ctx.now), threadsParams(p), ctx, "threads"),
  finish: async (env, _p, id, ctx) => finishBox(await threadsBox(env, ctx.now), id),
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `PATH=$HOME/.nvm/versions/node/v22.22.0/bin:$PATH pnpm test:worker worker/tests/social-meta.spec.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git status --short
git add worker/lib/social/meta.ts worker/tests/social-meta.spec.ts
git commit -m "feat(social): Facebook Page, Instagram and Threads adapters"
```

---

### Task 5: Bluesky adapter

**Files:**
- Create: `worker/lib/social/bsky.ts`
- Test: `worker/tests/social-bsky.spec.ts`

**Interfaces:**
- Consumes: `Adapter`, `SocialPost`, `Ctx`, `SocialError`, `readJson` (`common.ts`); `bskyFacets` (`text.ts`); `env.MEDIA` (R2).
- Produces: `export const bsky: Adapter` (`needs: "any"`, `vertical: false`).
- Flow (verify against https://docs.bsky.app/docs/tutorials/video before coding):
  1. `POST https://bsky.social/xrpc/com.atproto.server.createSession` `{identifier, password}` → `{ accessJwt, did, didDoc }`.
  2. Video: `GET {entryway}/xrpc/com.atproto.server.getServiceAuth?aud=did:web:<pds host>&lxm=com.atproto.repo.uploadBlob&exp=<now+1800>` → `{ token }`; `POST https://video.bsky.app/xrpc/app.bsky.video.uploadVideo?did=<did>&name=<id>.mp4` (Bearer service token, body = R2 bytes) → `{ jobId }` (a 409 body carries `jobId` too); poll `GET https://video.bsky.app/xrpc/app.bsky.video.getJobStatus?jobId=` up to 6 × 10 s → `jobStatus.state === "JOB_STATE_COMPLETED"` + `jobStatus.blob`. Not done → `{ containerId: jobId }`; `finish()` polls once more and posts.
  3. Image ≤ 1 000 000 bytes: `POST com.atproto.repo.uploadBlob` (Bearer accessJwt, Content-Type = R2 content type) → `{ blob }`. Larger image → post text only.
  4. `POST com.atproto.repo.createRecord` `{ repo: did, collection: "app.bsky.feed.post", record: { $type, text, createdAt, langs: ["en"], facets, embed } }` → `{ uri }` = `remoteId`.

- [ ] **Step 1: Write the failing tests**

`worker/tests/social-bsky.spec.ts`:

```ts
import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { bsky } from "../lib/social/bsky";
import type { SocialPost } from "../lib/social/common";

const ctx = { now: new Date("2026-10-10T12:00:00Z"), sleep: async () => {} };
const E = { ...env, BSKY_HANDLE: "realufo.org", BSKY_APP_PASSWORD: "app-pw" } as any;
const LINK = "https://realufo.org/doc/V1";
const P = (media: SocialPost["media"]): SocialPost => ({ text: `📼 orb\n\n${LINK}`, title: "orb", link: LINK, media });

let calls: string[] = [];
let record: any = null;
let jobState = "JOB_STATE_COMPLETED";
beforeEach(async () => {
  await env.MEDIA.put("clips/wargov/V1.mp4", new Uint8Array(1000));
  await env.MEDIA.put("thumbs/wargov/I1.jpg", new Uint8Array(500), { httpMetadata: { contentType: "image/jpeg" } });
  calls = []; record = null; jobState = "JOB_STATE_COMPLETED";
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any, init?: any) => {
    const u = String(input);
    calls.push(u.split("?")[0].replace(/^https:\/\/[^/]+\/xrpc\//, ""));
    if (u.endsWith("createSession")) return Response.json({ accessJwt: "JWT", did: "did:plc:abc", didDoc: { service: [{ id: "#atproto_pds", serviceEndpoint: "https://morel.us-east.host.bsky.network" }] } });
    if (u.includes("getServiceAuth")) { expect(u).toContain("aud=did%3Aweb%3Amorel.us-east.host.bsky.network"); return Response.json({ token: "SVC" }); }
    if (u.includes("uploadVideo")) { expect(init.headers.Authorization).toBe("Bearer SVC"); return Response.json({ jobId: "J1", state: "JOB_STATE_CREATED" }); }
    if (u.includes("getJobStatus")) return Response.json({ jobStatus: { jobId: "J1", state: jobState, ...(jobState === "JOB_STATE_COMPLETED" ? { blob: { ref: "VB" } } : {}) } });
    if (u.endsWith("uploadBlob")) return Response.json({ blob: { ref: "IB" } });
    if (u.endsWith("createRecord")) { record = JSON.parse(init.body).record; return Response.json({ uri: "at://did:plc:abc/app.bsky.feed.post/1" }); }
    throw new Error("unexpected fetch " + u);
  });
});
afterEach(() => vi.restoreAllMocks());

const video = { kind: "video" as const, key: "clips/wargov/V1.mp4", url: "https://assets.realufo.org/clips/wargov/V1.mp4", size: 1000 };

describe("bsky", () => {
  it("text post carries a link facet", async () => {
    expect(await bsky.publish(E, P(null), ctx)).toEqual({ remoteId: "at://did:plc:abc/app.bsky.feed.post/1" });
    expect(record.text).toBe(`📼 orb\n\n${LINK}`);
    expect(record.facets[0].features[0].uri).toBe(LINK);
    expect(record.embed).toBeUndefined();
  });
  it("video goes through the video service and embeds the processed blob", async () => {
    await bsky.publish(E, P(video), ctx);
    expect(calls).toEqual(["com.atproto.server.createSession", "com.atproto.server.getServiceAuth", "app.bsky.video.uploadVideo", "app.bsky.video.getJobStatus", "com.atproto.repo.createRecord"]);
    expect(record.embed).toEqual({ $type: "app.bsky.embed.video", video: { ref: "VB" } });
  });
  it("video still processing → containerId, finish posts later", async () => {
    jobState = "JOB_STATE_ENCODING";
    expect(await bsky.publish(E, P(video), ctx)).toEqual({ containerId: "J1" });
    expect(await bsky.finish!(E, P(video), "J1", ctx)).toBe("processing");
    jobState = "JOB_STATE_COMPLETED";
    expect(await bsky.finish!(E, P(video), "J1", ctx)).toEqual({ remoteId: "at://did:plc:abc/app.bsky.feed.post/1" });
  });
  it("failed job → 422", async () => {
    jobState = "JOB_STATE_FAILED";
    await expect(bsky.finish!(E, P(video), "J1", ctx)).rejects.toMatchObject({ status: 422 });
  });
  it("small image → uploadBlob + images embed with alt text; >1 MB image → text only", async () => {
    await bsky.publish(E, P({ kind: "image", key: "thumbs/wargov/I1.jpg", url: "u", size: 500 }), ctx);
    expect(record.embed).toEqual({ $type: "app.bsky.embed.images", images: [{ alt: "orb", image: { ref: "IB" } }] });
    await bsky.publish(E, P({ kind: "image", key: "thumbs/wargov/I1.jpg", url: "u", size: 2_000_000 }), ctx);
    expect(record.embed).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `PATH=$HOME/.nvm/versions/node/v22.22.0/bin:$PATH pnpm test:worker worker/tests/social-bsky.spec.ts`
Expected: FAIL — cannot resolve `../lib/social/bsky`.

- [ ] **Step 3: Implement**

`worker/lib/social/bsky.ts`:

```ts
import type { Env } from "../../env";
import { SocialError, readJson, type Adapter, type Ctx, type Finished, type SocialPost } from "./common";
import { bskyFacets } from "./text";

// Bluesky (Spec 5 §4). Videos go through video.bsky.app (processed, then embedded);
// images ≤1 MB via uploadBlob. A new session per call: accessJwt is short-lived.

const ENTRY = "https://bsky.social/xrpc";
const VIDEO = "https://video.bsky.app/xrpc";
const IMAGE_MAX = 1_000_000;
const POLLS = 6;
const POLL_MS = 10_000;

type Session = { accessJwt: string; did: string; didDoc?: { service?: { serviceEndpoint: string }[] } };

const session = async (env: Env): Promise<Session> =>
  readJson(await fetch(`${ENTRY}/com.atproto.server.createSession`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: env.BSKY_HANDLE, password: env.BSKY_APP_PASSWORD }),
  }));

async function bytes(env: Env, key: string) {
  const o = await env.MEDIA.get(key);
  if (!o) throw new SocialError(404, `media missing in R2: ${key}`);
  return { body: await o.arrayBuffer(), type: o.httpMetadata?.contentType ?? "image/jpeg" };
}

async function job(s: Session, jobId: string): Promise<{ ref: unknown } | "processing"> {
  const { jobStatus } = await readJson(await fetch(`${VIDEO}/app.bsky.video.getJobStatus?jobId=${encodeURIComponent(jobId)}`, { headers: { Authorization: `Bearer ${s.accessJwt}` } }));
  if (jobStatus.state === "JOB_STATE_COMPLETED" && jobStatus.blob) return jobStatus.blob;
  if (jobStatus.state === "JOB_STATE_FAILED") throw new SocialError(422, `bsky video job failed: ${jobStatus.error ?? ""}`);
  return "processing";
}

async function uploadVideo(env: Env, s: Session, key: string, now: Date): Promise<string> {
  const pds = new URL(s.didDoc?.service?.[0]?.serviceEndpoint ?? "https://bsky.social").host;
  const q = new URLSearchParams({ aud: `did:web:${pds}`, lxm: "com.atproto.repo.uploadBlob", exp: String(Math.floor(now.getTime() / 1000) + 1800) });
  const { token } = await readJson(await fetch(`${ENTRY}/com.atproto.server.getServiceAuth?${q}`, { headers: { Authorization: `Bearer ${s.accessJwt}` } }));
  const { body } = await bytes(env, key);
  const name = key.split("/").pop()!;
  const res = await fetch(`${VIDEO}/app.bsky.video.uploadVideo?${new URLSearchParams({ did: s.did, name })}`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "video/mp4" }, body,
  });
  const text = await res.text();
  const j = (() => { try { return JSON.parse(text); } catch { return {}; } })();
  if (!res.ok && !(res.status === 409 && j.jobId)) throw new SocialError(res.status, text); // 409 = same video already uploaded
  return String(j.jobId);
}

async function post(s: Session, p: SocialPost, now: Date, embed?: unknown) {
  const facets = bskyFacets(p.text);
  const record = { $type: "app.bsky.feed.post", text: p.text, createdAt: now.toISOString(), langs: ["en"], ...(facets.length ? { facets } : {}), ...(embed ? { embed } : {}) };
  const r = await readJson(await fetch(`${ENTRY}/com.atproto.repo.createRecord`, {
    method: "POST", headers: { Authorization: `Bearer ${s.accessJwt}`, "Content-Type": "application/json" },
    body: JSON.stringify({ repo: s.did, collection: "app.bsky.feed.post", record }),
  }));
  return { remoteId: String(r.uri) };
}

const videoEmbed = (blob: unknown) => ({ $type: "app.bsky.embed.video", video: blob });

export const bsky: Adapter = {
  needs: "any",
  vertical: false,
  configured: (env) => !!(env.BSKY_HANDLE && env.BSKY_APP_PASSWORD),
  async publish(env, p, ctx: Ctx) {
    const s = await session(env);
    if (p.media?.kind === "video") {
      const jobId = await uploadVideo(env, s, p.media.key, ctx.now);
      for (let i = 0; i < POLLS; i++) {
        const blob = await job(s, jobId);
        if (blob !== "processing") return post(s, p, ctx.now, videoEmbed(blob));
        await ctx.sleep(POLL_MS);
      }
      return { containerId: jobId };
    }
    if (p.media && p.media.size <= IMAGE_MAX) {
      const { body, type } = await bytes(env, p.media.key);
      const { blob } = await readJson(await fetch(`${ENTRY}/com.atproto.repo.uploadBlob`, { method: "POST", headers: { Authorization: `Bearer ${s.accessJwt}`, "Content-Type": type }, body }));
      return post(s, p, ctx.now, { $type: "app.bsky.embed.images", images: [{ alt: p.title, image: blob }] });
    }
    return post(s, p, ctx.now);
  },
  async finish(env, p, jobId, ctx): Promise<Finished> {
    const s = await session(env);
    const blob = await job(s, jobId);
    return blob === "processing" ? "processing" : post(s, p, ctx.now, videoEmbed(blob));
  },
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `PATH=$HOME/.nvm/versions/node/v22.22.0/bin:$PATH pnpm test:worker worker/tests/social-bsky.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git status --short
git add worker/lib/social/bsky.ts worker/tests/social-bsky.spec.ts
git commit -m "feat(social): Bluesky adapter (video service, images, link facets)"
```

---

### Task 6: YouTube adapter

**Files:**
- Create: `worker/lib/social/yt.ts`
- Test: `worker/tests/social-yt.spec.ts`

**Interfaces:**
- Consumes: `Adapter`, `SocialError`, `readJson` (`common.ts`); `env.MEDIA`.
- Produces: `export const yt: Adapter` (`needs: "video"`, `vertical: true`, no `finish` — upload is synchronous).
- Flow: `POST https://oauth2.googleapis.com/token` (form: client_id, client_secret, refresh_token, grant_type=refresh_token) → `access_token` (a 400 `invalid_grant` is mapped to `SocialError(401)` so the row is deleted); `POST https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status` with JSON metadata + `X-Upload-Content-Type: video/mp4` + `X-Upload-Content-Length` → `Location` header; `PUT <Location>` with the R2 bytes → `{ id }`. Title = `p.title + " #Shorts"` when that fits in 100 chars. Category `28` (Science & Technology). `privacyStatus: "public"`, `selfDeclaredMadeForKids: false`.

- [ ] **Step 1: Write the failing tests**

`worker/tests/social-yt.spec.ts`:

```ts
import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { yt } from "../lib/social/yt";

const ctx = { now: new Date("2026-10-10T12:00:00Z"), sleep: async () => {} };
const E = { ...env, YT_CLIENT_ID: "ci", YT_CLIENT_SECRET: "cs", YT_REFRESH_TOKEN: "rt" } as any;
const video = { kind: "video" as const, key: "clips-v/wargov/V1.mp4", url: "https://assets.realufo.org/clips-v/wargov/V1.mp4", size: 1234 };
const P = (title = "Gulf orb") => ({ text: "desc https://realufo.org/doc/V1", title, link: "https://realufo.org/doc/V1", media: video });

let meta: any = null;
let tokenStatus = 200;
let putBytes = 0;
beforeEach(async () => {
  await env.MEDIA.put("clips-v/wargov/V1.mp4", new Uint8Array(1234));
  meta = null; tokenStatus = 200; putBytes = 0;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any, init?: any) => {
    const u = String(input);
    if (u === "https://oauth2.googleapis.com/token")
      return tokenStatus === 200 ? Response.json({ access_token: "AT" }) : new Response('{"error":"invalid_grant"}', { status: tokenStatus });
    if (u.startsWith("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable")) {
      expect(init.headers.Authorization).toBe("Bearer AT");
      expect(init.headers["X-Upload-Content-Length"]).toBe("1234");
      meta = JSON.parse(init.body);
      return new Response(null, { status: 200, headers: { Location: "https://upload.example/session1" } });
    }
    if (u === "https://upload.example/session1") { putBytes = (init.body as ArrayBuffer).byteLength; return Response.json({ id: "YT1" }); }
    throw new Error("unexpected fetch " + u);
  });
});
afterEach(() => vi.restoreAllMocks());

describe("yt", () => {
  it("needs a vertical video", () => {
    expect(yt.needs).toBe("video");
    expect(yt.vertical).toBe(true);
  });
  it("resumable upload from R2 with #Shorts title", async () => {
    expect(await yt.publish(E, P(), ctx)).toEqual({ remoteId: "YT1" });
    expect(meta.snippet).toMatchObject({ title: "Gulf orb #Shorts", description: "desc https://realufo.org/doc/V1", categoryId: "28" });
    expect(meta.status).toEqual({ privacyStatus: "public", selfDeclaredMadeForKids: false });
    expect(putBytes).toBe(1234);
  });
  it("long title skips #Shorts", async () => {
    await yt.publish(E, P("t".repeat(95)), ctx);
    expect(meta.snippet.title).toBe("t".repeat(95));
  });
  it("invalid_grant on token refresh → 401 auth error", async () => {
    tokenStatus = 400;
    await expect(yt.publish(E, P(), ctx)).rejects.toMatchObject({ status: 401 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `PATH=$HOME/.nvm/versions/node/v22.22.0/bin:$PATH pnpm test:worker worker/tests/social-yt.spec.ts`
Expected: FAIL — cannot resolve `../lib/social/yt`.

- [ ] **Step 3: Implement**

`worker/lib/social/yt.ts`:

```ts
import type { Env } from "../../env";
import { SocialError, readJson, type Adapter } from "./common";

// YouTube Shorts (Spec 5 §4). Access token minted from the refresh token every call
// (1 h lifetime, never stored). Until Google's API audit passes, uploads are locked private.

async function accessToken(env: Env): Promise<string> {
  const body = new URLSearchParams({ client_id: env.YT_CLIENT_ID!, client_secret: env.YT_CLIENT_SECRET!, refresh_token: env.YT_REFRESH_TOKEN!, grant_type: "refresh_token" });
  const res = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body });
  if (res.status === 400) throw new SocialError(401, await res.text()); // invalid_grant: refresh token revoked/expired
  return (await readJson(res)).access_token;
}

export const yt: Adapter = {
  needs: "video",
  vertical: true,
  configured: (env) => !!(env.YT_CLIENT_ID && env.YT_CLIENT_SECRET && env.YT_REFRESH_TOKEN),
  async publish(env, p) {
    const auth = `Bearer ${await accessToken(env)}`;
    const obj = await env.MEDIA.get(p.media!.key);
    if (!obj) throw new SocialError(404, `media missing in R2: ${p.media!.key}`);
    const title = p.title.length + 8 <= 100 ? `${p.title} #Shorts` : p.title;
    const init = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": "video/mp4", "X-Upload-Content-Length": String(obj.size) },
      body: JSON.stringify({ snippet: { title, description: p.text, categoryId: "28" }, status: { privacyStatus: "public", selfDeclaredMadeForKids: false } }),
    });
    if (!init.ok) throw new SocialError(init.status, await init.text());
    const loc = init.headers.get("Location");
    if (!loc) throw new SocialError(502, "resumable upload: no Location header");
    const r = await readJson(await fetch(loc, { method: "PUT", headers: { "Content-Type": "video/mp4" }, body: await obj.arrayBuffer() }));
    return { remoteId: String(r.id) };
  },
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `PATH=$HOME/.nvm/versions/node/v22.22.0/bin:$PATH pnpm test:worker worker/tests/social-yt.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git status --short
git add worker/lib/social/yt.ts worker/tests/social-yt.spec.ts
git commit -m "feat(social): YouTube Shorts adapter (resumable upload from R2)"
```

---

### Task 7: TikTok adapter

**Files:**
- Create: `worker/lib/social/tiktok.ts`
- Test: `worker/tests/social-tiktok.spec.ts`

**Interfaces:**
- Consumes: `Adapter`, `SocialError`, `readJson` (`common.ts`); `token` (`auth.ts`).
- Produces: `export const tiktok: Adapter` (`needs: "video"`, `vertical: true`). `publish` → `{ containerId: publish_id }` always; `finish` → `PUBLISH_COMPLETE` → `{ remoteId: publicaly_available_post_id[0] ?? publish_id }`, `FAILED` → `SocialError(422)`, else `"processing"`.
- Flow (verify against TikTok Content Posting API docs before coding): `POST https://open.tiktokapis.com/v2/post/publish/creator_info/query/` → `data.privacy_level_options`; privacy from `env.TIKTOK_PRIVACY || "SELF_ONLY"` must be in that list, else `SocialError(400)`; `POST …/v2/post/publish/video/init/` `{ post_info: { title, privacy_level, disable_comment: false, disable_duet: false, disable_stitch: false }, source_info: { source: "PULL_FROM_URL", video_url } }` → `data.publish_id`; `POST …/v2/post/publish/status/fetch/` `{ publish_id }` → `data.status`. Every response has `error.code`; anything other than `"ok"` is an error even with HTTP 200.

- [ ] **Step 1: Write the failing tests**

`worker/tests/social-tiktok.spec.ts`:

```ts
import { env, applyD1Migrations } from "cloudflare:test";
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { tiktok } from "../lib/social/tiktok";

beforeAll(() => applyD1Migrations(env.DB, env.TEST_MIGRATIONS));

const ctx = { now: new Date("2026-10-10T12:00:00Z"), sleep: async () => {} };
const E = (extra = {}) => ({ ...env, TIKTOK_CLIENT_KEY: "ck", TIKTOK_CLIENT_SECRET: "cs", TIKTOK_PRIVACY: "SELF_ONLY", ...extra }) as any;
const P = { text: "orb #UFO", title: "orb", link: null, media: { kind: "video" as const, key: "clips-v/wargov/V1.mp4", url: "https://assets.realufo.org/clips-v/wargov/V1.mp4", size: 10 } };

let init: any = null;
let status = "PUBLISH_COMPLETE";
let initError = "ok";
beforeEach(async () => {
  await env.DB.prepare("DELETE FROM social_auth").run();
  await env.DB.prepare("INSERT INTO social_auth(platform,access_token,refresh_token,expires_at) VALUES ('tiktok','TT','RT','2026-10-11 00:00:00')").run();
  init = null; status = "PUBLISH_COMPLETE"; initError = "ok";
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any, req?: any) => {
    const u = String(input);
    expect(req.headers.Authorization).toBe("Bearer TT");
    if (u.endsWith("/creator_info/query/")) return Response.json({ data: { privacy_level_options: ["SELF_ONLY", "PUBLIC_TO_EVERYONE"] }, error: { code: "ok" } });
    if (u.endsWith("/video/init/")) { init = JSON.parse(req.body); return Response.json({ data: { publish_id: "PUB1" }, error: { code: initError, message: "x" } }); }
    if (u.endsWith("/status/fetch/"))
      return Response.json({ data: { status, ...(status === "PUBLISH_COMPLETE" ? { publicaly_available_post_id: [7123] } : {}), ...(status === "FAILED" ? { fail_reason: "file_format_check_failed" } : {}) }, error: { code: "ok" } });
    throw new Error("unexpected fetch " + u);
  });
});
afterEach(() => vi.restoreAllMocks());

describe("tiktok", () => {
  it("pulls the vertical clip from our CDN with the configured privacy", async () => {
    expect(await tiktok.publish(E(), P, ctx)).toEqual({ containerId: "PUB1" });
    expect(init.source_info).toEqual({ source: "PULL_FROM_URL", video_url: P.media.url });
    expect(init.post_info).toMatchObject({ title: "orb #UFO", privacy_level: "SELF_ONLY" });
  });
  it("privacy not offered by the creator → 400", async () => {
    await expect(tiktok.publish(E({ TIKTOK_PRIVACY: "FOLLOWER_OF_CREATOR" }), P, ctx)).rejects.toMatchObject({ status: 400 });
  });
  it("error.code other than ok → SocialError even on HTTP 200", async () => {
    initError = "spam_risk_too_many_posts";
    await expect(tiktok.publish(E(), P, ctx)).rejects.toMatchObject({ status: 400 });
  });
  it("finish: complete / processing / failed", async () => {
    expect(await tiktok.finish!(E(), P, "PUB1", ctx)).toEqual({ remoteId: "7123" });
    status = "PROCESSING_DOWNLOAD";
    expect(await tiktok.finish!(E(), P, "PUB1", ctx)).toBe("processing");
    status = "FAILED";
    await expect(tiktok.finish!(E(), P, "PUB1", ctx)).rejects.toMatchObject({ status: 422 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `PATH=$HOME/.nvm/versions/node/v22.22.0/bin:$PATH pnpm test:worker worker/tests/social-tiktok.spec.ts`
Expected: FAIL — cannot resolve `../lib/social/tiktok`.

- [ ] **Step 3: Implement**

`worker/lib/social/tiktok.ts`:

```ts
import type { Env } from "../../env";
import { SocialError, readJson, type Adapter } from "./common";
import { token } from "./auth";

// TikTok Content Posting API, Direct Post (Spec 5 §4). Unaudited apps may only post
// SELF_ONLY; TIKTOK_PRIVACY flips after the audit. assets.realufo.org must be a
// verified URL prefix for PULL_FROM_URL.

const API = "https://open.tiktokapis.com/v2";

async function call(path: string, tok: string, body: unknown): Promise<any> {
  const j = await readJson(await fetch(`${API}${path}`, {
    method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json; charset=UTF-8" }, body: JSON.stringify(body),
  }));
  if (j.error?.code && j.error.code !== "ok") throw new SocialError(400, JSON.stringify(j.error));
  return j.data ?? {};
}

export const tiktok: Adapter = {
  needs: "video",
  vertical: true,
  configured: (env) => !!(env.TIKTOK_CLIENT_KEY && env.TIKTOK_CLIENT_SECRET),
  async publish(env, p, ctx) {
    const tok = await token(env, "tiktok", ctx.now);
    const privacy = env.TIKTOK_PRIVACY || "SELF_ONLY";
    const info = await call("/post/publish/creator_info/query/", tok, {});
    if (!(info.privacy_level_options ?? []).includes(privacy)) throw new SocialError(400, `privacy ${privacy} not offered: ${info.privacy_level_options}`);
    const d = await call("/post/publish/video/init/", tok, {
      post_info: { title: p.text, privacy_level: privacy, disable_comment: false, disable_duet: false, disable_stitch: false },
      source_info: { source: "PULL_FROM_URL", video_url: p.media!.url },
    });
    return { containerId: String(d.publish_id) };
  },
  async finish(env: Env, _p, publishId, ctx) {
    const d = await call("/post/publish/status/fetch/", await token(env, "tiktok", ctx.now), { publish_id: publishId });
    if (d.status === "PUBLISH_COMPLETE") return { remoteId: String(d.publicaly_available_post_id?.[0] ?? publishId) }; // [sic] TikTok's field name
    if (d.status === "FAILED") throw new SocialError(422, `tiktok ${d.fail_reason ?? "failed"}`);
    return "processing";
  },
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `PATH=$HOME/.nvm/versions/node/v22.22.0/bin:$PATH pnpm test:worker worker/tests/social-tiktok.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git status --short
git add worker/lib/social/tiktok.ts worker/tests/social-tiktok.spec.ts
git commit -m "feat(social): TikTok adapter (PULL_FROM_URL, status polling)"
```

---

### Task 8: Social tick + cron wiring

**Files:**
- Create: `worker/lib/social/tick.ts`
- Modify: `worker/index.ts:63-65` (`scheduled`)
- Test: `worker/tests/social-tick.spec.ts`

**Interfaces:**
- Consumes: all adapters (`fb`, `ig`, `threads` from `meta.ts`; `bsky`; `yt`; `tiktok`); `compose`, `archiveOf` (`text.ts`); `Adapter`, `Platform`, `SocialError`, `isAuth`, `log`, `CDN`, `wait`, `Sleep` (`common.ts`); `sqlTime`, `mediaFor` from `worker/lib/xpick.ts` (`mediaFor(env, { id, archive, kind }): Promise<{ key, mime, size } | null>` — with `kind: "image"` it returns the record's thumb).
- Produces:
  ```ts
  export const ADAPTERS: Record<Platform, Adapter>;
  export async function tick(env: Env, now?: Date, sleep?: Sleep, adapters?: Partial<Record<Platform, Adapter>>): Promise<void>;
  ```
  Exported as `tick` from `worker/lib/social/tick.ts`; `worker/index.ts` imports it as `socialTick`.

- [ ] **Step 1: Write the failing tests**

`worker/tests/social-tick.spec.ts`:

```ts
import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { seedTestDB } from "./helpers";
import { tick } from "../lib/social/tick";
import { SocialError, type Adapter, type SocialPost } from "../lib/social/common";

// seeded: records.archive → archives and assets.record_id → records are FKs
beforeAll(() => seedTestDB(env.DB));

const NOW = new Date("2026-10-10T15:00:00Z");
const noSleep = async () => {};
const OFF = { FEATURE_SOCIAL_FB: "off", FEATURE_SOCIAL_IG: "off", FEATURE_SOCIAL_THREADS: "off", FEATURE_SOCIAL_BSKY: "off", FEATURE_SOCIAL_YT: "off", FEATURE_SOCIAL_TIKTOK: "off" };
const E = (extra: Record<string, unknown> = {}) => ({ ...env, ...OFF, SOCIAL_SINCE: "2026-10-01", YT_DAILY_MAX: "5", ...extra }) as any;

let seen: { platform: string; p: SocialPost }[] = [];
const fake = (platform: string, o: Partial<Adapter> = {}): Adapter => ({
  needs: "any", vertical: false, configured: () => true,
  publish: async (_e, p) => { seen.push({ platform, p }); return { remoteId: `R-${platform}` }; },
  ...o,
});

const addX = async (ref: string, opts: { status?: string; media?: string | null; created?: string; text?: string } = {}) =>
  (await env.DB.prepare("INSERT INTO x_posts(stream,ref,text,ai,media,cost_usd,status,created_at) VALUES ('pick',?,?,1,?,0.2,?,?) RETURNING id")
    .bind(ref, opts.text ?? `📼 ${ref}\nhttps://realufo.org/doc/${ref}`, opts.media === undefined ? `clip:clips/wargov/${ref}.mp4` : opts.media, opts.status ?? "posted", opts.created ?? "2026-10-10 14:00:00")
    .first<{ id: number }>())!.id;
const rows = async () => (await env.DB.prepare("SELECT platform, status, remote_id, container_id, error, attempts FROM social_posts ORDER BY id").all<any>()).results;

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM social_posts").run();
  await env.DB.prepare("DELETE FROM x_posts").run();
  await env.DB.prepare("DELETE FROM assets WHERE record_id LIKE 'ST-%'").run();
  await env.DB.prepare("DELETE FROM records WHERE id LIKE 'ST-%'").run();
  for (const p of ["clips/", "clips-v/", "thumbs/"]) for (const o of (await env.MEDIA.list({ prefix: p })).objects) await env.MEDIA.delete(o.key);
  await env.MEDIA.put("clips/wargov/ST-V1.mp4", new Uint8Array(100));
  await env.MEDIA.put("clips-v/wargov/ST-V1.mp4", new Uint8Array(120));
  seen = [];
});

describe("social tick", () => {
  it("off: nothing", async () => {
    await addX("ST-V1");
    await tick(E(), NOW, noSleep, { fb: fake("fb") });
    expect(await rows()).toEqual([]);
  });

  it("empty SOCIAL_SINCE mirrors nothing; rows before SOCIAL_SINCE are ignored", async () => {
    await addX("ST-V1", { created: "2026-09-30 10:00:00" });
    await tick(E({ FEATURE_SOCIAL_FB: "on" }), NOW, noSleep, { fb: fake("fb") });
    await tick(E({ FEATURE_SOCIAL_FB: "on", SOCIAL_SINCE: "" }), NOW, noSleep, { fb: fake("fb") });
    expect(await rows()).toEqual([]);
  });

  it("dry: draft rows, no publish", async () => {
    await addX("ST-V1");
    await tick(E({ FEATURE_SOCIAL_FB: "dry", FEATURE_SOCIAL_BSKY: "dry" }), NOW, noSleep, { fb: fake("fb"), bsky: fake("bsky") });
    expect((await rows()).map((r) => [r.platform, r.status])).toEqual([["fb", "draft"], ["bsky", "draft"]]);
    expect(seen).toEqual([]);
  });

  it("on: fans out with per-platform text and media; second tick posts nothing new", async () => {
    await addX("ST-V1");
    const A = { fb: fake("fb"), ig: fake("ig", { vertical: true, needs: "media" }) };
    const e = E({ FEATURE_SOCIAL_FB: "on", FEATURE_SOCIAL_IG: "on" });
    await tick(e, NOW, noSleep, A);
    await tick(e, NOW, noSleep, A);
    expect(await rows()).toMatchObject([{ platform: "fb", status: "posted", remote_id: "R-fb" }, { platform: "ig", status: "posted", remote_id: "R-ig" }]);
    expect(seen).toHaveLength(2);
    expect(seen[0].p.media).toEqual({ kind: "video", key: "clips/wargov/ST-V1.mp4", url: "https://assets.realufo.org/clips/wargov/ST-V1.mp4", size: 100 });
    expect(seen[0].p.text.endsWith("\n\nhttps://realufo.org/doc/ST-V1")).toBe(true);
    expect(seen[1].p.media!.key).toBe("clips-v/wargov/ST-V1.mp4");
    expect(seen[1].p.text).toContain("🔗 link in bio");
  });

  it("one per platform per tick, oldest first; failed X rows never mirrored", async () => {
    await addX("ST-BAD", { status: "failed" });
    await addX("ST-V1", { created: "2026-10-10 10:00:00" });
    await addX("ST-V2", { created: "2026-10-10 11:00:00", media: null });
    await tick(E({ FEATURE_SOCIAL_FB: "on" }), NOW, noSleep, { fb: fake("fb") });
    expect(seen.map((s) => s.p.link)).toEqual(["https://realufo.org/doc/ST-V1"]);
    await tick(E({ FEATURE_SOCIAL_FB: "on" }), NOW, noSleep, { fb: fake("fb") });
    await tick(E({ FEATURE_SOCIAL_FB: "on" }), NOW, noSleep, { fb: fake("fb") });
    expect(seen.map((s) => s.p.link)).toEqual(["https://realufo.org/doc/ST-V1", "https://realufo.org/doc/ST-V2"]);
  });

  it("video-only platform without video → failed 'no video', no publish", async () => {
    await addX("ST-P1", { media: null });
    await tick(E({ FEATURE_SOCIAL_YT: "on" }), NOW, noSleep, { yt: fake("yt", { needs: "video", vertical: true }) });
    expect(await rows()).toMatchObject([{ platform: "yt", status: "failed", error: "no video" }]);
    expect(seen).toEqual([]);
  });

  it("missing vertical twin: ig falls back to the thumb, yt records no video", async () => {
    await env.DB.prepare("INSERT INTO records(id,archive,kind,title,status) VALUES ('ST-V9','wargov','video','x','live')").run();
    await env.DB.prepare("INSERT INTO assets(record_id,role,cdn_url,mime) VALUES ('ST-V9','thumb','https://assets.realufo.org/thumbs/wargov/ST-V9.jpg','image/jpeg')").run();
    await env.MEDIA.put("clips/wargov/ST-V9.mp4", new Uint8Array(100));
    await env.MEDIA.put("thumbs/wargov/ST-V9.jpg", new Uint8Array(50));
    await addX("ST-V9");
    await tick(E({ FEATURE_SOCIAL_IG: "on", FEATURE_SOCIAL_YT: "on" }), NOW, noSleep,
      { ig: fake("ig", { vertical: true, needs: "media" }), yt: fake("yt", { vertical: true, needs: "video" }) });
    expect(seen[0].p.media).toEqual({ kind: "image", key: "thumbs/wargov/ST-V9.jpg", url: "https://assets.realufo.org/thumbs/wargov/ST-V9.jpg", size: 50 });
    expect(await rows()).toMatchObject([{ platform: "ig", status: "posted" }, { platform: "yt", status: "failed", error: "no video" }]);
  });

  it("yt over YT_DAILY_MAX → failed 'quota cap'", async () => {
    const e = E({ FEATURE_SOCIAL_YT: "on", YT_DAILY_MAX: "1" });
    const A = { yt: fake("yt", { needs: "video", vertical: true }) };
    await addX("ST-V1", { created: "2026-10-10 10:00:00" });
    await env.MEDIA.put("clips-v/wargov/ST-V2.mp4", new Uint8Array(1));
    await addX("ST-V2", { created: "2026-10-10 11:00:00", media: "clip:clips/wargov/ST-V2.mp4" });
    await tick(e, NOW, noSleep, A);
    await tick(e, NOW, noSleep, A);
    expect((await rows()).map((r) => [r.status, r.error])).toEqual([["posted", null], ["failed", "quota cap"]]);
  });

  it("container: processing → resumed to posted next tick; >1 h → processing timeout", async () => {
    await addX("ST-V1");
    let state: "processing" | { remoteId: string } = "processing";
    const A = { ig: fake("ig", { publish: async () => ({ containerId: "C1" }), finish: async () => state }) };
    const e = E({ FEATURE_SOCIAL_IG: "on" });
    await tick(e, NOW, noSleep, A);
    expect(await rows()).toMatchObject([{ status: "processing", container_id: "C1" }]);
    await tick(e, new Date("2026-10-10T15:30:00Z"), noSleep, A);
    expect((await rows())[0].status).toBe("processing");
    state = { remoteId: "IGP" };
    await tick(e, new Date("2026-10-10T15:40:00Z"), noSleep, A);
    expect(await rows()).toMatchObject([{ status: "posted", remote_id: "IGP" }]);

    await env.DB.prepare("DELETE FROM social_posts").run();
    state = "processing";
    await tick(e, NOW, noSleep, A);
    await tick(e, new Date("2026-10-10T16:01:00Z"), noSleep, A);
    expect(await rows()).toMatchObject([{ status: "failed", error: "processing timeout" }]);
  });

  it("auth error deletes the row (item retried after the fix)", async () => {
    await addX("ST-V1");
    const A = { fb: fake("fb", { publish: async () => { throw new SocialError(400, '{"error":{"code":190}}'); } }) };
    await tick(E({ FEATURE_SOCIAL_FB: "on" }), NOW, noSleep, A);
    expect(await rows()).toEqual([]);
  });

  it("429 retries up to 3 attempts, then failed; other 4xx fail at once", async () => {
    await addX("ST-V1");
    let n = 0;
    const A = { fb: fake("fb", { publish: async () => { n++; throw new SocialError(429, "slow down"); } }) };
    const e = E({ FEATURE_SOCIAL_FB: "on" });
    await tick(e, NOW, noSleep, A);
    expect(await rows()).toMatchObject([{ status: "pending", attempts: 1 }]);
    await tick(e, NOW, noSleep, A);
    await tick(e, NOW, noSleep, A);
    expect(await rows()).toMatchObject([{ status: "failed", attempts: 3 }]);
    expect(n).toBe(3);

    await env.DB.prepare("DELETE FROM social_posts").run();
    const B = { fb: fake("fb", { publish: async () => { throw new SocialError(400, "bad media"); } }) };
    await tick(e, NOW, noSleep, B);
    expect(await rows()).toMatchObject([{ status: "failed", attempts: 1 }]);
  });

  it("ambiguous network error parks the row and the next tick does not re-post", async () => {
    await addX("ST-V1");
    let n = 0;
    const A = { fb: fake("fb", { publish: async () => { n++; throw new TypeError("network connection lost"); } }) };
    const e = E({ FEATURE_SOCIAL_FB: "on" });
    await tick(e, NOW, noSleep, A);
    await tick(e, NOW, noSleep, A);
    expect(n).toBe(1);
    expect(await rows()).toMatchObject([{ status: "pending", attempts: 0 }]);
  });

  it("one platform throwing doesn't stop the others; unconfigured 'on' platform is skipped", async () => {
    await addX("ST-V1");
    const A = {
      fb: fake("fb", { configured: () => { throw new Error("boom"); } }),
      threads: fake("threads", { configured: () => false }),
      bsky: fake("bsky"),
    };
    await tick(E({ FEATURE_SOCIAL_FB: "on", FEATURE_SOCIAL_THREADS: "on", FEATURE_SOCIAL_BSKY: "on" }), NOW, noSleep, A);
    expect(await rows()).toMatchObject([{ platform: "bsky", status: "posted" }]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `PATH=$HOME/.nvm/versions/node/v22.22.0/bin:$PATH pnpm test:worker worker/tests/social-tick.spec.ts`
Expected: FAIL — cannot resolve `../lib/social/tick`.

- [ ] **Step 3: Implement**

`worker/lib/social/tick.ts`:

```ts
import type { Env } from "../../env";
import { mediaFor, sqlTime } from "../xpick";
import { SocialError, isAuth, log, CDN, wait, type Adapter, type Ctx, type Platform, type SocialMedia, type SocialPost, type Sleep } from "./common";
import { compose, archiveOf } from "./text";
import { fb, ig, threads } from "./meta";
import { bsky } from "./bsky";
import { yt } from "./yt";
import { tiktok } from "./tiktok";

// Social fan-out tick (Spec 5 §3): mirror x_posts to every enabled platform, one new
// post per platform per tick. Row goes in BEFORE the platform is called:
// UNIQUE(x_post_id, platform) makes a second attempt a no-op.

export const ADAPTERS: Record<Platform, Adapter> = { fb, ig, threads, bsky, yt, tiktok };
const FLAG: Record<Platform, keyof Env> = {
  fb: "FEATURE_SOCIAL_FB", ig: "FEATURE_SOCIAL_IG", threads: "FEATURE_SOCIAL_THREADS",
  bsky: "FEATURE_SOCIAL_BSKY", yt: "FEATURE_SOCIAL_YT", tiktok: "FEATURE_SOCIAL_TIKTOK",
};
const MAX_ATTEMPTS = 3;
const TIMEOUT_MS = 3600_000;

type XRow = { id: number; text: string; media: string | null };
type Row = { id: number; attempts: number; status: string; container_id: string | null; created_at: string; text: string; media: string | null };

async function image(env: Env, key: string): Promise<SocialMedia | null> {
  const o = await env.MEDIA.head(key);
  return o ? { kind: "image", key, url: CDN + key, size: o.size } : null;
}

// x_posts.media → what this platform gets. Vertical platforms use the clips-v/ twin;
// if it isn't cut yet, fall back to the record's thumb (as if there were no clip).
async function mediaOf(env: Env, media: string | null, vertical: boolean): Promise<SocialMedia | null> {
  if (!media) return null;
  const i = media.indexOf(":");
  const [kind, key] = [media.slice(0, i), media.slice(i + 1)];
  if (kind !== "clip") return image(env, key);
  const k = vertical ? key.replace(/^clips\//, "clips-v/") : key;
  const o = await env.MEDIA.head(k);
  if (o) return { kind: "video", key: k, url: CDN + k, size: o.size };
  const [, archive, file] = key.split("/");
  const t = await mediaFor(env, { id: file.replace(/\.mp4$/, ""), archive, kind: "image" });
  return t ? image(env, t.key) : null;
}

async function postFor(env: Env, p: Platform, a: Adapter, x: { text: string; media: string | null }): Promise<SocialPost> {
  const c = compose(p, x.text, archiveOf(x.media));
  return { ...c, media: await mediaOf(env, x.media, a.vertical) };
}

const gate = (a: Adapter, post: SocialPost): string | null =>
  a.needs === "video" && post.media?.kind !== "video" ? "no video" : a.needs === "media" && !post.media ? "no media" : null;

async function overCap(env: Env, p: Platform, now: Date): Promise<boolean> {
  if (p !== "yt") return false;
  const r = await env.DB.prepare("SELECT count(*) n FROM social_posts WHERE platform='yt' AND status IN ('posted','processing','pending') AND created_at >= ?")
    .bind(sqlTime(new Date(now.getTime() - 86400_000))).first<{ n: number }>();
  return (r?.n ?? 0) >= Number(env.YT_DAILY_MAX || 5);
}

async function fail(env: Env, p: Platform, row: { id: number; attempts: number }, e: unknown) {
  if (!(e instanceof SocialError)) {
    // may have posted (network error after send) → manual check, never auto-retried
    await env.DB.prepare("UPDATE social_posts SET status='pending', attempts=0, error=? WHERE id=?").bind(String(e).slice(0, 500), row.id).run();
    return log({ platform: p, ambiguous: row.id, error: String(e).slice(0, 200) });
  }
  if (isAuth(e)) {
    // token revoked/expired: nothing posted; drop the row so the item isn't burned while we're down
    await env.DB.prepare("DELETE FROM social_posts WHERE id=?").bind(row.id).run();
    return log({ platform: p, halted: row.id, status: e.status, body: e.body.slice(0, 200) });
  }
  const attempts = row.attempts + 1;
  const final = !(e.status === 429 || e.status >= 500) || attempts >= MAX_ATTEMPTS;
  await env.DB.prepare("UPDATE social_posts SET status=?, attempts=?, error=? WHERE id=?").bind(final ? "failed" : "pending", attempts, String(e).slice(0, 500), row.id).run();
  log({ platform: p, error: row.id, status: e.status, final });
}

async function send(env: Env, p: Platform, a: Adapter, row: { id: number; attempts: number }, post: SocialPost, ctx: Ctx) {
  try {
    const r = await a.publish(env, post, ctx);
    log({ platform: p, row: row.id, ...r }); // logged before the D1 write so a failed write is recoverable
    if ("remoteId" in r) await env.DB.prepare("UPDATE social_posts SET status='posted', remote_id=?, error=NULL WHERE id=?").bind(r.remoteId, row.id).run();
    else await env.DB.prepare("UPDATE social_posts SET status='processing', container_id=?, error=NULL WHERE id=?").bind(r.containerId, row.id).run();
  } catch (e) {
    await fail(env, p, row, e);
  }
}

async function resume(env: Env, p: Platform, a: Adapter, ctx: Ctx) {
  const { results } = await env.DB.prepare(
    `SELECT s.id, s.attempts, s.status, s.container_id, s.created_at, x.text, x.media FROM social_posts s JOIN x_posts x ON x.id=s.x_post_id
     WHERE s.platform=? AND (s.status='processing' OR (s.status='pending' AND s.attempts>0))`
  ).bind(p).all<Row>();
  for (const row of results) {
    const post = await postFor(env, p, a, row);
    if (row.status === "pending") { await send(env, p, a, row, post, ctx); continue; }
    try {
      const f = a.finish ? await a.finish(env, post, row.container_id!, ctx) : "processing";
      if (f !== "processing") {
        log({ platform: p, row: row.id, ...f });
        await env.DB.prepare("UPDATE social_posts SET status='posted', remote_id=?, error=NULL WHERE id=?").bind(f.remoteId, row.id).run();
      } else if (Date.parse(row.created_at.replace(" ", "T") + "Z") < ctx.now.getTime() - TIMEOUT_MS) {
        await env.DB.prepare("UPDATE social_posts SET status='failed', error='processing timeout' WHERE id=?").bind(row.id).run();
      }
    } catch (e) {
      await fail(env, p, row, e);
    }
  }
}

async function runPlatform(env: Env, p: Platform, a: Adapter, mode: string, ctx: Ctx) {
  if (mode === "on" && !a.configured(env)) return log({ platform: p, skipped: "missing secrets" });
  if (mode === "on") await resume(env, p, a, ctx);
  const since = env.SOCIAL_SINCE ?? "";
  if (!since) return;
  const x = await env.DB.prepare(
    `SELECT x.id, x.text, x.media FROM x_posts x
     WHERE x.status IN ('posted','pending','processing') AND x.created_at >= ?
       AND NOT EXISTS (SELECT 1 FROM social_posts s WHERE s.x_post_id=x.id AND s.platform=?)
     ORDER BY x.created_at, x.id LIMIT 1`
  ).bind(since, p).first<XRow>();
  if (!x) return;
  const post = await postFor(env, p, a, x);
  const blocked = gate(a, post) ?? ((await overCap(env, p, ctx.now)) ? "quota cap" : null);
  const status = blocked ? "failed" : mode === "dry" ? "draft" : "pending";
  const ins = await env.DB.prepare(
    "INSERT INTO social_posts(x_post_id,platform,status,error,created_at) VALUES (?,?,?,?,?) ON CONFLICT(x_post_id, platform) DO NOTHING RETURNING id"
  ).bind(x.id, p, status, blocked, sqlTime(ctx.now)).first<{ id: number }>();
  if (!ins) return;
  log({ platform: p, x: x.id, mode, status, blocked, media: post.media?.key ?? null });
  if (status === "pending") await send(env, p, a, { id: ins.id, attempts: 0 }, post, ctx);
}

export async function tick(env: Env, now = new Date(), sleep: Sleep = wait, adapters: Partial<Record<Platform, Adapter>> = ADAPTERS) {
  const ctx = { now, sleep };
  for (const [p, a] of Object.entries(adapters) as [Platform, Adapter][]) {
    const mode = (env[FLAG[p]] as string | undefined) ?? "off";
    if (mode !== "dry" && mode !== "on") continue;
    try {
      await runPlatform(env, p, a, mode, ctx);
    } catch (e) {
      log({ platform: p, crashed: String(e).slice(0, 300) });
    }
  }
}
```

In `worker/index.ts`, add the import next to the existing xbot import (find it with `grep -n "xbot" worker/index.ts`):

```ts
import { tick as socialTick } from "./lib/social/tick";
```

and replace the `scheduled` body:

```ts
  async scheduled(_c: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    // X bot first (Spec 4; FEATURE_X gates it), then mirror to other platforms (Spec 5;
    // FEATURE_SOCIAL_* gate it). Social failing never affects X.
    const logErr = (who: string) => (e: unknown) => console.log(JSON.stringify({ [who]: true, crashed: String(e).slice(0, 300) }));
    ctx.waitUntil((async () => {
      await tick(env).catch(logErr("xbot"));
      await socialTick(env).catch(logErr("social"));
    })());
  },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `PATH=$HOME/.nvm/versions/node/v22.22.0/bin:$PATH pnpm test:worker worker/tests/social-tick.spec.ts`
Expected: PASS (13 tests).

Then the full worker suite (nothing else may break; xbot tests must still pass):
Run: `PATH=$HOME/.nvm/versions/node/v22.22.0/bin:$PATH pnpm test:worker`
Expected: all PASS. And `npx tsc --noEmit` → no errors.

- [ ] **Step 5: Commit**

```bash
git status --short
git add worker/lib/social/tick.ts worker/index.ts worker/tests/social-tick.spec.ts
git commit -m "feat(social): fan-out tick mirrors x_posts to enabled platforms after the X bot"
```

---

### Task 9: Vertical clips + CI

**Files:**
- Modify: `crawler/ingest/clips.py`
- Modify: `crawler/ingest/tests/test_clips.py`
- Modify: `.github/workflows/ingest.yml` (apt line ~37, clips step ~56-68)

**Interfaces:**
- Produces: R2 objects `clips-v/<archive>/<id>.mp4` (1080×1920 H.264, ≤30 s). New functions in `clips.py`: `vkey(row) -> str`, `clean_title(rid, title, n=40) -> str`, `has_audio(url) -> bool`, `vertical_args(url, start, length, out, title_file, font, audio=True) -> list[str]`; `todo(rows, exists=…, limit=None, force=False, keyf=key)`; CLI flag `--vertical`. Env `CLIP_FONT` (default `/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf`).
- Consumed by Task 8's `mediaOf` (key convention `clips/` → `clips-v/`).

- [ ] **Step 1: Write the failing tests**

Append to `crawler/ingest/tests/test_clips.py` (and extend its import line to `from ingest.clips import window, ffmpeg_args, todo, key, vkey, clean_title, vertical_args`):

```python
def test_vkey_and_todo_keyf():
    row = {"id": "V1", "archive": "wargov", "cdn_url": "u", "duration": 10}
    assert vkey(row) == "clips-v/wargov/V1.mp4"
    exists = lambda url: url.endswith("/clips/wargov/V1.mp4")    # landscape exists, vertical doesn't
    assert [r["id"] for r in todo([row], exists, keyf=vkey)] == ["V1"]
    assert todo([row], exists) == []

def test_clean_title_strips_id_prefix_underscores_and_caps_length():
    assert clean_title("DOW-UAP-PR019", "DOW-UAP-PR019, Gulf of Oman orb") == "Gulf of Oman orb"
    assert clean_title("AARO-IMG-Go_Fast", "Go_Fast_UAP") == "Go Fast UAP"
    assert clean_title("X1", None) == "X1"
    t = clean_title("X1", "a very long title that keeps going well past forty characters")
    assert len(t) == 40 and t.endswith("…")

def test_vertical_args_pad_blur_overlay_and_text():
    a = vertical_args("https://cdn/v.mp4", 210.0, 30.0, "/tmp/o.mp4", "/tmp/t.txt", "/fonts/D.ttf")
    fc = a[a.index("-filter_complex") + 1]
    for part in ("scale=1080:1920:force_original_aspect_ratio=increase", "crop=1080:1920", "boxblur",
                 "scale=1080:-2", "overlay=(W-w)/2:(H-h)/2", "textfile=/tmp/t.txt", "expansion=none",
                 "fontfile=/fonts/D.ttf", "text=realufo.org"):
        assert part in fc
    assert a.index("-ss") < a.index("-i") and a[a.index("-t") + 1] == "30.00"
    assert "anullsrc" not in " ".join(a) and "0:a:0" in a
    for flag in ("libx264", "yuv420p", "+faststart", "aac"):
        assert flag in a
    assert a[-1] == "/tmp/o.mp4"

def test_vertical_args_adds_silent_audio_when_source_has_none():
    a = vertical_args("u", 0.0, 30.0, "/tmp/o.mp4", "/tmp/t.txt", "/f.ttf", audio=False)
    j = " ".join(a)
    assert "anullsrc=channel_layout=stereo:sample_rate=44100" in j
    assert a[a.index("-map", a.index("[v]")) + 1] == "1:a"
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd crawler && python3 -m pytest ingest/tests/test_clips.py -q`
Expected: FAIL — `ImportError: cannot import name 'vkey'`.

- [ ] **Step 3: Implement**

In `crawler/ingest/clips.py`:

1. Docstring: add a paragraph after the existing one:

```python
"""…existing text…

--vertical writes the 9:16 twin for Reels/Shorts/TikTok (Spec 5 §7) to
clips-v/<archive>/<id>.mp4: the full frame centred on a blurred, cropped copy of
itself, clean title in the top band and realufo.org in the bottom band. Needs a
TTF at $CLIP_FONT (default: DejaVu Sans Bold from apt fonts-dejavu-core); the path
must not contain spaces, ':' or quotes (ffmpeg filtergraph syntax).
"""
```

2. Change the import line to `import argparse, os, re, subprocess, sys, tempfile` and update `SELECT` to also return the title:

```python
SELECT = """SELECT r.id, r.archive, r.title, a.cdn_url, a.duration FROM records r
JOIN assets a ON a.record_id=r.id AND a.role='full'
WHERE r.status='live' AND a.mime LIKE 'video/%' ORDER BY r.id"""
FONT = os.environ.get("CLIP_FONT", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")
```

3. Add after `key()`:

```python
def vkey(row) -> str:
    return f"clips-v/{row['archive']}/{row['id']}.mp4"

def clean_title(rid, title, n=40) -> str:
    """ponytail: minimal port of docTitleParts (id prefix + underscores only); the
    full rules live in web/src/lib/docTitle.ts — port more if titles look wrong."""
    t = title or ""
    if t.startswith(rid) and t[len(rid):len(rid) + 1] in (",", "_", " ", ":"):
        t = t[len(rid):]
    t = re.sub(r"\s+", " ", t.replace("_", " ")).strip(" ,:;") or rid
    return t if len(t) <= n else t[:n - 1].rstrip() + "…"

def has_audio(url) -> bool:
    return bool(subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index",
                                "-of", "csv=p=0", url], capture_output=True, text=True).stdout.strip())

def vertical_args(url, start, length, out, title_file, font, audio=True):
    band = f"fontfile={font}:fontcolor=white:borderw=3:bordercolor=black:x=(w-text_w)/2"
    fc = ("[0:v]split[a][b];"
          "[a]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=20[bg];"
          "[b]scale=1080:-2[fg];"
          "[bg][fg]overlay=(W-w)/2:(H-h)/2,"
          f"drawtext={band}:textfile={title_file}:expansion=none:fontsize=56:y=220,"
          f"drawtext={band}:text=realufo.org:fontsize=44:y=h-300[v]")
    a = ["ffmpeg", "-v", "error", "-y", "-ss", f"{start:.2f}", "-i", url]
    if not audio:
        a += ["-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100"]
    return a + ["-t", f"{length:.2f}", "-filter_complex", fc, "-map", "[v]", "-map", "0:a:0" if audio else "1:a",
                "-fpsmax", "30", "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p", "-preset", "veryfast",
                "-crf", "23", "-maxrate", "1500k", "-bufsize", "3000k",
                "-c:a", "aac", "-b:a", "128k", "-ac", "2", "-movflags", "+faststart", out]
```

4. Parameterise `todo` by key function:

```python
def todo(rows, exists=fetch.head_ok, limit=None, force=False, keyf=key):
    seen, out = set(), []
    for r in rows:
        if r["id"] in seen:
            continue
        seen.add(r["id"])
        if not force and exists(f"{R2_BASE}/{keyf(r)}"):
            continue
        out.append(r)
        if limit and len(out) >= limit:
            break
    return out
```

5. In `main()`: add the flag and branch the encode:

```python
    ap.add_argument("--vertical", action="store_true", help="cut the 9:16 twin to clips-v/ (Reels/Shorts/TikTok)")
```

after `args = ap.parse_args(argv)`:

```python
    keyf = vkey if args.vertical else key
    if args.vertical and not os.path.exists(FONT):
        sys.exit(f"--vertical needs a TTF font at CLIP_FONT (missing: {FONT})")
    rows = todo(d1._d1_json(" ".join(SELECT.split())), limit=args.limit, force=args.force, keyf=keyf)
```

(replacing the existing `rows = todo(...)` line), and inside the loop replace the `p = subprocess.run(ffmpeg_args(...))` line with:

```python
        if args.vertical:
            with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8") as tf:
                tf.write(clean_title(row["id"], row.get("title")))
            cmd = vertical_args(row["cdn_url"], start, length, out, tf.name, FONT, has_audio(row["cdn_url"]))
        else:
            cmd = ffmpeg_args(row["cdn_url"], start, length, out)
        p = subprocess.run(cmd, capture_output=True, text=True)
        if args.vertical:
            os.unlink(tf.name)
```

and use `keyf(row)` instead of `key(row)` in the `r2.put(...)` call and in the `ok` print line. Also make the output filename distinct so a landscape and vertical run in the same `--out` don't collide: `out = os.path.join(args.out, f"{row['id']}{'-v' if args.vertical else ''}.mp4")`.

6. `.github/workflows/ingest.yml`: change the apt line to

```yaml
      - run: sudo apt-get update -q && sudo apt-get install -yq ffmpeg poppler-utils fonts-dejavu-core
```

and in the `clips` step `run:` block replace the two `python -m ingest.clips …` lines:

```yaml
          if [ "$LIVE" = "true" ]; then
            python -m ingest.clips | tee -a ingest-summary.txt
            python -m ingest.clips --vertical | tee -a ingest-summary.txt
          else
            python -m ingest.clips --dry-run --limit 1 | tee -a ingest-summary.txt
            python -m ingest.clips --vertical --dry-run --limit 1 | tee -a ingest-summary.txt
          fi
```

and update the step comment to `# X bot + social clips (Spec 4/5): ≤30 s MP4s at clips/ and 9:16 twins at clips-v/`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd crawler && python3 -m pytest ingest/tests/test_clips.py -q`
Expected: PASS (7 tests).

Local smoke encode (needs ffmpeg with drawtext/freetype — `ffmpeg -filters | grep drawtext` must print a line; DejaVu locally via `brew install --cask font-dejavu`):

Run: `cd crawler && set -a && . ../.env && set +a && CLIP_FONT=$HOME/Library/Fonts/DejaVuSans-Bold.ttf python3 -m ingest.clips --vertical --dry-run --limit 2`
Expected: `dry-run clips=2 failed=0 out=…`. Open one output (`open /tmp/realufo-clips/*-v.mp4` or the printed `out` dir) and check: 1080×1920, full frame centred, blurred background, title on top, realufo.org at the bottom (`ffprobe -v error -show_entries stream=width,height -of csv=p=0 <file>` → `1080,1920`).

- [ ] **Step 5: Commit**

```bash
git status --short
git add crawler/ingest/clips.py crawler/ingest/tests/test_clips.py .github/workflows/ingest.yml
git commit -m "feat(clips): 9:16 vertical twins at clips-v/ for Reels/Shorts/TikTok"
```

---

### Task 10: One-time OAuth / secrets helper

**Files:**
- Create: `crawler/ingest/social_auth.py`
- Test: `crawler/ingest/tests/test_social_auth.py`

**Interfaces:**
- Consumes: `ingest.d1.execute(sql)`, `ingest.d1.sql_q(v)`.
- Produces: CLI `python -m ingest.social_auth <bsky|meta|threads|tiktok|yt>` (run from `crawler/` after `set -a; . ../.env; set +a`). Pure helpers: `consent_url(platform, env, state) -> str`, `code_from(pasted, state) -> str`, `upsert_sql(platform, access, refresh, expires_in, now) -> str`, `REDIRECT = "https://realufo.org/"`.
- App credentials read from the repo `.env`: `META_APP_ID`, `META_APP_SECRET`, `THREADS_APP_ID`, `THREADS_APP_SECRET`, `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `YT_CLIENT_ID`, `YT_CLIENT_SECRET`.
- Secrets are written with `wrangler secret put NAME` (value on stdin — never printed), run from the repo root with `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` removed from the environment and `--env-file /dev/null`, because the `.env` API token lacks Workers Scripts permission and the OAuth login has it. D1 writes use the `.env` token (it has D1).

- [ ] **Step 1: Write the failing tests**

`crawler/ingest/tests/test_social_auth.py`:

```python
from datetime import datetime, timezone
from urllib.parse import urlparse, parse_qs
import pytest
from ingest.social_auth import consent_url, code_from, upsert_sql, REDIRECT

ENV = {"THREADS_APP_ID": "th-app", "TIKTOK_CLIENT_KEY": "tt-key", "YT_CLIENT_ID": "yt-id"}

def q(url):
    return {k: v[0] for k, v in parse_qs(urlparse(url).query).items()}

def test_consent_urls_carry_redirect_scope_and_state():
    th = q(consent_url("threads", ENV, "S1"))
    assert th == {"client_id": "th-app", "redirect_uri": REDIRECT, "scope": "threads_basic,threads_content_publish", "response_type": "code", "state": "S1"}
    tt = q(consent_url("tiktok", ENV, "S1"))
    assert tt["client_key"] == "tt-key" and tt["scope"] == "user.info.basic,video.publish" and tt["state"] == "S1"
    yt = q(consent_url("yt", ENV, "S1"))
    assert yt["access_type"] == "offline" and yt["prompt"] == "consent"
    assert yt["scope"] == "https://www.googleapis.com/auth/youtube.upload"

def test_code_from_checks_state_and_strips_meta_suffix():
    assert code_from("https://realufo.org/?code=AbC%2B1&state=S1#_", "S1") == "AbC+1"
    with pytest.raises(SystemExit):
        code_from("https://realufo.org/?code=x&state=EVIL", "S1")
    with pytest.raises(SystemExit):
        code_from("https://realufo.org/?error=access_denied&state=S1", "S1")

def test_upsert_sql_quotes_and_computes_expiry():
    now = datetime(2026, 10, 10, 12, 0, 0, tzinfo=timezone.utc)
    sql = upsert_sql("tiktok", "a'b", "r1", 86400, now)
    assert "INSERT INTO social_auth(platform,access_token,refresh_token,expires_at,updated_at)" in sql
    assert "'a''b'" in sql and "'2026-10-11 12:00:00'" in sql
    assert "ON CONFLICT(platform) DO UPDATE SET" in sql
    assert "NULL" in upsert_sql("threads", "t", None, 5184000, now)
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd crawler && python3 -m pytest ingest/tests/test_social_auth.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'ingest.social_auth'`.

- [ ] **Step 3: Implement**

`crawler/ingest/social_auth.py`:

```python
"""One-time social account setup for the fan-out bot (Spec 5 §5).

    cd crawler && set -a && . ../.env && set +a
    python3 -m ingest.social_auth bsky      # handle + app password -> secrets
    python3 -m ingest.social_auth meta      # Graph API Explorer user token -> META_PAGE_ID/TOKEN, IG_USER_ID
    python3 -m ingest.social_auth threads   # OAuth -> social_auth row + THREADS_USER_ID
    python3 -m ingest.social_auth tiktok    # OAuth -> social_auth row + client key/secret secrets
    python3 -m ingest.social_auth yt        # OAuth -> YT_CLIENT_ID/SECRET/REFRESH_TOKEN secrets

OAuth flows redirect to https://realufo.org/?code=... (register exactly that URI in
each app console); paste the full address-bar URL back here. Secrets go to the
Worker via `wrangler secret put` on stdin, never printed.
"""
import getpass, json, os, secrets, subprocess, sys
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode, urlparse, parse_qs
from urllib.request import Request, urlopen
from . import d1

REDIRECT = "https://realufo.org/"
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
GRAPH = "https://graph.facebook.com/v23.0"

def consent_url(platform, env, state) -> str:
    if platform == "threads":
        return "https://threads.net/oauth/authorize?" + urlencode({"client_id": env["THREADS_APP_ID"], "redirect_uri": REDIRECT,
            "scope": "threads_basic,threads_content_publish", "response_type": "code", "state": state})
    if platform == "tiktok":
        return "https://www.tiktok.com/v2/auth/authorize/?" + urlencode({"client_key": env["TIKTOK_CLIENT_KEY"], "redirect_uri": REDIRECT,
            "scope": "user.info.basic,video.publish", "response_type": "code", "state": state})
    if platform == "yt":
        return "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode({"client_id": env["YT_CLIENT_ID"], "redirect_uri": REDIRECT,
            "response_type": "code", "scope": "https://www.googleapis.com/auth/youtube.upload", "access_type": "offline",
            "prompt": "consent", "state": state})
    raise ValueError(platform)

def code_from(pasted, state) -> str:
    qs = {k: v[0] for k, v in parse_qs(urlparse(pasted.strip()).query).items()}
    if qs.get("state") != state:
        sys.exit("state mismatch — paste the URL from this run's consent page")
    if "code" not in qs:
        sys.exit(f"no code in URL: {qs.get('error', '?')} {qs.get('error_description', '')}")
    return qs["code"]

def upsert_sql(platform, access, refresh, expires_in, now) -> str:
    exp = (now + timedelta(seconds=int(expires_in))).strftime("%Y-%m-%d %H:%M:%S")
    ts = now.strftime("%Y-%m-%d %H:%M:%S")
    return ("INSERT INTO social_auth(platform,access_token,refresh_token,expires_at,updated_at) VALUES("
            f"{d1.sql_q(platform)},{d1.sql_q(access)},{d1.sql_q(refresh)},{d1.sql_q(exp)},{d1.sql_q(ts)}) "
            "ON CONFLICT(platform) DO UPDATE SET access_token=excluded.access_token, refresh_token=excluded.refresh_token, "
            "expires_at=excluded.expires_at, updated_at=excluded.updated_at;")

def _http(url, data=None, method=None):
    req = Request(url, data=urlencode(data).encode() if data else None, method=method or ("POST" if data else "GET"),
                  headers={"Content-Type": "application/x-www-form-urlencoded"})
    with urlopen(req, timeout=30) as r:
        return json.loads(r.read())

def _secret(name, value):
    env = {k: v for k, v in os.environ.items() if k not in ("CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID")}
    subprocess.run(["npx", "wrangler", "secret", "put", name, "--env-file", "/dev/null"], input=value, text=True, cwd=ROOT, env=env, check=True)
    print(f"secret {name} set")

def _oauth(platform, env):
    state = secrets.token_urlsafe(16)
    print("Open, approve, then paste the full URL you land on (https://realufo.org/?code=...):\n\n  " + consent_url(platform, env, state) + "\n")
    return code_from(input("URL: "), state)

def _now():
    return datetime.now(timezone.utc)

def bsky(env):
    handle, pw = input("Bluesky handle: ").strip(), getpass.getpass("App password: ")
    req = Request("https://bsky.social/xrpc/com.atproto.server.createSession", data=json.dumps({"identifier": handle, "password": pw}).encode(),
                  headers={"Content-Type": "application/json"})
    with urlopen(req, timeout=30) as r:
        print("login ok:", json.loads(r.read())["did"])
    _secret("BSKY_HANDLE", handle)
    _secret("BSKY_APP_PASSWORD", pw)

def meta(env):
    short = getpass.getpass("Short-lived USER token from Graph API Explorer (pages_show_list, pages_manage_posts, "
                            "pages_read_engagement, instagram_basic, instagram_content_publish, business_management): ")
    long_user = _http(f"{GRAPH}/oauth/access_token?" + urlencode({"grant_type": "fb_exchange_token", "client_id": env["META_APP_ID"],
                      "client_secret": env["META_APP_SECRET"], "fb_exchange_token": short}))["access_token"]
    pages = _http(f"{GRAPH}/me/accounts?" + urlencode({"access_token": long_user}))["data"]
    for i, p in enumerate(pages):
        print(f"[{i}] {p['name']} ({p['id']})")
    page = pages[int(input("Page #: ") or 0)]
    ig = _http(f"{GRAPH}/{page['id']}?" + urlencode({"fields": "instagram_business_account", "access_token": page["access_token"]}))
    _secret("META_PAGE_ID", page["id"])
    _secret("META_PAGE_TOKEN", page["access_token"])  # page token from a long-lived user token does not expire
    if ig.get("instagram_business_account"):
        _secret("IG_USER_ID", ig["instagram_business_account"]["id"])
    else:
        print("WARNING: no Instagram Business/Creator account linked to this Page; IG stays unconfigured")

def threads(env):
    code = _oauth("threads", env)
    short = _http("https://graph.threads.net/oauth/access_token", {"client_id": env["THREADS_APP_ID"], "client_secret": env["THREADS_APP_SECRET"],
                  "grant_type": "authorization_code", "redirect_uri": REDIRECT, "code": code})
    long = _http("https://graph.threads.net/access_token?" + urlencode({"grant_type": "th_exchange_token",
                 "client_secret": env["THREADS_APP_SECRET"], "access_token": short["access_token"]}))
    d1.execute(upsert_sql("threads", long["access_token"], None, long["expires_in"], _now()))
    _secret("THREADS_USER_ID", str(short["user_id"]))

def tiktok(env):
    code = _oauth("tiktok", env)
    t = _http("https://open.tiktokapis.com/v2/oauth/token/", {"client_key": env["TIKTOK_CLIENT_KEY"], "client_secret": env["TIKTOK_CLIENT_SECRET"],
              "code": code, "grant_type": "authorization_code", "redirect_uri": REDIRECT})
    if "access_token" not in t:
        sys.exit(f"tiktok token exchange failed: {t}")
    d1.execute(upsert_sql("tiktok", t["access_token"], t["refresh_token"], t["expires_in"], _now()))
    _secret("TIKTOK_CLIENT_KEY", env["TIKTOK_CLIENT_KEY"])
    _secret("TIKTOK_CLIENT_SECRET", env["TIKTOK_CLIENT_SECRET"])

def yt(env):
    code = _oauth("yt", env)
    t = _http("https://oauth2.googleapis.com/token", {"code": code, "client_id": env["YT_CLIENT_ID"], "client_secret": env["YT_CLIENT_SECRET"],
              "redirect_uri": REDIRECT, "grant_type": "authorization_code"})
    if "refresh_token" not in t:
        sys.exit("no refresh_token returned — revoke the app at myaccount.google.com/permissions and retry")
    _secret("YT_CLIENT_ID", env["YT_CLIENT_ID"])
    _secret("YT_CLIENT_SECRET", env["YT_CLIENT_SECRET"])
    _secret("YT_REFRESH_TOKEN", t["refresh_token"])

def main(argv=None):
    cmds = {"bsky": bsky, "meta": meta, "threads": threads, "tiktok": tiktok, "yt": yt}
    argv = sys.argv[1:] if argv is None else argv
    if len(argv) != 1 or argv[0] not in cmds:
        sys.exit(f"usage: python -m ingest.social_auth {{{'|'.join(cmds)}}}")
    try:
        cmds[argv[0]](os.environ)
    except KeyError as e:
        sys.exit(f"missing {e.args[0]} in ../.env")

if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd crawler && python3 -m pytest ingest/tests/test_social_auth.py -q`
Expected: PASS (3 tests). Also `python3 -m ingest.social_auth` (no args) → prints usage and exits 1.

- [ ] **Step 5: Commit**

```bash
git status --short
git add crawler/ingest/social_auth.py crawler/ingest/tests/test_social_auth.py
git commit -m "feat(social): one-time OAuth / secrets helper (python -m ingest.social_auth)"
```

---

### Task 11: Rollout (operator + user; no new code)

Deploy rules from project memory: deploy from a **clean worktree of HEAD** (`../realufo-deploy`, detached), never from the shared checkout; check pending D1 migrations first; `wrangler deploy` with `env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID … --env-file /dev/null` (OAuth login). Don't push unless the user asks.

- [ ] **Step 1: Migrate remote D1 (before any deploy)**

Run: `pnpm db:migrate`
Expected: `0017_social_posts.sql` applied. Verify: `npx wrangler d1 execute realufo-db --remote --env-file /dev/null --command "SELECT count(*) FROM social_posts"` → `0`.

- [ ] **Step 2: Backfill vertical clips**

Run: `cd crawler && set -a && . ../.env && set +a && CLIP_FONT=$HOME/Library/Fonts/DejaVuSans-Bold.ttf python3 -m ingest.clips --vertical`
Expected: `clips=165 failed=0` (one per video with a landscape clip; count may be higher if new videos landed). Spot-check two in a browser: `https://assets.realufo.org/clips-v/wargov/<id>.mp4`.

- [ ] **Step 3: Deploy dry**

In `wrangler.jsonc` set all six `FEATURE_SOCIAL_*` to `"dry"` and `"SOCIAL_SINCE"` to today's date (`YYYY-MM-DD`). Run the full worker suite, commit (`chore(social): all platforms dry, SOCIAL_SINCE=<date>`), then deploy from the clean worktree of HEAD.

- [ ] **Step 4: Review drafts after the next X post**

Run:
```bash
npx wrangler d1 execute realufo-db --remote --env-file /dev/null --command "SELECT s.platform, s.status, s.error, x.ref, x.media FROM social_posts s JOIN x_posts x ON x.id=s.x_post_id ORDER BY s.id DESC LIMIT 30"
```
Expected: one `draft` per platform per mirrored X post; `failed`/`no video` only on yt/tiktok for non-video items. Show the user, get a go.

- [ ] **Step 5: Per platform, user setup then flip to `on`** (the user creates accounts and apps; Claude cannot)

For each, in order — **Bluesky**, **Meta trio**, **YouTube**, **TikTok**:

1. User creates the account/app:
   - Bluesky: account + Settings → App passwords.
   - Meta: FB Page; IG switched to Business/Creator and linked to the Page; Threads profile on that IG; one Meta app (use cases: Pages, Instagram content publishing, Threads API) with `https://realufo.org/` as redirect URI; add `META_APP_ID/SECRET`, `THREADS_APP_ID/SECRET` to `../.env`.
   - YouTube: channel; Google Cloud project with YouTube Data API v3; OAuth client (Web, redirect `https://realufo.org/`); consent screen **In production**; add `YT_CLIENT_ID/SECRET` to `.env`; submit the API audit form the same day.
   - TikTok: developer app with Login Kit + Content Posting API (Direct Post), redirect `https://realufo.org/`, verify URL prefix `https://assets.realufo.org/`; add `TIKTOK_CLIENT_KEY/SECRET` to `.env`; submit for audit the same day.
2. Run the helper: `cd crawler && set -a && . ../.env && set +a && python3 -m ingest.social_auth <bsky|meta|threads|tiktok|yt>` (Meta trio = `meta` then `threads`).
3. **Keep** the platform's existing `draft` rows (they mark dry-period items as handled; deleting them backfills those items).
4. Set that platform's flag to `"on"` in `wrangler.jsonc`, commit, deploy from the clean worktree.
5. After the next tick, check: `SELECT platform,status,remote_id,error FROM social_posts WHERE platform='<p>' ORDER BY id DESC LIMIT 5` → `posted` with a `remote_id`; open the post on the platform. If `halted` appears in Worker logs (`social: true`), the token is wrong — rerun step 2.

- [ ] **Step 6: Record state**

Update project memory (`realufo-project-state.md`) with: migration 0017, which platforms are `on`, audit status for YT/TikTok, `TIKTOK_PRIVACY` flip pending, pause = flag `off` + deploy. Run `crawler/indexnow.py` is **not** needed (no page changes).

---

## Self-Review (done while writing)

- **Spec coverage:** §2 decisions → Tasks 1, 8 (mirror, child table, flags), 4–7 (own adapters), 9 (pad + blur), 2 (reuse X text), 3 (social_auth), 10 (local OAuth). §3 flow + schema → Tasks 1, 8. §3.2 text → Task 2. §3.3 media table → Task 8 `mediaOf`/`gate` + Task 5 (bsky 1 MB image rule). §4 adapters + limits → Tasks 4–7, YT cap in Task 8. §5 tokens → Tasks 3, 10. §6 errors → Task 8 `fail`/`send` (+ `postedUnrecorded` covered by log-before-write). §7 vertical clips → Task 9. §8 testing → each task's tests. §9 rollout → Task 11. §10 out of scope → nothing built.
- **Placeholders:** none; the two "verify against current docs" notes (Tasks 4, 5, 7) are instructions to re-check field names, with full code given.
- **Type consistency:** `Adapter`/`SocialPost`/`Ctx`/`Published`/`Finished` defined once in Task 2 and used unchanged in Tasks 4–8; `token(env, "threads"|"tiktok", now)` (Task 3) used in Tasks 4, 7; `compose`/`archiveOf`/`bskyFacets` (Task 2) used in Tasks 5, 8; `vkey` convention `clips-v/` (Task 9) matches `mediaOf` (Task 8).
- **Review Focus:** each of the five lines has its test in the owning task (Task 2 ×2, Task 3, Task 8 ×2).
