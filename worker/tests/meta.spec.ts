import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import { injectMeta } from "../lib/meta";
import worker from "../index";
import { seedTestDB } from "./helpers";

beforeAll(() => seedTestDB(env.DB));

describe("injectMeta", () => {
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

  it("serves index.html unmodified (placeholder intact) for a bogus /doc/NOPE", async () => {
    const fakeEnv = { ...env, ASSETS: fakeAssets } as any;
    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request("https://x/doc/NOPE", { headers: { accept: "text/html" } }),
      fakeEnv,
      ctx
    );
    await waitOnExecutionContext(ctx);
    const html = await res.text();
    expect(html).toContain("<!--META-->");
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
    const res = await worker.fetch(new Request("https://x/about", { headers: { accept: "text/html" } }), fakeEnv, ctx);
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

  it("doc title carries the record id; JSON-LD has identifier", async () => {
    const html = await get("/doc/CIA-UAP-017");
    expect(html).toContain("— UAP file CIA-UAP-017 · RealUFO</title>");
    expect(html).toContain('property="og:title" content="Placement on High Alert Due to Perceived Aggressive Foreign Posturing — UAP file CIA-UAP-017"');
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

  it("doc: meta + body even with Accept */* (share scrapers)", async () => {
    const html = await get("/doc/FBI-UAP-D002");
    expect(html).toContain("— UAP file FBI-UAP-D002 · RealUFO</title>");
    expect(html).toContain("<h1>FBI-UAP-D002, FD-1057, Unresolved UAP Report, Colorado Springs, 2022</h1>");
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
