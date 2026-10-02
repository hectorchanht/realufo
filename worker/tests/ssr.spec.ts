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
