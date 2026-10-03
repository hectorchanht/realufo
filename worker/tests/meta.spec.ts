import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import { injectMeta, snippet } from "../lib/meta";
import { isoDate } from "../lib/pages";
import worker from "../index";
import { seedTestDB } from "./helpers";

beforeAll(() => seedTestDB(env.DB));

describe("injectMeta", () => {
  it("isoDate normalizes war.gov M/D/YY and keeps years", () => {
    expect(isoDate("5/8/26")).toBe("2026-05-08");
    expect(isoDate("12/31/2024")).toBe("2024-12-31");
    expect(isoDate("2024")).toBe("2024");
    expect(isoDate("July, 2008")).toBeUndefined();
    expect(isoDate(null)).toBeUndefined();
  });

  it("snippet collapses whitespace and clips at a word under 160 chars", () => {
    expect(snippet("Stance:\nAnalyst\n\nHi  there")).toBe("Stance: Analyst Hi there");
    const s = snippet("word ".repeat(60));
    expect(s.length).toBeLessThanOrEqual(160);
    expect(s.endsWith("word…")).toBe(true);
  });

  it("replaces placeholder with escaped OG tags", () => {
    const out = injectMeta("<head><!--META--></head>", {
      title: 'A "quote"',
      description: "d",
      image: "https://c/i.jpg",
      url: "https://r/doc/1",
    });
    expect(out).toContain('<title>A &quot;quote&quot;');
    expect(out).toContain('property="og:image" content="https://c/i.jpg"');
    expect(out).not.toContain("<!--META-->");
  });

  it("escapes & < > in title/description", () => {
    const out = injectMeta("<head><!--META--></head>", {
      title: "A & B <script>",
      description: 'd > "e"',
      url: "https://r/doc/1",
    });
    expect(out).toContain("A &amp; B &lt;script&gt;");
    expect(out).toContain("d &gt; &quot;e&quot;");
  });

  it("omits og:image and uses twitter:card=summary when no image given", () => {
    const out = injectMeta("<head><!--META--></head>", {
      title: "T",
      description: "d",
      url: "https://r/doc/1",
    });
    expect(out).not.toContain("og:image");
    expect(out).toContain('name="twitter:card" content="summary"');
  });

  it("uses twitter:card=summary_large_image when image is given", () => {
    const out = injectMeta("<head><!--META--></head>", {
      title: "T",
      description: "d",
      image: "https://c/i.jpg",
      url: "https://r/doc/1",
    });
    expect(out).toContain('name="twitter:card" content="summary_large_image"');
  });

  it("strips a pre-existing static <title> so only the injected one remains", () => {
    const out = injectMeta("<head><title>web</title><!--META--></head>", {
      title: "T",
      description: "d",
      url: "https://r/doc/1",
    });
    const titleCount = (out.match(/<title>/g) || []).length;
    expect(titleCount).toBe(1);
    expect(out).toContain("<title>T · RealUFO</title>");
    expect(out).not.toContain("<title>web</title>");
    expect(out).not.toContain("<!--META-->");
  });
});

describe("injectMeta default block", () => {
  it("replaces the whole <!--META-->…<!--/META--> default block", () => {
    const out = injectMeta('<head><!--META--><meta name="description" content="default"><!--/META--></head>', {
      title: "T",
      description: "",
      url: "https://r/archive",
      type: "website",
    });
    expect(out).not.toContain('content="default"');
    expect(out).not.toContain("META-->");
    expect(out).toContain('property="og:type" content="website"');
    expect(out).toContain('<link rel="canonical" href="https://r/archive">');
    // empty description falls back to the site default, never content=""
    expect(out).not.toContain('content=""');
  });
});

