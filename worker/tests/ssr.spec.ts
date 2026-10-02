import { describe, it, expect } from "vitest";
import { esc, docHref, boardHref, injectBody, docBody, docFooter, threadBody, caseBody, homeBody, type DocData, hubBody, browseBody, hubHref } from "../lib/ssr";

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
  it("renders full text pages escaped, with continuation link only when truncated", () => {
    const ft = { pages: [{ n: 3, text: "Para one line\nline two\n\n\n\n<script>x</script>\n\n  \n" }], truncated: true, total_pages: 40 };
    const out = docBody(doc({}, { fullText: ft }));
    expect(out).toContain(
      "<section><h2>Full text</h2><h3>Page 3</h3><p>Para one line<br>line two</p><p>&lt;script&gt;x&lt;/script&gt;</p>"
    );
    expect(out).not.toContain("<p></p>");
    expect(out).toContain('<a href="/api/file/FBI-UAP-D002">Text continues in the original file (40 pages).</a>');
    expect(docBody(doc({}, { fullText: { ...ft, truncated: false } }))).not.toContain("Text continues");
  });
  it("renders the AI summary escaped before the full text, only when present", () => {
    const ft = { pages: [{ n: 1, text: "Page." }], truncated: false, total_pages: 1, aiSummary: "A <b>memo</b>." };
    expect(docBody(doc({}, { fullText: ft }))).toContain(
      "<section><h2>AI summary</h2><p>A &lt;b&gt;memo&lt;/b&gt;.</p></section><section><h2>Full text</h2>"
    );
    expect(docBody(doc({}, { fullText: { ...ft, aiSummary: null } }))).not.toContain("AI summary");
  });
  it("no Full text section for an empty or missing fullText", () => {
    expect(docBody(doc({}, { fullText: { pages: [], truncated: false, total_pages: 2 } }))).not.toContain("Full text");
    expect(docBody(doc())).not.toContain("Full text");
  });
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

describe("hub pre-render", () => {
  const hub = {
    kind: "location" as const, title: "UAP files: Washington, D.C. & <Area>", intro: "2 declassified UAP files about incidents in Washington, D.C.: 2 PDFs.",
    records: [{ id: "A B#1", title: "First" }, { id: "X-2", title: "Second" }],
    siblings: [{ kind: "location" as const, slug: "moon", label: "The Moon", count: 8 }],
  };
  it("renders escaped title, intro, file links and sibling hubs", () => {
    const out = hubBody(hub);
    expect(out).toContain("<h1>UAP files: Washington, D.C. &amp; &lt;Area&gt;</h1>");
    expect(out).toContain("<p>2 declassified UAP files about incidents in Washington, D.C.: 2 PDFs.</p>");
    expect(out).toContain('<a href="/doc/A%20B%231">First</a>');
    expect(out).toContain('<a href="/location/moon">The Moon (8)</a>');
    expect(out).toContain('<a href="/browse">Browse</a> › Locations');
  });
  it("release hubs get prev/next links", () => {
    const out = hubBody({ ...hub, kind: "release", prev: "5", next: null });
    expect(out).toContain('<a href="/release/5">← Release 05</a>');
  });
  it("browse groups hubs by kind with counts", () => {
    const out = browseBody([
      { kind: "release", slug: "6", label: "Release 06 · 18 Sep 2026", count: 74 },
      { kind: "decade", slug: "1950s", label: "1950s", count: 29 },
    ]);
    expect(out).toContain("<h1>Browse the archive</h1>");
    expect(out).toContain('<h2>Releases</h2><ul><li><a href="/release/6">Release 06 · 18 Sep 2026 (74)</a>');
    expect(out).toContain('<a href="/decade/1950s">1950s (29)</a>');
    expect(out).not.toContain("<h2>Agencies</h2>");
  });
  it("doc facts are plain text; hub links go to the footer", () => {
    const d = doc({}, { hubs: { agency: "fbi", release: "3", decade: "2020s" } });
    const body = docBody(d);
    expect(body).toContain("<dt>Agency</dt><dd>Federal Bureau of Investigation</dd>");
    expect(body).not.toContain('href="/agency/fbi"');
    expect(docFooter(d)).toEqual([
      { href: "/release/3", text: "More from Release 03" },
      { href: "/agency/fbi", text: "More from Federal Bureau of Investigation" },
      { href: "/decade/2020s", text: "More from the 2020s" },
    ]);
    expect(docFooter(doc({}, {}))).toEqual([]);
    const html = injectBody('<div id="root"></div>', body, docFooter(d));
    expect(html).toMatch(/<footer><p><a href="\/release\/3">More from Release 03<\/a>.*<\/p><a href="\/browse">/);
  });
});
