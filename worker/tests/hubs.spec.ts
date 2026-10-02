import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../index";
import { seedTestDB } from "./helpers";
import { loadRecord } from "../routes/records";

beforeAll(() => seedTestDB(env.DB));
const SHELL = '<html><head><!--META--></head><body><div id="root"></div></body></html>';
const call = async (path: string, over: Record<string, unknown> = {}) => {
  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request("https://x" + path),
    { ...env, ASSETS: { fetch: async () => new Response(SHELL) }, ...over } as any,
    ctx
  );
  await waitOnExecutionContext(ctx);
  return res;
};

describe("hub API", () => {
  it("lists only hubs at or above the threshold", async () => {
    const { hubs } = (await (await call("/api/hubs")).json()) as any;
    const keys = hubs.map((h: any) => `${h.kind}/${h.slug}`);
    expect(keys).toEqual(expect.arrayContaining([
      "release/1", "release/2", "agency/department-of-war", "agency/fbi", "agency/aaro", "decade/1940s", "decade/2020s",
    ]));
    for (const k of ["agency/cia", "agency/nasa", "agency/department-of-state", "location/colorado", "decade/1950s"])
      expect(keys).not.toContain(k);
    expect(keys.indexOf("release/1")).toBeLessThan(keys.indexOf("agency/department-of-war"));
  });

  it("agency hub lists all its files with stats, intro and siblings", async () => {
    const res = await call("/api/hubs/agency/fbi");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=300");
    const h: any = await res.json();
    expect(h.title).toBe("FBI UAP files");
    expect(h.records.map((r: any) => r.id).sort()).toEqual(["FBI-UAP-D002", "FBI-UAP-D003", "FBI-UAP-D009", "FBI-UAP-D010", "FBI-UAP-D011"]);
    expect(h.records[0]).toHaveProperty("thumb");
    expect(h.stats.files).toBe(5);
    expect(h.intro).toMatch(/^5 declassified UAP files from the Federal Bureau of Investigation \(FBI\): /);
    const sib = h.siblings.map((s: any) => s.slug);
    expect(sib).toContain("department-of-war");
    expect(sib).not.toContain("fbi");
    expect(h).not.toHaveProperty("prev");
  });

  it("alias values land in the merged hub", async () => {
    await env.DB.prepare(
      "INSERT INTO records(id,archive,agency,title,kind,status) VALUES('ALIAS-1','wargov','Department of War','ALIAS-1, alias test','pdf','live')"
    ).run();
    const h: any = await (await call("/api/hubs/agency/department-of-war")).json();
    expect(h.records.map((r: any) => r.id)).toContain("ALIAS-1");
  });

  it("release hub: title, prev/next, its files", async () => {
    const h: any = await (await call("/api/hubs/release/2")).json();
    expect(h.title).toBe("Pentagon UAP Release 02 · 12 Jun 2026");
    expect(h.prev).toBe("1");
    expect(h.next).toBeNull();
    expect(h.records.length).toBe(8);
  });

  it("below-threshold, unknown slug and unknown kind are 404s", async () => {
    for (const p of ["/api/hubs/agency/cia", "/api/hubs/agency/nope", "/api/hubs/planet/mars", "/api/hubs/decade/1950s", "/api/hubs/decade/abc", "/api/hubs/release/99"])
      expect((await call(p)).status, p).toBe(404);
  });

  it("doc detail carries links to its live hubs", async () => {
    const d: any = await (await call("/api/records/FBI-UAP-D002")).json();
    expect(d.hubs).toEqual({ agency: "fbi", release: "2", decade: "2020s" });
  });

  it("doc detail still loads when hub listing fails", async () => {
    const DB = new Proxy(env.DB, {
      get(t: any, k) {
        if (k === "prepare")
          return (sql: string) => {
            if (/GROUP BY (agency|location)/.test(sql)) throw new Error("D1 overloaded");
            return t.prepare(sql);
          };
        const v = t[k];
        return typeof v === "function" ? v.bind(t) : v;
      },
    });
    const d: any = await loadRecord({ ...env, DB } as any, "FBI-UAP-D003", "https://cold-cache.example");
    expect(d.record.id).toBe("FBI-UAP-D003");
    expect(d.hubs).toEqual({});
  });
});

describe("hub pages", () => {
  it("pre-renders /agency/fbi: h1, doc links, canonical, ItemList JSON-LD", async () => {
    const html = await (await call("/agency/fbi")).text();
    expect(html).toContain("<h1>FBI UAP files</h1>");
    expect(html).toContain('<a href="/doc/FBI-UAP-D002">');
    expect(html).toContain('<link rel="canonical" href="https://x/agency/fbi">');
    expect(html).toContain('"@type":"ItemList"');
    expect(html).toContain('"url":"https://x/doc/FBI-UAP-D002"');
  });
  it("below-threshold or garbage hub URLs are 404 + noindex", async () => {
    for (const p of ["/agency/cia", "/decade/abc", "/release/99", "/location/atlantis"]) {
      const res = await call(p);
      expect(res.status, p).toBe(404);
      expect(await res.text(), p).toContain('<meta name="robots" content="noindex">');
    }
  });
  it("pre-renders /browse", async () => {
    const html = await (await call("/browse")).text();
    expect(html).toContain("<h1>Browse the archive</h1>");
    expect(html).toContain('<a href="/release/2">Release 02 · 12 Jun 2026 (8)</a>');
    expect(html).not.toContain("/agency/cia");
  });
  it("doc pre-render links its facts to hubs", async () => {
    const html = await (await call("/doc/FBI-UAP-D002")).text();
    expect(html).toContain('<dt>Agency</dt><dd><a href="/agency/fbi">');
  });
  it("sitemap lists /browse and live hub URLs only", async () => {
    const xml = await (await call("/sitemap.xml")).text();
    expect(xml).toContain("<loc>https://x/browse</loc>");
    expect(xml).toContain("<loc>https://x/agency/fbi</loc>");
    expect(xml).toContain("<loc>https://x/release/2</loc>");
    expect(xml).toContain("<loc>https://x/decade/1940s</loc>");
    expect(xml).not.toContain("/agency/cia<");
  });
});

describe("final-review fixes", () => {
  it("sitemap agrees with the cached hub list (no hub advertised before its page exists)", async () => {
    await call("/api/hubs"); // hub list now cached without a NASA hub (1 seeded file)
    await env.DB.batch(
      [1, 2, 3, 4].map((i) =>
        env.DB.prepare("INSERT INTO records(id,archive,agency,title,kind,status) VALUES(?, 'nasa', 'NASA', ?, 'pdf', 'live')").bind(`NASA-FR-${i}`, `NASA-FR-${i}, test`)
      )
    );
    expect((await call("/api/hubs/agency/nasa")).status).toBe(404); // page reads the cached list
    expect(await (await call("/sitemap.xml")).text()).not.toContain("/agency/nasa<");
  });
});

describe("hub values for client-side filter mapping (Task 5b)", () => {
  it("agency and location hubs list their raw values; release/decade don't", async () => {
    const { hubs } = (await (await call("/api/hubs")).json()) as any;
    expect(hubs.find((h: any) => h.slug === "department-of-war").values).toEqual(["DoW", "Department of War"]);
    expect(hubs.find((h: any) => h.kind === "release").values).toBeUndefined();
  });
});