describe("serveWithMeta (via worker.fetch)", () => {
  const fakeAssets = {
    fetch: async () =>
      new Response("<html><head><!--META--></head></html>", {
        headers: { "content-type": "text/html" },
      }),
  };

  it("injects meta for a known /doc/:id route", async () => {
    const fakeEnv = { ...env, ASSETS: fakeAssets } as any;
    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request("https://x/doc/CIA-UAP-017", { headers: { accept: "text/html" } }),
      fakeEnv,
      ctx
    );
    await waitOnExecutionContext(ctx);
    const html = await res.text();
    expect(html).not.toContain("<!--META-->");
    expect(html).toMatch(/property="og:/);
    // record title comes from seed data for CIA-UAP-017
    expect(html.toLowerCase()).toContain("<title>");
  });

  it("doc with a TL;DR: share card as og:image, one-liner in og:description, meta description untouched", async () => {
    await env.DB.prepare(
      "INSERT INTO record_tldr (record_id,lang,bullets,one_liner,input_hash,card_url) VALUES ('FBI-UAP-D003','en',?,?,'h','https://cdn/cards/FBI-UAP-D003-en-h.png')"
    ).bind(JSON.stringify(["First fact bullet", "b", "c"]), "Even the redactions look nervous.").run();
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("https://x/doc/FBI-UAP-D003", { headers: { accept: "text/html" } }), { ...env, ASSETS: fakeAssets } as any, ctx);
    await waitOnExecutionContext(ctx);
    const html = await res.text();
    expect(html).toContain('property="og:image" content="https://cdn/cards/FBI-UAP-D003-en-h.png"');
    expect(html).toContain('property="og:description" content="Even the redactions look nervous. — First fact bullet"');
    expect(html).not.toMatch(/name="description" content="Even the redactions/);
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
    // structured data keeps the record's own image, never the text card
    expect(html).toMatch(/"image":"[^"]+"/);
    expect(html).not.toContain('"image":"https://cdn/cards/');
  });

  it("injectMeta: ogImage drives og:image + large card, image is the fallback", () => {
    const out = injectMeta("<!--META-->", { title: "T", description: "D", url: "https://r/x", image: "https://r/thumb.jpg", ogImage: "https://r/card.png" });
    expect(out).toContain('property="og:image" content="https://r/card.png"');
    expect(out).not.toContain("thumb.jpg");
  });

  it("injectMeta: ogDescription defaults to description", () => {
    const out = injectMeta("<!--META-->", { title: "T", description: "Plain", url: "https://r/x" });
    expect(out).toContain('property="og:description" content="Plain"');
  });

  it("/shorts/:id serves the doc page's meta with the doc URL as canonical", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("https://x/shorts/CIA-UAP-017", { headers: { accept: "text/html" } }), { ...env, ASSETS: fakeAssets } as any, ctx);
    await waitOnExecutionContext(ctx);
    const html = await res.text();
    expect(html).toContain('<link rel="canonical" href="https://x/doc/CIA-UAP-017">');
    expect(html).toContain("CIA-UAP-017");
  });

  it("/doc/:id percent-decodes the id (a live AARO id has a space; it 404'd)", async () => {
    await env.DB.prepare("INSERT OR IGNORE INTO records(id,archive,agency,title,kind,status) VALUES('SP ACE-1','aaro','AARO','SP ACE-1','pdf','live')").run();
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("https://x/doc/SP%20ACE-1"), { ...env, ASSETS: fakeAssets } as any, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("SP ACE-1");
  });

  it("bogus /doc/NOPE is a 404 + noindex, SPA shell kept", async () => {
    const fakeEnv = { ...env, ASSETS: fakeAssets } as any;
    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request("https://x/doc/NOPE", { headers: { accept: "text/html" } }),
      fakeEnv,
      ctx
    );
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(404);
    const html = await res.text();
    expect(html).toContain('<meta name="robots" content="noindex">');
    expect(html).toContain("<title>Page not found · RealUFO</title>");
  });

  it("unknown paths are 404; non-HTML assets pass through", async () => {
    const fakeEnv = { ...env, ASSETS: fakeAssets } as any;
    const res = await worker.fetch(new Request("https://x/totally-fake"), fakeEnv, createExecutionContext());
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('content="noindex"');
  });

  it("trailing slash and www 301 to the canonical URL", async () => {
    const fakeEnv = { ...env, ASSETS: fakeAssets } as any;
    const slash = await worker.fetch(new Request("https://x/archive/?q=a"), fakeEnv, createExecutionContext());
    expect(slash.status).toBe(301);
    expect(slash.headers.get("location")).toBe("https://x/archive?q=a");
    const www = await worker.fetch(new Request("https://www.realufo.org/doc/A?b=1"), fakeEnv, createExecutionContext());
    expect(www.status).toBe(301);
    expect(www.headers.get("location")).toBe("https://realufo.org/doc/A?b=1");
  });

  it("old static-site paths 301 to release.realufo.org (with its trailing slash)", async () => {
    const fakeEnv = { ...env, ASSETS: fakeAssets } as any;
    for (const [from, to] of [
      ["https://realufo.org/stories/tic-tac/", "https://release.realufo.org/stories/tic-tac/"],
      ["https://realufo.org/aaro", "https://release.realufo.org/aaro/"],
      ["https://realufo.org/search/?q=x", "https://release.realufo.org/search/?q=x"],
    ]) {
      const res = await worker.fetch(new Request(from), fakeEnv, createExecutionContext());
      expect(res.status).toBe(301);
      expect(res.headers.get("location")).toBe(to);
    }
    const map = await worker.fetch(new Request("https://realufo.org/map/"), fakeEnv, createExecutionContext());
    expect(map.headers.get("location")).toBe("https://realufo.org/map");
  });

  it("injects fixed meta for a tab screen like /archive", async () => {
    const fakeEnv = { ...env, ASSETS: fakeAssets } as any;
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("https://x/archive", { headers: { accept: "text/html" } }), fakeEnv, ctx);
    await waitOnExecutionContext(ctx);
    const html = await res.text();
    expect(html).toContain("<title>The Archive · RealUFO</title>");
    expect(html).toContain('property="og:url" content="https://x/archive"');
    expect(html).toContain('property="og:image" content="https://x/og.png"');
  });

  it("/ask gets its own meta with robots noindex; other tabs don't", async () => {
    const fakeEnv = { ...env, ASSETS: fakeAssets } as any;
    const get = async (path: string) => (await worker.fetch(new Request("https://x" + path), fakeEnv, createExecutionContext())).text();
    const html = await get("/ask?q=roswell");
    expect(html).toContain("<title>Ask the Archive · RealUFO</title>");
    expect(html).toContain('<meta name="robots" content="noindex">');
    expect(html).toContain('rel="canonical" href="https://x/ask"');
    expect(await get("/archive")).not.toContain('name="robots"');
  });

  it("injects board meta for /board/:slug (bare slug in URL)", async () => {
    const fakeEnv = { ...env, ASSETS: fakeAssets } as any;
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("https://x/board/uap", { headers: { accept: "text/html" } }), fakeEnv, ctx);
    await waitOnExecutionContext(ctx);
    const html = await res.text();
    expect(html).toContain("<title>UAP General · RealUFO</title>");
    expect(html).toContain("Sightings, encounters, general discussion");
  });

  it("passes through non-meta GET routes to ASSETS unchanged", async () => {
    let called = false;
    const fakeEnv = {
      ...env,
      ASSETS: {
        fetch: async (req: Request) => {
          called = true;
          return new Response("passthrough", { headers: { "content-type": "text/plain" } });
        },
      },
    } as any;
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("https://x/some-static-page", { headers: { accept: "text/html" } }), fakeEnv, ctx);
    await waitOnExecutionContext(ctx);
    expect(called).toBe(true);
    expect(await res.text()).toBe("passthrough");
  });
});

