import { describe, it, expect } from "vitest";
import { distinctSummary, docTitleParts, esc, docHref, boardHref, injectBody, docBody, docFooter, threadBody, caseBody, homeBody, type DocData, hubBody, browseBody, hubHref } from "../lib/ssr";
import { sourceLinks } from "../../web/src/lib/sourceLinks";

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
  it("docBody: TL;DR section before the AI summary, escaped", () => {
    const html = docBody({
      record: { id: "X-1", title: "X-1", summary: null, agency: null, agency_full: null, incident_date: null, location: null, doc_date: null, kind: "pdf" },
      assets: [], promotedThreads: [], series: { prev: null, next: null }, release: null, related: [],
      fullText: { pages: [{ n: 1, text: "p" }], truncated: false, total_pages: 1, aiSummary: "AI words" },
      tldr: { bullets: ["<b>one</b>", "two", "three"], oneLiner: "Joke & more", cardUrl: null },
    });
    expect(html).toContain("<section><h2>TL;DR</h2><p>Joke &amp; more</p><ul><li>&lt;b&gt;one&lt;/b&gt;</li><li>two</li><li>three</li></ul></section>");
    expect(html.indexOf("TL;DR")).toBeLessThan(html.indexOf("AI summary"));
  });

  it("links back to the DVIDS / war.gov source next to the original file", () => {
    const out = docBody(doc({ kind: "video", archive: "wargov", source_url: "https://www.dvidshub.net/video/1007707" }));
    expect(out).toContain(
      '<a href="/api/file/FBI-UAP-D002">Open original file</a> · <a href="https://www.dvidshub.net/video/1007707">DVIDS page</a> · <a href="https://www.war.gov/UFO/">WAR.GOV page</a>'
    );
    expect(docBody(doc({ archive: "nara", source_url: "https://assets.realufo.org/x.pdf" }))).not.toContain(" page</a>");
  });
  it("links any other official source by its host", () => {
    expect(docBody(doc({ archive: "aaro", source_url: "https://www.aaro.mil/Portals/136/PDFs/x.pdf" }))).toContain(
      '<a href="https://www.aaro.mil/Portals/136/PDFs/x.pdf">AARO.MIL page</a>'
    );
  });
  it("sourceLinks opens an official PDF at the page being read", () => {
    expect(sourceLinks({ archive: "nasa", source_url: "https://science.nasa.gov/a.pdf" }, 7)).toEqual([
      { label: "SCIENCE.NASA.GOV", href: "https://science.nasa.gov/a.pdf#page=7" },
    ]);
    expect(sourceLinks({ archive: "spain", source_url: "https://bibliotecavirtual.defensa.gob.es/r.do?id=1" }, 7)[0].href).toBe(
      "https://bibliotecavirtual.defensa.gob.es/r.do?id=1"
    );
    expect(sourceLinks({ archive: "wargov", source_url: "https://www.war.gov/medialink/a.PDF" }, 3)[0].href).toBe(
      "https://www.war.gov/medialink/a.PDF#page=3"
    );
  });
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
  it("image with an AI visual description and no page text: own labelled section, no Full text", () => {
    const ft = { pages: [], truncated: false, total_pages: 0, aiSummary: "A grayscale <IR> frame." };
    const body = docBody(doc({ kind: "image" }, { fullText: ft }));
    expect(body).toContain("<section><h2>AI visual description</h2><p>A grayscale &lt;IR&gt; frame.</p></section>");
    expect(body).not.toContain("Full text");
    expect(docBody(doc({ kind: "image" }, { fullText: { ...ft, aiSummary: null } }))).not.toContain("AI visual");
  });
  it("video: official key moments link ?t= and leave the summary prose; AI moments only as fallback, labelled", () => {
    const summary = "Intro line.\nVideo Description:\n00:05-00:12: Object enters <frame>.\n01:02: Zoom.";
    const v = docBody(doc({ kind: "video", summary, ai_moments: JSON.stringify({ moments: [{ start: 0, end: 4, text: "AI says" }] }) }));
    expect(v).toContain("<p>Intro line.</p><section><h2>Key moments</h2><ul>");
    expect(v).toContain('<li><a href="/doc/FBI-UAP-D002?t=5">0:05</a> Object enters &lt;frame&gt;.</li><li><a href="/doc/FBI-UAP-D002?t=62">1:02</a> Zoom.</li>');
    expect(v).not.toContain("AI says");
    const ai = docBody(doc({ kind: "video", summary: "Short.", ai_moments: JSON.stringify({ moments: [
      { start: 0, end: 4, text: "No visible change." }, { start: 4, end: 9, text: "A light moves right." },
    ] }) }));
    expect(ai).toContain("<h2>Key moments</h2><p>AI-generated from video frames · may be inaccurate</p>");
    expect(ai).toContain('<a href="/doc/FBI-UAP-D002?t=4">0:04</a> A light moves right.');
    expect(ai).not.toContain("No visible change");
    expect(docBody(doc({ summary }))).not.toContain("Key moments"); // pdf
  });
  it("no Full text section for an empty or missing fullText", () => {
    expect(docBody(doc({}, { fullText: { pages: [], truncated: false, total_pages: 2 } }))).not.toContain("Full text");
    expect(docBody(doc())).not.toContain("Full text");
  });
  it("renders full-title h1, facts, summary paragraphs, file link, series and related", () => {
    const out = docBody(doc());
    expect(out).toContain("<h1>FBI-UAP-D002 — FD-1057, Unresolved UAP Report</h1>");
    expect(out).toContain("<dt>Agency</dt><dd>Federal Bureau of Investigation</dd>");
    expect(out).toContain("<dt>Released in</dt><dd>Release 03 (2026-06-12)</dd>");
    expect(out).toContain("<dt>File type</dt><dd>PDF</dd>");
    expect(out).toContain("<p>Line one.</p><p>Line two.</p>");
    expect(out).toContain('href="/api/file/FBI-UAP-D002"');
    expect(out).toContain('<a href="/doc/FBI-UAP-D003">Next: FBI-UAP-D003</a>');
    expect(out).toContain("<h2>Same location: Colorado Springs</h2>");
    expect(out).toContain('<a href="/doc/ICA-UAP-D001">ICA-UAP-D001 — ICA thing</a>');
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
    expect(docBody(doc({ title: "<img src=x>" }))).toContain("&lt;img src=x&gt;</h1>");
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
    const out = caseBody({ slug: "kaikoura", name: "Kaikoura", lede: "Lede.", pull: "Quote.", pull_cite: "Pilot", coord: "◉ 42.4° S · Kaikoura coast · 1978", archive_label: "NZDF Archive", thread: { id: "t5", title: "Talk" }, others: [{ slug: "socorro", name: "Socorro" }] });
    expect(out).toContain("<h1>Kaikoura</h1>");
    expect(out).toContain("<blockquote><p>Quote.</p><cite>Pilot</cite></blockquote>");
    expect(out).toContain('<a href="/thread/t5">Talk</a>');
    expect(out).toContain("<p>42.4° S · Kaikoura coast · 1978</p><p>Source: NZDF Archive</p>");
    expect(out).toContain('<a href="https://release.realufo.org/stories/kaikoura/">Full story, timeline and sources: Kaikoura</a>');
    expect(out).toContain('<h2>More cold cases</h2><ul><li><a href="/case/socorro">Socorro</a>');
  });
  it("home lists latest files", () => {
    expect(homeBody([{ id: "X-1", title: "One" }])).toContain('<a href="/doc/X-1">X-1 — One</a>');
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
    expect(out).toContain('<a href="/doc/A%20B%231">A B#1 — First</a>');
    expect(out).toContain('<a href="/location/moon">The Moon (8)</a>');
    expect(out).toContain('<a href="/browse">Browse</a> › Locations');
  });
  it("renders escaped highlights before the files with the AI footnote", () => {
    const out = hubBody({
      ...hub,
      highlights: {
        lede: "Two files. One is <odd> & \"loud\".",
        picks: [
          { id: "X-2", why: "Radar <track> & pilot", title: "Second" },
          { id: "A B#1", why: "Photo", title: "First" },
        ],
      },
    });
    expect(out).toContain("<h2>What stands out</h2><p>Two files. One is &lt;odd&gt; &amp; &quot;loud&quot;.</p>");
    expect(out).toContain('<li><a href="/doc/X-2">X-2 — Second</a> — Radar &lt;track&gt; &amp; pilot</li>');
    expect(out).toContain("AI-written from the file summaries");
    expect(out.indexOf("What stands out")).toBeLessThan(out.indexOf("Files (2)"));
  });
  it("no highlights section when null", () => {
    expect(hubBody({ ...hub, highlights: null })).not.toContain("What stands out");
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

const CASES: [string, string, string, boolean, string][] = [
  // [id, raw title, shown title, showId, shown id] — real records
  ["DOW-UAP-D094", "DOW-UAP-D094, Analysis of Flying Object Incidents in the United States, 1949", "Analysis of Flying Object Incidents in the United States, 1949", true, "DOW-UAP-D094"],
  ["DOW-UAP-D085", "DOW-UAP-D085_Transmission-of-CIA-Scientific-Advisory-Panel-Rept_1953", "Transmission-of-CIA-Scientific-Advisory-Panel-Rept 1953", true, "DOW-UAP-D085"],
  ["AARO-IMG-Go_Fast_UAP", "Go Fast UAP", "Go Fast UAP", false, "AARO-IMG-Go_Fast_UAP"],
  ["AARO-AARO_Puerto_Rico_UAP_Case_Resolution.pdf", "Puerto Rico UAP Case Resolution", "Puerto Rico UAP Case Resolution", false, "AARO-AARO_Puerto_Rico_UAP_Case_Resolution.pdf"],
  // National Archives filenames "<record group>_<NAID>_<title>": the numbers go,
  // the record group is named; FBI case files read as file + part.
  ["341110677NumericalFile", "341_110677_Numerical_File,_5-2500", "Numerical File, 5-2500 (National Archives RG 341)", false, "341110677NumericalFile"],
  ["38143685box7IncidentSummaries1-100", "38_143685_box7_Incident_Summaries_1-100", "Incident Summaries 1-100 (National Archives RG 38)", false, "38143685box7IncidentSummaries1-100"],
  ["65-hs1-834228961-62-hq-83894-section-1", "65_HS1-834228961_62-HQ-83894_Section_001", "FBI file 62-HQ-83894, Section 1", false, "65-hs1-834228961-62-hq-83894-section-1"],
  ["65-hs1-101634279-100-de-18221-serial-844", "65_HS1-101634279_100-DE-18221_Serial_844", "FBI file 100-DE-18221, Serial 844", false, "65-hs1-101634279-100-de-18221-serial-844"],
  ["65-hs1-834228961-62-hq-83894-sub-a", "65_HS1-834228961_62-HQ-83894_SUB_A", "FBI file 62-HQ-83894, Sub A", false, "65-hs1-834228961-62-hq-83894-sub-a"],
  ["65-hs1-101634279-100-de-26505", "65_HS1-101634279_100-DE-26505", "FBI file 100-DE-26505", false, "65-hs1-101634279-100-de-26505"],
  ["AARO-956955", "Navy 2021 Flyby video", "Navy 2021 Flyby video", true, "AARO-956955"],
  ["DOW-UAP", "DOW-UAP-PR057a, \"Spherical UAP in clouds\"", "\"Spherical UAP in clouds\"", true, "DOW-UAP-PR057a"],
  ["AARO-AARO_Al_Taqaddam_Case_Resolution_Final.pdf", "Al Taqaddum Case Resolution", "Al Taqaddum Case Resolution", false, "AARO-AARO_Al_Taqaddam_Case_Resolution_Final.pdf"],
  ["AARO-AARO_GoFast_Case_Resolution_Card_Methodology_Final.pdf", "\"GO FAST\" Case Resolution Methodology", "\"GO FAST\" Case Resolution Methodology", false, "AARO-AARO_GoFast_Case_Resolution_Card_Methodology_Final.pdf"],
  ["NARA-2024-NDAA-Public-Law-118-31", "2024 National Defense Authorization Act — Public Law 118-31", "2024 National Defense Authorization Act — Public Law 118-31", true, "NARA-2024-NDAA-Public-Law-118-31"],
  ["X-1", "X-1", "X-1", false, "X-1"],
  ["WARGOV-VID-111688723", "DOW-UAP-PR019, Unresolved UAP Report, Middle East, May 2022", "Unresolved UAP Report, Middle East, May 2022", true, "DOW-UAP-PR019"],
  ["FBI-UAP-D014-2", "FBI-UAP-D014, Correspondence Relating to UFO Sightings, 1967, 1974", "Correspondence Relating to UFO Sightings, 1967, 1974", true, "FBI-UAP-D014"],
  ["X-2", "", "X-2", false, "X-2"],
];

describe("docTitleParts (same cases as web/src/tests/docTitle.test.ts)", () => {
  it.each(CASES)("%s", (id, raw, title, showId, shown) => {
    expect(docTitleParts(id, raw)).toEqual({ id: shown, title, showId });
  });

  it("a video slug borrowing its PDF twin's code is told apart by kind", () => {
    const raw = "DOW-UAP-PR019, Unresolved UAP Report, Middle East, May 2022";
    expect(docTitleParts("WARGOV-VID-111688723", raw, "video").id).toBe("DOW-UAP-PR019 (video)");
    expect(docTitleParts("DOW-UAP-PR019", raw, "pdf").id).toBe("DOW-UAP-PR019");
    expect(docTitleParts("WARGOV-VID-111688723", raw).id).toBe("DOW-UAP-PR019"); // kind unknown: unchanged
  });
});

describe("distinctSummary", () => {
  const boiler = "On March 6, 2026, eight members of the U.S. House of Representatives requested access to 51 records. AARO identified a collection of responsive materials held on a classified network. ";
  const a = boiler + "AARO assesses that this video, whose origin is unknown, shows a bright object crossing the frame over water near the coast.";
  const b = boiler + "This clip shows two dim lights holding position above a ridge line for about nine seconds before the sensor slews away.";
  it("keeps a summary whose opening is already distinct", () => {
    expect(distinctSummary(a, ["Something else entirely, long enough to matter for the snippet comparison here."])).toBe(a);
  });
  it("drops the shared leading sentences", () => {
    expect(distinctSummary(a, [b])).toBe("AARO assesses that this video, whose origin is unknown, shows a bright object crossing the frame over water near the coast.");
  });
  it("does not split at an initialism", () => {
    const c = "The United States Central Command submitted a report to the U.S. All-domain Anomaly Resolution Office consisting of five seconds of infrared video from a platform.";
    const d = "The United States Central Command submitted a report to the U.S. All-domain Anomaly Resolution Office consisting of a still image derived from a military system.";
    expect(distinctSummary(c, [d])).toBeNull();
  });
  it("null for an exact duplicate", () => {
    expect(distinctSummary(a, [a])).toBeNull();
  });
});
