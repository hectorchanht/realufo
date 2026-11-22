// THE LABEL LAW — Hector's ruling, 2026-11-22: "Real UFO and RealUFO can
// both show." The site's public-facing name exists in exactly three
// intentional forms, each in its own place, and this spec pins that
// distribution so it can never drift silently:
//
//   1. "RealUFO"  — the brand LABEL: og:site_name, JSON-LD name, the SSR
//      homepage H1, and the "· RealUFO" suffix on every subpage title.
//   2. "Real UFO" — the spaced form, allowed in title/headline phrasing:
//      the homepage title / og:title / twitter:title keep the phrase
//      "Real UFO Files — Declassified UAP Archive" verbatim.
//   3. "REALUFO"  — all-caps ONLY as wordmark styling (Press Start 2P
//      pixel font / mono kickers); pinned on the web side, see
//      web/src/tests/label.test.ts.
//
// Changing any string asserted here is a BRANDING DECISION, not a cleanup:
// a red test means stop and get a ruling, not "fix the test". Collapsing
// either form into the other (e.g. "fixing" the homepage title to start
// with "RealUFO", or spacing the label out to "Real UFO") must fail here.
// URLs, domains, package names and handles (realufo.org, @realufo_org)
// are infrastructure, not labels, and are deliberately NOT pinned.
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../index";
import { seedTestDB } from "./helpers";

beforeAll(() => seedTestDB(env.DB));

const fakeAssets = {
  fetch: async () =>
    new Response("<html><head><!--META--></head><body><div id=\"root\"></div></body></html>", {
      headers: { "content-type": "text/html" },
    }),
};

const get = async (path: string) => {
  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request("https://x" + path, { headers: { accept: "text/html" } }),
    { ...env, ASSETS: fakeAssets } as any,
    ctx
  );
  await waitOnExecutionContext(ctx);
  return res.text();
};

const lds = (html: string) =>
  [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));

// Variants that must never appear as a displayed name anywhere in the
// served homepage HTML. ("Real UFO" spaced and lowercase-r prose like
// "real UFO files" are allowed — see the ruling above.)
const FORBIDDEN_VARIANTS = ["RealUfo", "realUFO", "REAL UFO"];

describe("label law: homepage keeps BOTH name forms, exactly as ruled", () => {
  it("title / og:title / twitter:title keep the spaced headline form + RealUFO suffix", async () => {
    const html = await get("/");
    expect(html).toContain("<title>Real UFO Files — Declassified UAP Archive · RealUFO</title>");
    expect(html).toContain('<meta property="og:title" content="Real UFO Files — Declassified UAP Archive">');
    expect(html).toContain('<meta name="twitter:title" content="Real UFO Files — Declassified UAP Archive">');
  });

  it("label surfaces carry exactly RealUFO: og:site_name, JSON-LD name, SSR H1", async () => {
    const html = await get("/");
    expect(html).toContain('<meta property="og:site_name" content="RealUFO">');
    const site = lds(html).find((j) => j["@type"] === "WebSite");
    expect(site.name).toBe("RealUFO");
    expect(site.publisher.name).toBe("RealUFO");
    expect(html).toContain("<h1>RealUFO — Declassified UAP Archive</h1>");
  });

  it("no unruled name variant appears in the served homepage HTML", async () => {
    const html = await get("/");
    for (const v of FORBIDDEN_VARIANTS) expect(html).not.toContain(v);
  });
});

describe("label law: subpage titles carry the RealUFO label suffix", () => {
  it("/about title is 'About · RealUFO'", async () => {
    const html = await get("/about");
    expect(html).toContain("<title>About · RealUFO</title>");
    expect(html).toContain('<meta property="og:site_name" content="RealUFO">');
    for (const v of FORBIDDEN_VARIANTS) expect(html).not.toContain(v);
  });
});