describe("per-entity meta + JSON-LD", () => {
  const fakeEnv = () =>
    ({
      ...env,
      UPLOAD_BASE: "https://cdn/uploads/",
      ASSETS: { fetch: async () => new Response("<html><head><!--META--></head></html>") },
    }) as any;
  const get = async (path: string) => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("https://x" + path, { headers: { accept: "text/html" } }), fakeEnv(), ctx);
    await waitOnExecutionContext(ctx);
    return res.text();
  };
  const ld = (html: string) => JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1]);

  beforeAll(async () => {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO threads(id,no,board_id,title,op_body,reply_count,created_at) VALUES('t_meta',1,'uap','Lights over lake','OP body text',1,'2026-10-02 08:00:05')"
      ),
      env.DB.prepare(
        "INSERT INTO posts(id,no,thread_id,body,image_r2_key,is_op,created_at) VALUES('p_op',1,'t_meta','OP body text','uploads/abc.jpg',1,'2026-10-02 08:00:05')"
      ),
      env.DB.prepare(
        "INSERT INTO posts(id,no,thread_id,body,handle,is_op,created_at) VALUES('p_r1',2,'t_meta','reply </script><b>x</b>','skeptic',0,'2026-10-02 09:00:00')"
      ),
    ]);
  });

  it("doc title starts with the record id; JSON-LD has identifier", async () => {
    const html = await get("/doc/CIA-UAP-017");
    expect(html).toContain("<title>CIA-UAP-017 — Placement on High Alert Due to Perceived Aggressive Foreign Posturing · RealUFO</title>");
    const j = ld(html);
    expect(j["@type"]).toBe("DigitalDocument");
    expect(j.identifier).toBe("CIA-UAP-017");
    expect(j.url).toBe("https://x/doc/CIA-UAP-017");
  });

  it("thread uses the OP image and lists replies as JSON-LD comments", async () => {
    const html = await get("/thread/t_meta");
    expect(html).toContain('property="og:image" content="https://cdn/uploads/abc.jpg"');
    expect(html).not.toContain("</script><b>"); // user text can't break out of the ld+json script
    const j = ld(html);
    expect(j["@type"]).toBe("DiscussionForumPosting");
    expect(j.headline).toBe("Lights over lake");
    expect(j.text).toBe("OP body text");
    expect(j.datePublished).toBe("2026-10-02T08:00:05Z");
    expect(j.commentCount).toBe(1);
    expect(j.comment[0]).toMatchObject({ "@type": "Comment", text: "reply </script><b>x</b>", author: { name: "skeptic" } });
  });

  it("case and board get JSON-LD", async () => {
    expect(ld(await get("/case/roswell"))["@type"]).toBe("Article");
    expect(ld(await get("/board/uap"))["@type"]).toBe("CollectionPage");
  });
});

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

  it("doc pre-render includes stored full text", async () => {
    await env.DB.prepare("INSERT INTO record_text(record_id,pages,truncated,total_pages) VALUES('ICA-UAP-D001',?,0,1)")
      .bind(JSON.stringify([{ n: 1, text: "Analysts reviewed the Colorado Springs sighting." }]))
      .run();
    const html = await get("/doc/ICA-UAP-D001");
    expect(html).toContain("<h3>Page 1</h3><p>Analysts reviewed the Colorado Springs sighting.</p>");
  });

  it("doc: AI summary pre-rendered; meta description uses it only when the official summary is missing", async () => {
    const ai = "An AI paragraph about the GIMBAL footage released by the Navy.";
    await env.DB.prepare("INSERT INTO record_text(record_id,pages,truncated,total_pages,ai_summary) VALUES('AARO-956955',?,0,1,?)")
      .bind(JSON.stringify([{ n: 1, text: "Navy footage text." }]), ai)
      .run();
    const html = await get("/doc/AARO-956955");
    expect(html).toContain(`<section><h2>AI summary</h2><p>${ai}</p></section><section><h2>Full text</h2>`);
    expect(html).toContain(`<meta name="description" content="${ai} Declassified UAP video from All-domain Anomaly Resolution Office.`); // short → facts sentence appended
    expect(await get("/doc/ICA-UAP-D001")).toContain('<meta name="description" content="This document contains analysis');
  });

  it("short or missing summaries get a facts sentence so the description says what the file is", async () => {
    await env.DB.prepare("INSERT INTO records(id,archive,agency,kind,title,summary,location,status) VALUES ('XD-V1','aaro','AARO','video','XD-V1, GOFAST - UAP','', 'Atlantic Ocean','live')").run();
    const html = await get("/doc/XD-V1");
    const d = html.match(/<meta name="description" content="([^"]*)"/)![1];
    expect(d).toBe("Declassified UAP video from AARO: XD-V1 — GOFAST - UAP (Atlantic Ocean). Watch the original footage on RealUFO.");
    expect(d.length).toBeGreaterThanOrEqual(70);
  });

  it("video doc: VideoObject JSON-LD and a <video> in the body", async () => {
    const html = await get("/doc/AARO-956955");
    const j = lds(html)[0];
    expect(j["@type"]).toBe("VideoObject");
    expect(j.contentUrl).toMatch(/^https:/);
    expect(j.identifier).toBe("AARO-956955");
    expect(j.uploadDate).toBe("2024");
    expect(html).toMatch(/<video controls preload="none" src="https:/);
  });

  it("video doc: official key moments become Clips; AI-only moments don't", async () => {
    const ai = JSON.stringify({ moments: [{ start: 0, end: 5, text: "A light moves right." }] });
    await env.DB.batch([
      env.DB.prepare("INSERT INTO records(id,archive,kind,title,summary,ai_moments,status) VALUES ('XD-V2','wargov','video','XD-V2','Video Description:\n00:05-00:12: Object enters.\n01:02: Zoom.',?,'live')").bind(ai),
      env.DB.prepare("INSERT INTO assets(record_id,role,cdn_url,mime,duration) VALUES ('XD-V2','full','https://cdn/v.mp4','video/mp4',90.5)"),
      env.DB.prepare("INSERT INTO records(id,archive,kind,title,summary,ai_moments,status) VALUES ('XD-V3','aaro','video','XD-V3','',?,'live')").bind(ai),
      env.DB.prepare("INSERT INTO assets(record_id,role,cdn_url,mime) VALUES ('XD-V3','full','https://cdn/w.mp4','video/mp4')"),
    ]);
    const j = lds(await get("/doc/XD-V2"))[0];
    expect(j.hasPart).toEqual([
      { "@type": "Clip", name: "Object enters.", startOffset: 5, endOffset: 12, url: "https://x/doc/XD-V2?t=5" },
      { "@type": "Clip", name: "Zoom.", startOffset: 62, endOffset: 91, url: "https://x/doc/XD-V2?t=62" },
    ]);
    const html = await get("/doc/XD-V3");
    expect(lds(html)[0].hasPart).toBeUndefined();
    expect(html).toContain("A light moves right.");
  });

  it("privacy: static policy body, not a 404", async () => {
    const html = await get("/privacy");
    expect(html).toContain("<title>Privacy · RealUFO</title>");
    expect(html).toContain("<h1>Privacy</h1>");
    expect(html).toContain("salted hash");
    const terms = await get("/terms");
    expect(terms).toContain("<title>Terms · RealUFO</title>");
    expect(terms).toContain("<h1>Terms</h1>");
  });
  it("doc: meta + body even with Accept */* (share scrapers)", async () => {
    const html = await get("/doc/FBI-UAP-D002");
    expect(html).toContain("<title>FBI-UAP-D002 — FD-1057, Unresolved UAP Report, Colorado Springs, 2022 · RealUFO</title>");
    expect(html).toContain("<h1>FBI-UAP-D002 — FD-1057, Unresolved UAP Report, Colorado Springs, 2022</h1>");
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

  it("cases index renders and links each case", async () => {
    const html = await get("/cases");
    expect(html).toContain("Cold Cases");
    expect(html).toContain('<a href="/case/kaikoura">');
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
    expect(html).toContain('"identifier":"FBI-UAP-D003"');
  });

  it("query strings share the cache entry and misses are not cached", async () => {
    expect(await get("/doc/NOPE2?x=1")).toContain('<div id="root"></div>');
    await env.DB.prepare(
      "INSERT INTO records(id,archive,agency,title,kind,status) VALUES('NOPE2','wargov','FBI','NOPE2, Late arrival','pdf','live')"
    ).run();
    expect(await get("/doc/NOPE2?y=2")).toContain("<h1>NOPE2 — Late arrival</h1>");
  });
});

describe("final-review fixes", () => {
  const SHELL = '<html><head><!--META--></head><body><div id="root"></div></body></html>';
  const get = async (path: string, over: Record<string, unknown> = {}) => {
    const ctx = createExecutionContext();
    const fakeEnv = { ...env, ASSETS: { fetch: async () => new Response(SHELL) }, ...over } as any;
    const res = await worker.fetch(new Request("https://x" + path), fakeEnv, ctx);
    await waitOnExecutionContext(ctx);
    return res;
  };

  it("a D1 error serves the plain SPA shell instead of a 500", async () => {
    const res = await get("/board/d1down", { DB: { prepare: () => { throw new Error("D1 down"); } } });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(SHELL);
  });

  it("canonical, og:url and JSON-LD url drop the query string", async () => {
    const tab = await (await get("/archive?fbclid=abc")).text();
    expect(tab).toContain('<link rel="canonical" href="https://x/archive">');
    expect(tab).toContain('property="og:url" content="https://x/archive"');
    const doc = await (await get("/doc/FBI-UAP-D002?archive=wargov")).text();
    expect(doc).toContain('<link rel="canonical" href="https://x/doc/FBI-UAP-D002">');
    expect(doc).toContain('"url":"https://x/doc/FBI-UAP-D002"');
    expect(doc).not.toContain("archive=wargov");
  });
});

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

describe("release tracker pages (crawler HTML)", () => {
  // Own shell with #root: the body pre-render is injected there.
  const fakeAssets = {
    fetch: async () =>
      new Response('<html><head><!--META--></head><body><div id="root"></div></body></html>', { headers: { "content-type": "text/html" } }),
  };
  const get = async (path: string, over: Record<string, unknown> = {}) => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("https://x" + path, { headers: { accept: "text/html" } }), { ...env, ASSETS: fakeAssets, ...over } as any, ctx);
    await waitOnExecutionContext(ctx);
    return res.text();
  };

  it("/releases has the status, table, FAQ and FAQPage JSON-LD", async () => {
    const html = await get("/releases");
    expect(html).toContain("<title>Pentagon UFO File Releases: Dates, Schedule &amp; Next Release · RealUFO</title>");
    expect(html).toContain("<h1>Pentagon UFO File Releases: Dates, Schedule &amp; Next Release</h1>");
    expect(html).toMatch(/Release 03/);
    expect(html).toContain('<a href="/release/2">Release 02</a>');
    expect(html).toContain("<h2>FAQ</h2>");
    expect(html).toContain('"@type":"FAQPage"');
    expect(html).toContain('"@type":"CollectionPage"');
  });

  it("/releases falls back to the plain title when D1 fails", async () => {
    // Own origin: the page memo and the series memo are keyed by origin, so a
    // cached result from the test above can't mask the failure.
    const broken = { prepare: () => { throw new Error("D1 down"); } };
    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request("https://broken.test/releases", { headers: { accept: "text/html" } }),
      { ...env, ASSETS: fakeAssets, DB: broken } as any, ctx
    );
    await waitOnExecutionContext(ctx);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain("<h1>Pentagon UFO File Releases: Dates, Schedule &amp; Next Release</h1>");
    expect(html).not.toContain("FAQPage");
  });

  it("a degraded /releases is not memoized: the next good request gets the full page", async () => {
    const broken = { prepare: () => { throw new Error("D1 down"); } };
    const go = async (DB: unknown) => {
      const ctx = createExecutionContext();
      const res = await worker.fetch(new Request("https://flaky.test/releases", { headers: { accept: "text/html" } }), { ...env, ASSETS: fakeAssets, DB } as any, ctx);
      await waitOnExecutionContext(ctx);
      return res.text();
    };
    expect(await go(broken)).not.toContain('"@type":"FAQPage"');
    expect(await go(env.DB)).toContain('"@type":"FAQPage"');
  });

  it("/release/2 has what's new, dated prev link, tracker link and FAQ", async () => {
    const html = await get("/release/2");
    expect(html).toContain("<h1>Pentagon UFO Files Release 02 (12 Jun 2026): 8 Files</h1>");
    expect(html).toContain("<h2>What's new in Release 02</h2>");
    expect(html).toContain("8 files, −4 on Release 01");
    expect(html).toContain("First release with files from FBI, CIA and IC");
    expect(html).toContain('<a href="/release/1">← Release 01 (8 May)</a>');
    expect(html).toContain('<a href="/releases">');
    expect(html).toContain('"@type":"FAQPage"');
  });

  it("agency hubs get no FAQ JSON-LD", async () => {
    const html = await get("/agency/fbi");
    expect(html).not.toContain('"@type":"FAQPage"');
    expect(html).not.toContain("What's new in");
  });
});

