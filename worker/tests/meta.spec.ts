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
