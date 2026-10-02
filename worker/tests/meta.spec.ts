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