describe("topic pages (crawler HTML)", () => {
  const fakeAssets = {
    fetch: async () =>
      new Response('<html><head><!--META--></head><body><div id="root"></div></body></html>', { headers: { "content-type": "text/html" } }),
  };
  const get = async (path: string) => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("https://topicpages.test" + path, { headers: { accept: "text/html" } }), { ...env, ASSETS: fakeAssets } as any, ctx);
    await waitOnExecutionContext(ctx);
    return res.text();
  };
  beforeAll(async () => {
    const ins = env.DB.prepare("INSERT INTO records(id,archive,agency,title,summary,kind,status) VALUES (?,?,?,?,?,?,?)");
    await env.DB.batch([1, 2, 3, 4, 5].map((n) => ins.bind(`TP-${n}`, "wargov", "DoW", `TP-${n}, AAWSAP DIRD, Page test ${n}`, "x", "pdf", "live")));
  });

  it("topic page: title with count, data line, about JSON-LD", async () => {
    const html = await get("/topic/aawsap");
    expect(html).toMatch(/<h1>AAWSAP &amp; the DIRD Reports: \d+ Declassified UFO Files<\/h1>/);
    expect(html).toContain("declassified UAP files on this topic");
    expect(html).toContain('"about":{"@type":"Thing","name":"AAWSAP & DIRDs"}'); // JSON-LD: only "<" is escaped
    expect(html).toContain('<a href="/doc/TP-1">');
  });

  it("doc page lists its topics with links", async () => {
    const html = await get("/doc/TP-1");
    expect(html).toContain('Topics: <a href="/topic/aawsap">AAWSAP &amp; DIRDs</a>');
  });

  it("browse lists topics first; agency hubs get no about", async () => {
    const browse = await get("/browse");
    expect(browse.indexOf("<h2>Topics</h2>")).toBeGreaterThan(-1);
    expect(browse.indexOf("<h2>Topics</h2>")).toBeLessThan(browse.indexOf("<h2>Releases</h2>"));
    const agency = await get("/agency/fbi");
    expect(agency).not.toContain('"about"');
  });
});
