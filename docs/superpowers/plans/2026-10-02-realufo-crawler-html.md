# Crawler-visible HTML Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve real, crawlable page content and correct meta on every SPA route regardless of `Accept`, with near-zero D1 reads per HTML request.

**Architecture:** The Worker's `serveWithMeta` (worker/lib/meta.ts) already loads the entity from D1 to inject `<head>` tags. It will also string-render plain semantic HTML into `<div id="root">` (React's `createRoot` clears it on mount). Page loaders (D1 → `{meta, body}`) live in a new `worker/lib/pages.ts`; pure HTML renderers in a new `worker/lib/ssr.ts`. Loaded page data is cached 1h in the Workers Cache API keyed by pathname.

**Tech Stack:** Cloudflare Workers (TypeScript), D1, Workers Cache API, vitest + `@cloudflare/vitest-pool-workers`.

**Spec:** `docs/superpowers/specs/2026-10-02-realufo-crawler-html-design.md`

## Global Constraints

- Every interpolated value in rendered HTML goes through `esc()`; hrefs are built from ids via `encodeURIComponent`.
- Every `String.prototype.replace` that inserts generated/user text uses a **function** replacement (`() => text`), never a string (string replacements expand `$&`, `$'`, `` $` ``).
- Doc h1 = full official title including id (do not `shortTitle` it). `<title>`/og:title keep the existing `"<short title> — UAP file <id>"` format.
- Not-found entity → unmodified index.html, status 200 (unchanged behaviour).
- Page-data cache: key `<origin>/__page<pathname>`, `cache-control: max-age=3600`, `null` never cached, cache the `{meta, body}` JSON — never the final HTML.
- No client (`web/`) changes.
- Other chats share this checkout: stage only the files a task names (`git add <paths>`), never `git add -A`/`.`.
- Run worker tests with `pnpm test:worker` (repo root). If the default Node misbehaves, use Node 22 (`engines` pins `>=22 <23`).

## Review Focus

1. User text containing `$&` / `$'` in a thread title or body → appears literally (today `injectMeta` uses a string replacement and would mangle it). Test in Task 3.
2. Thread body/handle containing `<script>` or `</script>` → escaped in body HTML, no raw tag. Test in Task 3.
3. Record ids with spaces/`#`/`?` (real NARA ids are long free-form strings) → `/doc/` hrefs percent-encoded. Test in Task 1.
4. Record with missing agency/date, location `"N/A"`, no summary, no release → no empty `<dt>/<dd>` pairs, no "N/A", no empty sections. Test in Task 1.
5. Deploy changes the JS bundle hash while page data is cached → response still carries the *current* index.html. Test in Task 4.

---

### Task 1: Pure HTML renderers (`worker/lib/ssr.ts`)

**Files:**
- Create: `worker/lib/ssr.ts`
- Test: `worker/tests/ssr.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (all exported from `worker/lib/ssr.ts`):
  - `DEFAULT_DESCRIPTION: string`
  - `esc(s: string): string`
  - `type Link = { href: string; text: string }`
  - `docHref(id: string): string`, `threadHref(id: string): string`, `boardHref(slug: string): string` (accepts `"/uap/"` or `"uap"`)
  - `type RecordLink = { id: string; title: string }`
  - `section(heading: string, items: Link[]): string`, `docLinks(rs: RecordLink[]): Link[]`, `countList(heading: string, items: { name: string; count: number }[]): string`
  - `injectBody(html: string, body: string): string`
  - `homeBody(latest: RecordLink[]): string`
  - `tabBody(title: string, intro: string, ...sections: string[]): string`
  - `type DocData`, `docBody(d: DocData): string`
  - `type ThreadData`, `threadBody(t: ThreadData): string`
  - `boardBody(b: { name: string; desc: string | null; threads: { id: string; title: string }[] }): string`
  - `caseBody(c: { name: string; lede: string | null; pull: string | null; pull_cite: string | null; thread: { id: string; title: string } | null }): string`

- [ ] **Step 1: Write the failing test** — `worker/tests/ssr.spec.ts`

```ts
import { describe, it, expect } from "vitest";
import { esc, docHref, boardHref, injectBody, docBody, threadBody, caseBody, homeBody, type DocData } from "../lib/ssr";

const doc = (over: Partial<DocData["record"]> = {}, rest: Partial<DocData> = {}): DocData => ({
  record: {
    id: "FBI-UAP-D002", title: "FBI-UAP-D002, FD-1057, Unresolved UAP Report", summary: "Line one.\nLine two.",
    agency: "FBI", agency_full: "Federal Bureau of Investigation", incident_date: "2022",
    location: "Colorado Springs", doc_date: "6/12/26", kind: "pdf", ...over,
  },
  assets: [],
  promotedThreads: [],
  series: { prev: null, next: "FBI-UAP-D003" },
  release: { no: 3, date: "2026-06-12" },
  related: [{ key: "location", label: "Colorado Springs", records: [{ id: "ICA-UAP-D001", title: "ICA thing" }] }],
  ...rest,
});

describe("ssr helpers", () => {
  it("esc escapes & < > \"", () => {
    expect(esc(`a & <b> "c"`)).toBe("a &amp; &lt;b&gt; &quot;c&quot;");
  });
  it("hrefs percent-encode odd ids and strip board slashes", () => {
    expect(docHref("A B#1?x")).toBe("/doc/A%20B%231%3Fx");
    expect(boardHref("/uap/")).toBe("/board/uap");
    expect(boardHref("uap")).toBe("/board/uap");
  });
  it("injectBody fills the empty root and leaves other html alone", () => {
    const out = injectBody('<body><div id="root"></div></body>', "<h1>Hi $& there</h1>");
    expect(out).toContain('<div id="root"><style>');
    expect(out).toContain("<h1>Hi $& there</h1>");
    expect(out).toContain('<a href="/archive">Archive</a>');
    expect(injectBody("<body></body>", "<h1>x</h1>")).toBe("<body></body>");
  });
});

describe("docBody", () => {
  it("renders full-title h1, facts, summary paragraphs, file link, series and related", () => {
    const out = docBody(doc());
    expect(out).toContain("<h1>FBI-UAP-D002, FD-1057, Unresolved UAP Report</h1>");
    expect(out).toContain("<dt>Agency</dt><dd>Federal Bureau of Investigation</dd>");
    expect(out).toContain("<dt>Released in</dt><dd>Release 03 (2026-06-12)</dd>");
    expect(out).toContain("<dt>File type</dt><dd>PDF</dd>");
    expect(out).toContain("<p>Line one.</p><p>Line two.</p>");
    expect(out).toContain('href="/api/file/FBI-UAP-D002"');
    expect(out).toContain('<a href="/doc/FBI-UAP-D003">Next: FBI-UAP-D003</a>');
    expect(out).toContain("<h2>Same location: Colorado Springs</h2>");
    expect(out).toContain('<a href="/doc/ICA-UAP-D001">ICA thing</a>');
  });
  it("omits missing facts, N/A location, empty summary and empty sections", () => {
    const out = docBody(
      doc({ agency: null, agency_full: null, incident_date: null, location: "N/A", summary: null }, {
        release: null, related: [], series: { prev: null, next: null },
      })
    );
    expect(out).not.toContain("<dt>Agency</dt>");
    expect(out).not.toContain("<dt>Incident date</dt>");
    expect(out).not.toContain("N/A");
    expect(out).not.toContain("<dt>Released in</dt>");
    expect(out).not.toContain("<h2>");
    expect(out).not.toMatch(/<dd><\/dd>/);
  });
  it("shows video length from the full asset as m:ss", () => {
    const out = docBody(doc({ kind: "video" }, { assets: [{ role: "full", cdn_url: "u", mime: "video/mp4", duration: 125.4 }] }));
    expect(out).toContain("<dt>Length</dt><dd>2:05</dd>");
  });
  it("escapes record text", () => {
    expect(docBody(doc({ title: "<img src=x>" }))).toContain("<h1>&lt;img src=x&gt;</h1>");
  });
});

describe("threadBody / caseBody / homeBody", () => {
  it("thread escapes user text and links board + source file", () => {
    const out = threadBody({
      title: "T", boardSlug: "/uap/", boardName: "UAP General", sourceRecordId: "CIA-UAP-017",
      opBody: "op <script>alert(1)</script>", opHandle: null,
      replies: [{ handle: "<b>h</b>", body: "reply </script>" }],
    });
    expect(out).not.toContain("<script>");
    expect(out).not.toContain("</script>");
    expect(out).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(out).toContain("<b>Anonymous</b>");
    expect(out).toContain("<b>&lt;b&gt;h&lt;/b&gt;</b>");
    expect(out).toContain('<a href="/board/uap">UAP General</a>');
    expect(out).toContain('<a href="/doc/CIA-UAP-017">File CIA-UAP-017</a>');
  });
  it("case renders lede, pull quote with cite, and thread link", () => {
    const out = caseBody({ name: "Kaikoura", lede: "Lede.", pull: "Quote.", pull_cite: "Pilot", thread: { id: "t5", title: "Talk" } });
    expect(out).toContain("<h1>Kaikoura</h1>");
    expect(out).toContain("<blockquote><p>Quote.</p><cite>Pilot</cite></blockquote>");
    expect(out).toContain('<a href="/thread/t5">Talk</a>');
  });
  it("home lists latest files", () => {
    expect(homeBody([{ id: "X-1", title: "One" }])).toContain('<a href="/doc/X-1">One</a>');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:worker -- worker/tests/ssr.spec.ts`
Expected: FAIL — cannot resolve `../lib/ssr`.

- [ ] **Step 3: Write the implementation** — `worker/lib/ssr.ts`

```ts
// Plain-HTML pre-render of SPA routes, injected by meta.ts serveWithMeta into
// <div id="root">. React's createRoot clears it on mount, so this is what
// crawlers, share scrapers and the pre-JS moment see. It must say the same
// things the SPA shows on that URL. Every interpolated value goes through
// esc(): thread bodies and handles are anonymous user input.

// Same copy as the default block in web/index.html.
export const DEFAULT_DESCRIPTION =
  "Searchable archive of declassified UAP/UFO records from the Pentagon, CIA, FBI and NASA, with case files, a sighting map and anonymous discussion boards.";

export const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export type Link = { href: string; text: string };
export type RecordLink = { id: string; title: string };

export const docHref = (id: string) => `/doc/${encodeURIComponent(id)}`;
export const threadHref = (id: string) => `/thread/${encodeURIComponent(id)}`;
// boards.slug is slash-wrapped ("/uap/"); the URL uses the bare slug.
export const boardHref = (slug: string) => `/board/${encodeURIComponent(slug.replace(/^\/|\/$/g, ""))}`;

const a = (l: Link) => `<a href="${esc(l.href)}">${esc(l.text)}</a>`;
const ul = (items: Link[]) => `<ul>${items.map((l) => `<li>${a(l)}</li>`).join("")}</ul>`;
const paras = (text: string | null | undefined) =>
  (text || "")
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p)}</p>`)
    .join("");
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export const section = (heading: string, items: Link[]) =>
  items.length ? `<section><h2>${esc(heading)}</h2>${ul(items)}</section>` : "";
export const docLinks = (rs: RecordLink[]): Link[] => rs.map((r) => ({ href: docHref(r.id), text: r.title }));
export const countList = (heading: string, items: { name: string; count: number }[]) =>
  items.length
    ? `<section><h2>${esc(heading)}</h2><ul>${items.map((x) => `<li>${esc(x.name)} (${x.count})</li>`).join("")}</ul></section>`
    : "";

const NAV: Link[] = [
  { href: "/", text: "RealUFO" },
  { href: "/archive", text: "Archive" },
  { href: "/boards", text: "Boards" },
  { href: "/map", text: "Map" },
];
const STYLE =
  "<style>#root>.ssr{background:#07080c;color:#e6e6e6;font:16px/1.6 system-ui,sans-serif;max-width:860px;margin:0 auto;padding:24px 16px}" +
  "#root>.ssr a{color:#9ecbff}#root>.ssr dt{opacity:.7}#root>.ssr blockquote{border-left:3px solid #444;margin:1em 0;padding-left:1em}</style>";

// Fills the SPA's empty mount point. Function replacement: a string
// replacement would expand `$&`/`$'` patterns in user text.
export function injectBody(html: string, body: string): string {
  return html.replace(
    '<div id="root"></div>',
    () => `<div id="root">${STYLE}<div class="ssr"><nav>${NAV.map(a).join(" · ")}</nav><main>${body}</main></div></div>`
  );
}

export const tabBody = (title: string, intro: string, ...sections: string[]) =>
  `<h1>${esc(title)}</h1>${paras(intro)}${sections.join("")}`;

export const homeBody = (latest: RecordLink[]) =>
  tabBody("RealUFO — Declassified UAP Archive", DEFAULT_DESCRIPTION, section("Latest files", docLinks(latest)));

export type DocData = {
  record: {
    id: string; title: string; summary: string | null; agency: string | null; agency_full: string | null;
    incident_date: string | null; location: string | null; doc_date: string | null; kind: string;
  };
  assets: { role: string; cdn_url: string; mime: string | null; duration?: number | null }[];
  promotedThreads: { id: string; title: string }[];
  series: { prev: string | null; next: string | null };
  release: { no: number; date: string } | null;
  related: { key: string; label: string; records: RecordLink[] }[];
};

const RELATED_HEADING: Record<string, string> = {
  location: "Same location", period: "Same period", release: "Same release", agency: "Same agency",
};

export function docBody(d: DocData): string {
  const r = d.record;
  const dur = d.assets.find((x) => x.role === "full" && x.duration)?.duration;
  const facts: [string, string | null | undefined][] = [
    ["File", r.id],
    ["Agency", r.agency_full || r.agency],
    ["Incident date", r.incident_date],
    ["Location", r.location && r.location !== "N/A" ? r.location : null],
    ["Released in", d.release && `Release ${String(d.release.no).padStart(2, "0")} (${d.release.date})`],
    ["File type", r.kind.toUpperCase()],
    ["Length", dur ? mmss(dur) : null],
  ];
  const series = [
    d.series.prev && a({ href: docHref(d.series.prev), text: `Previous: ${d.series.prev}` }),
    d.series.next && a({ href: docHref(d.series.next), text: `Next: ${d.series.next}` }),
  ].filter(Boolean);
  return [
    `<p>${a({ href: "/", text: "Home" })} › ${a({ href: "/archive", text: "Archive" })}${r.agency ? ` › ${esc(r.agency)}` : ""}</p>`,
    `<h1>${esc(r.title)}</h1>`,
    `<dl>${facts.filter(([, v]) => v).map(([k, v]) => `<dt>${k}</dt><dd>${esc(String(v))}</dd>`).join("")}</dl>`,
    paras(r.summary),
    `<p>${a({ href: `/api/file/${encodeURIComponent(r.id)}`, text: "Open original file" })}</p>`,
    series.length ? `<p>${series.join(" · ")}</p>` : "",
    ...d.related.map((g) => section(`${RELATED_HEADING[g.key] ?? "Related"}: ${g.label}`, docLinks(g.records))),
    section("Discussion", d.promotedThreads.map((t) => ({ href: threadHref(t.id), text: t.title }))),
  ].join("");
}

export type ThreadData = {
  title: string; boardSlug: string | null; boardName: string | null; sourceRecordId: string | null;
  opBody: string | null; opHandle: string | null;
  replies: { handle: string | null; body: string | null }[];
};

export function threadBody(t: ThreadData): string {
  const post = (handle: string | null, body: string | null) =>
    `<article><p><b>${esc(handle || "Anonymous")}</b></p>${paras(body)}</article>`;
  return [
    t.boardSlug ? `<p>${a({ href: boardHref(t.boardSlug), text: t.boardName || t.boardSlug })}</p>` : "",
    `<h1>${esc(t.title)}</h1>`,
    t.sourceRecordId ? `<p>${a({ href: docHref(t.sourceRecordId), text: `File ${t.sourceRecordId}` })}</p>` : "",
    post(t.opHandle, t.opBody),
    ...t.replies.map((p) => post(p.handle, p.body)),
  ].join("");
}

export const boardBody = (b: { name: string; desc: string | null; threads: { id: string; title: string }[] }) =>
  tabBody(b.name, b.desc || "", section("Threads", b.threads.map((t) => ({ href: threadHref(t.id), text: t.title }))));

export function caseBody(c: {
  name: string; lede: string | null; pull: string | null; pull_cite: string | null; thread: { id: string; title: string } | null;
}): string {
  const quote = c.pull ? `<blockquote>${paras(c.pull)}${c.pull_cite ? `<cite>${esc(c.pull_cite)}</cite>` : ""}</blockquote>` : "";
  const discussion = c.thread ? section("Discussion", [{ href: threadHref(c.thread.id), text: c.thread.title }]) : "";
  return tabBody(c.name, c.lede || "", quote, discussion);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:worker -- worker/tests/ssr.spec.ts`
Expected: PASS (all ssr tests).

- [ ] **Step 5: Commit**

```bash
git add worker/lib/ssr.ts worker/tests/ssr.spec.ts
git commit -m "feat(seo): plain-HTML renderers for crawler-visible pages"
```

---

### Task 2: Split `getRecord` into `loadRecord` + route wrapper

**Files:**
- Modify: `worker/routes/records.ts` (`getRecord`, bottom of file)
- Test: `worker/tests/records.spec.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `export async function loadRecord(env: Env, id: string): Promise<{ record; assets; promotedThreads; series; release; related } | null>` — same object `GET /api/records/:id` returns, `assets` rows now also carry `duration` (REAL, nullable; column exists since migration 0008). Callers cast to `DocData` from Task 1.

- [ ] **Step 1: Write the failing test** — append inside `describe("records", …)` in `worker/tests/records.spec.ts`, and add `loadRecord` to the imports:

```ts
import { loadRecord } from "../routes/records";
```

```ts
  it("loadRecord returns the detail object, or null when missing", async () => {
    expect(await loadRecord(env as any, "NOPE")).toBeNull();
    const d: any = await loadRecord(env as any, "FBI-UAP-D002");
    expect(d.record.id).toBe("FBI-UAP-D002");
    expect(d.series.next).toBe("FBI-UAP-D003");
    expect(d.related.some((g: any) => g.key === "location")).toBe(true);
    expect(d.assets.every((a: any) => "duration" in a)).toBe(true);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:worker -- worker/tests/records.spec.ts`
Expected: FAIL — `loadRecord` is not exported.

- [ ] **Step 3: Implement** — replace the existing `getRecord` in `worker/routes/records.ts` with:

```ts
// The doc detail object, shared by GET /api/records/:id and the Worker's
// pre-render of /doc/:id (lib/pages.ts). Null when the record doesn't exist.
export async function loadRecord(env: Env, id: string) {
  const record = await env.DB.prepare("SELECT * FROM records WHERE id=?")
    .bind(id)
    .first<RecordRow>();
  if (!record) return null;
  const releaseP = releaseOf(env, record);
  const [assets, promoted, series, release, related] = await Promise.all([
    env.DB.prepare("SELECT role,cdn_url,mime,width,height,duration FROM assets WHERE record_id=?").bind(id).all(),
    env.DB.prepare(
      `SELECT t.id,t.no,t.title,t.stance,t.votes,t.source_record_id,b.slug boardSlug,b.accent accent
                    FROM threads t JOIN boards b ON b.id=t.board_id WHERE t.source_record_id=?`
    )
      .bind(id)
      .all(),
    seriesNav(env, id),
    releaseP,
    releaseP.then((rel) => relatedOf(env, record, rel)),
  ]);
  return { record, assets: assets.results, promotedThreads: promoted.results, series, release, related };
}

export async function getRecord(_req: Request, env: Env, p: Record<string, string>) {
  const data = await loadRecord(env, p.id);
  return data ? json(data) : error(404, "record not found");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:worker -- worker/tests/records.spec.ts`
Expected: PASS (new test + all existing records tests unchanged).

- [ ] **Step 5: Commit**

```bash
git add worker/routes/records.ts worker/tests/records.spec.ts
git commit -m "refactor(records): loadRecord shared by the API and page pre-render; assets carry duration"
```

---

### Task 3: Page loaders + rewire `serveWithMeta` (Accept gate, body, breadcrumbs, homepage)

**Files:**
- Create: `worker/lib/pages.ts`
- Modify: `worker/lib/meta.ts` (whole file restructured — `injectMeta` kept, `STATIC_META`/`META_ROUTES`/`lookupMeta` move into pages.ts as loaders)
- Modify: `wrangler.jsonc:10` (`run_worker_first`)
- Test: `worker/tests/meta.spec.ts`

**Interfaces:**
- Consumes: Task 1 exports from `./ssr`; Task 2 `loadRecord` from `../routes/records`; existing `thumbSql` (`./db`), `uploadUrl` (`./upload`).
- Produces:
  - `worker/lib/meta.ts`: `MetaInput` (adds `breadcrumbs?: { name: string; href: string }[]`), `injectMeta(html, m)`, `serveWithMeta(req, env)`, re-export `DEFAULT_DESCRIPTION`.
  - `worker/lib/pages.ts`: `type Page = { meta: Omit<MetaInput, "url">; body: string }`, `type Loader = (env: Env, groups: Record<string, string>, url: URL) => Promise<Page | null>`, `export const ROUTES: { pattern: URLPattern; load: Loader }[]`.

- [ ] **Step 1: Write the failing tests** — append to `worker/tests/meta.spec.ts`:

```ts
describe("pre-rendered body", () => {
  const SHELL = '<html><head><!--META--></head><body><div id="root"></div></body></html>';
  const fakeEnv = () => ({ ...env, UPLOAD_BASE: "https://cdn/uploads/", ASSETS: { fetch: async () => new Response(SHELL) } }) as any;
  const get = async (path: string, accept = "*/*") => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("https://x" + path, { headers: { accept } }), fakeEnv(), ctx);
    await waitOnExecutionContext(ctx);
    return res.text();
  };
  const lds = (html: string) =>
    [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));

  beforeAll(async () => {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO threads(id,no,board_id,title,op_body,op_handle,reply_count,created_at) VALUES('t_ssr',9,'uap','Costs $& more','op <script>alert(1)</script>','anon $1',1,'2026-10-02 08:00:00')"
      ),
      env.DB.prepare(
        "INSERT INTO posts(id,no,thread_id,body,handle,is_op,created_at) VALUES('p_ssr',2,'t_ssr','reply $'' tail','h',0,'2026-10-02 09:00:00')"
      ),
    ]);
  });

  it("doc: meta + body even with Accept */* (share scrapers)", async () => {
    const html = await get("/doc/FBI-UAP-D002");
    expect(html).toContain("— UAP file FBI-UAP-D002 · RealUFO</title>");
    expect(html).toContain("<h1>FBI-UAP-D002, FD-1057, Unresolved UAP Report</h1>");
    expect(html).toContain('<a href="/doc/FBI-UAP-D003">');
    const crumbs = lds(html).find((j) => j["@type"] === "BreadcrumbList");
    expect(crumbs.itemListElement.map((i: any) => i.item)).toEqual([
      "https://x/", "https://x/archive", "https://x/doc/FBI-UAP-D002",
    ]);
  });

  it("thread: user text escaped and $-patterns kept literally in head and body", async () => {
    const html = await get("/thread/t_ssr");
    expect(html).toContain("<title>Costs $&amp; more · RealUFO</title>");
    expect(html).toContain("<h1>Costs $&amp; more</h1>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("<b>anon $1</b>");
    expect(html).toContain("<p>reply $' tail</p>"); // `$'` survives (string replace would splice the rest of the doc)
  });

  it("home: canonical, WebSite JSON-LD with search, latest doc links", async () => {
    const html = await get("/");
    expect(html).toContain('<link rel="canonical" href="https://x/">');
    const site = lds(html).find((j) => j["@type"] === "WebSite");
    expect(site.potentialAction.target).toBe("https://x/archive?q={search_term_string}");
    expect(html).toMatch(/<a href="\/doc\/[^"]+">/);
  });

  it("archive lists agencies with counts; boards lists board links", async () => {
    expect(await get("/archive")).toMatch(/<li>FBI \(\d+\)<\/li>/);
    expect(await get("/boards")).toContain('<a href="/board/uap">');
  });

  it("case renders lede and its discussion thread", async () => {
    const html = await get("/case/kaikoura");
    expect(html).toContain("<h1>The Kaikoura Lights</h1>");
    expect(html).toContain('<a href="/thread/t5">');
  });

  it("unknown doc keeps the empty root", async () => {
    expect(await get("/doc/NOPE")).toContain('<div id="root"></div>');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:worker -- worker/tests/meta.spec.ts`
Expected: FAIL — `/doc` with `*/*` returns the default title; no `<h1>`; no BreadcrumbList; `/` not handled.

- [ ] **Step 3: Create `worker/lib/pages.ts`**

```ts
import type { Env } from "../env";
import type { MetaInput } from "./meta";
import { thumbSql } from "./db";
import { uploadUrl } from "./upload";
import { loadRecord } from "../routes/records";
import {
  DEFAULT_DESCRIPTION, type DocData, docBody, threadBody, boardBody, caseBody, homeBody, tabBody,
  section, docLinks, countList, boardHref, docHref,
} from "./ssr";

// One SPA route's pre-render: <head> meta (url is filled in by serveWithMeta)
// and the HTML that goes inside #root. A loader returns null when the entity
// doesn't exist; serveWithMeta then serves index.html untouched.
export type Page = { meta: Omit<MetaInput, "url">; body: string };
export type Loader = (env: Env, groups: Record<string, string>, url: URL) => Promise<Page | null>;

// D1 "YYYY-MM-DD HH:MM:SS" (UTC) → ISO 8601.
const iso = (d: string | null) => (d ? d.replace(" ", "T") + "Z" : undefined);
const person = (handle: string | null) => ({ "@type": "Person", name: handle || "Anonymous" });
// Same as Doc.tsx's shortTitle: drop a leading "<ID>, " prefix.
const shortTitle = (t: string) => {
  const c = t.indexOf(",");
  return (c > 0 && c < 34 ? t.slice(c + 1).trim() : t).replace(/_/g, " ");
};

const latest = async (env: Env) =>
  (
    await env.DB.prepare("SELECT id,title FROM records WHERE status='live' ORDER BY created_at DESC, id LIMIT 30").all<{
      id: string; title: string;
    }>()
  ).results;

const TAB = {
  archive: {
    title: "The Archive",
    description: "Browse and search every declassified UAP record — PDFs, images and video from AARO, the Pentagon, CIA, FBI and NASA.",
    type: "website" as const,
  },
  boards: {
    title: "The Boards",
    description: "Anonymous discussion boards for UAP sightings, declassified files and cold cases.",
    type: "website" as const,
  },
  map: { title: "Sighting Map", description: "Map of where the declassified UAP files come from.", type: "website" as const },
};

const homePage: Loader = async (env, _g, url) => ({
  meta: {
    title: "Declassified UAP Archive",
    description: DEFAULT_DESCRIPTION,
    type: "website",
    jsonLd: {
      "@type": "WebSite",
      name: "RealUFO",
      potentialAction: {
        "@type": "SearchAction",
        target: `${url.origin}/archive?q={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    },
  },
  body: homeBody(await latest(env)),
});

const archivePage: Loader = async (env) => {
  const [agencies, recent] = await Promise.all([
    env.DB.prepare(
      "SELECT agency name, count(*) count FROM records WHERE status='live' AND agency IS NOT NULL AND trim(agency)<>'' GROUP BY agency ORDER BY count DESC, name"
    ).all<{ name: string; count: number }>(),
    latest(env),
  ]);
  const t = TAB.archive;
  return { meta: t, body: tabBody(t.title, t.description, countList("Agencies", agencies.results), section("Latest files", docLinks(recent))) };
};

const boardsPage: Loader = async (env) => {
  const { results } = await env.DB.prepare("SELECT slug,name,desc FROM boards ORDER BY rowid").all<{
    slug: string; name: string; desc: string | null;
  }>();
  const t = TAB.boards;
  const links = results.map((b) => ({ href: boardHref(b.slug), text: b.desc ? `${b.name} — ${b.desc}` : b.name }));
  return { meta: t, body: tabBody(t.title, t.description, section("Boards", links)) };
};

const mapPage: Loader = async () => ({ meta: TAB.map, body: tabBody(TAB.map.title, TAB.map.description) });

const docPage: Loader = async (env, g) => {
  const d = (await loadRecord(env, g.id)) as DocData | null;
  if (!d) return null;
  const x = d.record;
  const agency = x.agency_full || x.agency;
  // No summary → build one from the record's facts rather than an empty description.
  const facts = [agency, x.incident_date, x.location].filter(Boolean).join(" · ");
  const description = x.summary || (facts ? `Declassified UAP record — ${facts}.` : "");
  // Matches the SPA's tab title (Doc.tsx): "<short title> — UAP file <id>".
  const title = `${shortTitle(x.title)} — UAP file ${x.id}`;
  // Same pick as thumbSql, from the assets already loaded.
  const thumb =
    d.assets.find((a) => a.role === "thumb") ?? d.assets.find((a) => a.role === "full" && a.mime?.startsWith("image/"));
  return {
    meta: {
      title, description, image: thumb?.cdn_url ?? null,
      jsonLd: {
        "@type": "DigitalDocument", name: title, identifier: x.id, description,
        dateCreated: x.doc_date || undefined, contentLocation: x.location || undefined,
        publisher: agency ? { "@type": "GovernmentOrganization", name: agency } : undefined,
      },
      breadcrumbs: [
        { name: "Home", href: "/" },
        { name: "Archive", href: "/archive" },
        { name: x.id, href: docHref(x.id) },
      ],
    },
    body: docBody(d),
  };
};

const boardPage: Loader = async (env, g) => {
  // URL slug is bare ("uap"), the column is slash-wrapped ("/uap/").
  const x = await env.DB.prepare("SELECT id,name,desc FROM boards WHERE slug=?")
    .bind(`/${g.slug}/`)
    .first<{ id: string; name: string; desc: string | null }>();
  if (!x) return null;
  const { results: threads } = await env.DB.prepare(
    "SELECT id,title FROM threads WHERE board_id=? ORDER BY created_at DESC LIMIT 50"
  )
    .bind(x.id)
    .all<{ id: string; title: string }>();
  return {
    meta: {
      title: x.name, description: x.desc || "", type: "website",
      jsonLd: { "@type": "CollectionPage", name: x.name, description: x.desc || undefined },
    },
    body: boardBody({ name: x.name, desc: x.desc, threads }),
  };
};

const casePage: Loader = async (env, g) => {
  const [x, thread] = await Promise.all([
    env.DB.prepare("SELECT name,lede,pull,pull_cite FROM cases WHERE slug=?")
      .bind(g.slug)
      .first<{ name: string; lede: string | null; pull: string | null; pull_cite: string | null }>(),
    env.DB.prepare("SELECT id,title FROM threads WHERE case_slug=? LIMIT 1").bind(g.slug).first<{ id: string; title: string }>(),
  ]);
  if (!x) return null;
  const description = (x.lede || "").slice(0, 200);
  return {
    meta: { title: x.name, description, jsonLd: { "@type": "Article", headline: x.name, description } },
    body: caseBody({ ...x, thread }),
  };
};

const threadPage: Loader = async (env, g) => {
  const x = await env.DB.prepare(
    `SELECT t.title,t.op_body,t.op_handle,t.reply_count,t.created_at,t.source_record_id,b.slug board_slug,b.name board_name,
       ${thumbSql("t.source_record_id")} thumb
     FROM threads t LEFT JOIN boards b ON b.id=t.board_id WHERE t.id=?`
  )
    .bind(g.id)
    .first<{
      title: string; op_body: string | null; op_handle: string | null; reply_count: number; created_at: string | null;
      source_record_id: string | null; board_slug: string | null; board_name: string | null; thumb: string | null;
    }>();
  if (!x) return null;
  // ponytail: first 50 replies only; page the JSON-LD/body if threads get huge.
  const { results: posts } = await env.DB.prepare(
    "SELECT body,handle,image_r2_key,is_op,created_at FROM posts WHERE thread_id=? ORDER BY is_op DESC, created_at ASC LIMIT 51"
  )
    .bind(g.id)
    .all<{ body: string; handle: string | null; image_r2_key: string | null; is_op: number; created_at: string | null }>();
  const op = posts.find((p) => p.is_op);
  const replies = posts.filter((p) => !p.is_op);
  return {
    meta: {
      title: x.title,
      description: (x.op_body || "").slice(0, 200),
      image: uploadUrl(env, op?.image_r2_key ?? null) || x.thumb,
      jsonLd: {
        "@type": "DiscussionForumPosting",
        headline: x.title,
        text: x.op_body || "",
        author: person(x.op_handle),
        datePublished: iso(x.created_at),
        commentCount: x.reply_count,
        comment: replies.map((p) => ({ "@type": "Comment", text: p.body, author: person(p.handle), datePublished: iso(p.created_at) })),
      },
    },
    body: threadBody({
      title: x.title, boardSlug: x.board_slug, boardName: x.board_name, sourceRecordId: x.source_record_id,
      opBody: x.op_body, opHandle: x.op_handle, replies,
    }),
  };
};

export const ROUTES: { pattern: URLPattern; load: Loader }[] = [
  { pattern: new URLPattern({ pathname: "/" }), load: homePage },
  { pattern: new URLPattern({ pathname: "/archive" }), load: archivePage },
  { pattern: new URLPattern({ pathname: "/boards" }), load: boardsPage },
  { pattern: new URLPattern({ pathname: "/map" }), load: mapPage },
  { pattern: new URLPattern({ pathname: "/doc/:id" }), load: docPage },
  { pattern: new URLPattern({ pathname: "/case/:slug" }), load: casePage },
  { pattern: new URLPattern({ pathname: "/thread/:id" }), load: threadPage },
  { pattern: new URLPattern({ pathname: "/board/:slug" }), load: boardPage },
];
```

- [ ] **Step 4: Replace `worker/lib/meta.ts`** with:

```ts
import type { Env } from "../env";
import { esc, injectBody, DEFAULT_DESCRIPTION } from "./ssr";
import { ROUTES } from "./pages";

export { DEFAULT_DESCRIPTION };

export interface MetaInput {
  title: string;
  description: string;
  image?: string | null;
  url: string;
  type?: "website" | "article";
  // schema.org object; "@context", url and image are filled in by serveWithMeta.
  jsonLd?: Record<string, unknown>;
  // Emitted as a BreadcrumbList; hrefs are resolved against url.
  breadcrumbs?: { name: string; href: string }[];
}

// `<` escaped so user text can't close the script element.
const ldScript = (o: unknown) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`;

// Replaces the `<!--META-->…<!--/META-->` default block (or a bare
// `<!--META-->` placeholder) in `html` with per-route <title> +
// description + OpenGraph/Twitter tags + JSON-LD. All interpolated values are
// HTML-escaped. Also strips any pre-existing static `<title>` so the injected
// title is the only one left (the FIRST <title> wins for document.title). If
// the placeholder isn't present, html is returned unchanged (aside from that
// title strip).
export function injectMeta(html: string, m: MetaInput): string {
  const t = esc(m.title);
  const d = esc(m.description || DEFAULT_DESCRIPTION);
  const u = esc(m.url);
  const img = m.image ? esc(m.image) : "";
  const tags = [
    `<title>${t} · RealUFO</title>`,
    `<meta name="description" content="${d}">`,
    `<link rel="canonical" href="${u}">`,
    `<meta property="og:site_name" content="RealUFO">`,
    `<meta property="og:type" content="${m.type ?? "article"}">`,
    `<meta property="og:title" content="${t}">`,
    `<meta property="og:description" content="${d}">`,
    `<meta property="og:url" content="${u}">`,
    img && `<meta property="og:image" content="${img}">`,
    `<meta name="twitter:card" content="${img ? "summary_large_image" : "summary"}">`,
    m.jsonLd && ldScript(m.jsonLd),
    m.breadcrumbs &&
      ldScript({
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: m.breadcrumbs.map((b, i) => ({
          "@type": "ListItem", position: i + 1, name: b.name, item: new URL(b.href, m.url).href,
        })),
      }),
  ]
    .filter(Boolean)
    .join("\n");
  const withoutStaticTitle = html.replace(/<title>.*?<\/title>/is, "");
  // Function replacement: a string replacement would expand `$&`/`$'` in titles.
  return withoutStaticTitle.replace(/<!--META-->(?:[\s\S]*?<!--\/META-->)?/, () => tags);
}

// Site share card (web/public/og.png) for pages without their own image.
const shareCard = (url: URL) => new URL("/og.png", url).href;
const htmlResponse = (body: string) => new Response(body, { headers: { "content-type": "text/html;charset=utf-8" } });

// GET on a pre-rendered SPA route (lib/pages.ts ROUTES) → the built index.html
// with per-route <head> meta and a plain-HTML body in #root, whatever the
// Accept header (share scrapers often send */*). Entity not found → index.html
// untouched. Every other request goes straight to env.ASSETS.
export async function serveWithMeta(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  if (req.method === "GET") {
    for (const r of ROUTES) {
      const match = r.pattern.exec({ pathname: url.pathname });
      if (!match) continue;
      const html = await (await env.ASSETS.fetch(new Request(new URL("/index.html", url)))).text();
      const page = await r.load(env, match.pathname.groups as Record<string, string>, url);
      if (!page) return htmlResponse(html);
      const image = page.meta.image || shareCard(url);
      const jsonLd = page.meta.jsonLd && { "@context": "https://schema.org", ...page.meta.jsonLd, url: url.href, image };
      return htmlResponse(injectBody(injectMeta(html, { ...page.meta, image, url: url.href, jsonLd }), page.body));
    }
  }
  return env.ASSETS.fetch(req);
}
```

- [ ] **Step 5: Route `/` through the Worker** — `wrangler.jsonc` line 10, add `"/"` as the first entry (exact path only; never `"/*"`):

```jsonc
    "run_worker_first": ["/", "/api/*", "/doc/*", "/case/*", "/thread/*", "/board/*", "/archive", "/boards", "/map", "/sitemap.xml"] },
```

- [ ] **Step 6: Run the worker suite**

Run: `pnpm test:worker`
Expected: PASS, including all pre-existing `meta.spec.ts` tests (`/doc/NOPE` placeholder intact, `/about` passthrough, `/archive` title, board meta, thread JSON-LD) and the new "pre-rendered body" block. If `/archive`'s pre-existing test asserts on the old static flow only, it should still pass unchanged — the title and og tags are identical.

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit -p worker` (if `worker/tsconfig.json` doesn't exist, run `npx tsc --noEmit` at the repo root).
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add worker/lib/pages.ts worker/lib/meta.ts wrangler.jsonc worker/tests/meta.spec.ts
git commit -m "feat(seo): crawler-visible HTML body, meta for any Accept, homepage canonical + WebSite JSON-LD, breadcrumbs"
```

---

### Task 4: Page-data cache (Workers Cache API)

**Files:**
- Modify: `worker/lib/meta.ts` (`serveWithMeta` + new `cachedPage`)
- Test: `worker/tests/meta.spec.ts`

**Interfaces:**
- Consumes: `Page` type from `./pages` (Task 3).
- Produces: nothing new for other tasks.

- [ ] **Step 1: Write the failing tests** — append to `worker/tests/meta.spec.ts`:

```ts
describe("page-data cache", () => {
  const shell = (bundle: string) =>
    `<html><head><!--META--><script src="/assets/${bundle}.js"></script></head><body><div id="root"></div></body></html>`;
  const get = async (path: string, bundle = "a") => {
    const ctx = createExecutionContext();
    const fakeEnv = { ...env, ASSETS: { fetch: async () => new Response(shell(bundle)) } } as any;
    const res = await worker.fetch(new Request("https://x" + path), fakeEnv, ctx);
    await waitOnExecutionContext(ctx);
    return res.text();
  };

  it("second request is served without D1 (row deleted in between)", async () => {
    await env.DB.prepare("INSERT INTO boards(id,slug,name,desc) VALUES('b_cache','/cachetest/','Cache Board','d')").run();
    expect(await get("/board/cachetest")).toContain("<h1>Cache Board</h1>");
    await env.DB.prepare("DELETE FROM boards WHERE id='b_cache'").run();
    expect(await get("/board/cachetest")).toContain("<h1>Cache Board</h1>");
  });

  it("cached data is injected into the current index.html (new bundle after deploy)", async () => {
    await get("/doc/FBI-UAP-D003", "old");
    const html = await get("/doc/FBI-UAP-D003", "new");
    expect(html).toContain("/assets/new.js");
    expect(html).not.toContain("/assets/old.js");
    expect(html).toContain("UAP file FBI-UAP-D003");
  });

  it("query strings share the cache entry and misses are not cached", async () => {
    expect(await get("/doc/NOPE2?x=1")).toContain('<div id="root"></div>');
    await env.DB.prepare(
      "INSERT INTO records(id,archive,agency,title,kind,status) VALUES('NOPE2','wargov','FBI','NOPE2, Late arrival','pdf','live')"
    ).run();
    expect(await get("/doc/NOPE2?y=2")).toContain("<h1>NOPE2, Late arrival</h1>");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:worker -- worker/tests/meta.spec.ts`
Expected: FAIL — "second request is served without D1" (the deleted board now returns no `<h1>`). The other two may already pass; that's fine, they pin behaviour the cache must keep.

- [ ] **Step 3: Implement** — in `worker/lib/meta.ts`, add the import and helper, and route the loader call through it:

```ts
import { ROUTES, type Page } from "./pages";
```

```ts
const PAGE_TTL = 3600;

// Caches the loaded page data (meta + body JSON) per path, so D1 runs at most
// once per path per colo per hour. Data, not HTML: the current index.html is
// re-read every request, so a deploy's new bundle hash is never stale.
// Pathname-only key so query strings can't bust it; misses aren't cached.
// ponytail: crawlers may see up to 1h-old related lists / replies; humans get
// fresh data from the SPA's API calls. Purge or shorten PAGE_TTL if that matters.
async function cachedPage(url: URL, load: () => Promise<Page | null>): Promise<Page | null> {
  const key = new Request(`${url.origin}/__page${url.pathname}`);
  const hit = await caches.default.match(key);
  if (hit) return hit.json<Page>();
  const page = await load();
  if (page)
    await caches.default.put(
      key,
      new Response(JSON.stringify(page), {
        headers: { "content-type": "application/json", "cache-control": `max-age=${PAGE_TTL}` },
      })
    );
  return page;
}
```

In `serveWithMeta`, replace

```ts
      const page = await r.load(env, match.pathname.groups as Record<string, string>, url);
```

with

```ts
      const page = await cachedPage(url, () => r.load(env, match.pathname.groups as Record<string, string>, url));
```

- [ ] **Step 4: Run the worker suite**

Run: `pnpm test:worker`
Expected: PASS (all files). If an earlier test in `meta.spec.ts` now fails because it mutates data and re-fetches the same path, move its fetch to a path no other test uses — do not disable the cache in tests.

- [ ] **Step 5: Commit**

```bash
git add worker/lib/meta.ts worker/tests/meta.spec.ts
git commit -m "perf(seo): cache pre-rendered page data 1h per path (Cache API) to keep D1 reads off HTML requests"
```

---

### Task 5: Deploy and verify live (needs user go-ahead)

Prod deploys have come from other chats' local trees ahead of origin. Never deploy from the shared checkout.

- [ ] **Step 1: Confirm with the user** that deploying now is OK (other chats may have undeployed work on this branch; HEAD includes it).

- [ ] **Step 2: Deploy from a clean worktree of HEAD**

```bash
W=/private/tmp/claude-501/-Users-laichan-code-tung-realufo-superpower/4ad35101-2ce4-4a56-a6f7-00916ee419d1/scratchpad/realufo-deploy
git worktree add "$W" HEAD
cd "$W" && pnpm install --frozen-lockfile
env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID pnpm run deploy
```

Expected: `Deployed realufo` with a version id.

- [ ] **Step 3: Verify live**

```bash
curl -s -A "facebookexternalhit/1.1" https://realufo.org/doc/CIA-UAP-017 | grep -o "<title>[^<]*\|<h1>[^<]*"
curl -s https://realufo.org/ | grep -o 'rel="canonical"[^>]*\|"@type":"WebSite"'
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" https://realufo.org/favicon.svg
```

Expected: record title + `<h1>CIA-UAP-017, …`; canonical + WebSite; `200 image/svg+xml`. Then open https://realufo.org/doc/CIA-UAP-017 in the browser pane and confirm the SPA renders normally (pre-render replaced on mount, no console errors).

- [ ] **Step 4: Clean up**

```bash
git worktree remove "$W"
```

Record the deployed version id in the project-state memory.
