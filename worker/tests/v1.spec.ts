import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../index";
import { seedTestDB } from "./helpers";
import { v1Preflight } from "../routes/v1";

beforeAll(() => seedTestDB(env.DB));
const get = (p: string, init?: RequestInit) => worker.fetch(new Request("https://x" + p, init), env as any, {} as any);
// Distinct IPs so the in-memory rate limiter never cross-contaminates tests.
let ipn = 0;
const ipg = (p: string) => get(p, { headers: { "CF-Connecting-IP": `10.9.0.${++ipn}` } });

describe("public API v1", () => {
  it("GET /api/v1/records returns the { data, meta } envelope with locked card fields", async () => {
    const res = await ipg("/api/v1/records?per_page=2");
    expect(res.status).toBe(200);
    const d: any = await res.json();
    expect(Object.keys(d).sort()).toEqual(["data", "meta"]);
    expect(d.meta).toMatchObject({ page: 1, per_page: 2 });
    expect(d.meta.total).toBeGreaterThan(0);
    expect(d.data.length).toBe(2);
    for (const r of d.data) {
      expect(r).toMatchObject({
        id: expect.any(String), archive: expect.any(String), kind: expect.any(String),
      });
      expect(Object.keys(r).sort()).toEqual(
        ["id", "archive", "agency", "title", "summary", "kind", "redacted", "location", "incident_date", "doc_date", "thumb", "duration", "crop", "oneLiner", "match"].sort()
      );
    }
  });
  it("page/per_page map onto limit/offset; per_page caps at 100", async () => {
    const a: any = await (await ipg("/api/v1/records?per_page=3&page=1")).json();
    const b: any = await (await ipg("/api/v1/records?per_page=3&page=2")).json();
    expect(a.meta).toMatchObject({ page: 1, per_page: 3, total: a.meta.total });
    expect(b.meta.page).toBe(2);
    const ids = [...a.data, ...b.data].map((r: any) => r.id);
    expect(new Set(ids).size).toBe(ids.length); // no overlap between pages
    const capped: any = await (await ipg("/api/v1/records?per_page=5000")).json();
    expect(capped.data.length).toBeLessThanOrEqual(100);
    expect(capped.meta.per_page).toBe(100);
  });
  it("q search passes the match excerpt through; archive filter narrows", async () => {
    const s: any = await (await ipg("/api/v1/records?q=ufo&per_page=1")).json();
    expect(s.meta.total).toBeGreaterThan(0);
    expect(s.data[0]).toHaveProperty("match");
    const all: any = await (await ipg("/api/v1/records?per_page=1")).json();
    const nara: any = await (await ipg("/api/v1/records?archive=nara&per_page=1")).json();
    expect(nara.meta.total).toBeLessThanOrEqual(all.meta.total);
    if (nara.data.length) expect(nara.data[0].archive).toBe("nara");
  });
  it("GET /api/v1/records/:id returns stable detail; 404 for unknown id", async () => {
    const res = await ipg("/api/v1/records/FBI-UAP-D002");
    expect(res.status).toBe(200);
    const d: any = await res.json();
    expect(d.data.id).toBe("FBI-UAP-D002");
    expect(d.data).toHaveProperty("assets");
    expect(d.data).toHaveProperty("release");
    expect(d.data).toHaveProperty("related");
    expect(d.data.url).toBe("https://x/doc/FBI-UAP-D002");
    const missing = await ipg("/api/v1/records/NOPE-NOT-REAL");
    expect(missing.status).toBe(404);
    expect((await missing.json()) as any).toHaveProperty("error");
  });
  it("GET /api/v1/records/:id/text → { data } with pages, JSON only", async () => {
    const res = await ipg("/api/v1/records/CIA-UAP-017/text");
    const d: any = await res.json();
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      expect(d.data).toHaveProperty("pages");
      expect(Array.isArray(d.data.pages)).toBe(true);
    } else {
      expect(d).toHaveProperty("error");
    }
  });
  it("archives / releases / cases / hubs / shorts / openapi.json all 200", async () => {
    for (const p of ["/api/v1/archives", "/api/v1/releases", "/api/v1/cases", "/api/v1/hubs", "/api/v1/shorts", "/api/v1/openapi.json"]) {
      const res = await ipg(p);
      expect(res.status).toBe(200);
      const d: any = await res.json();
      expect(d).toHaveProperty("data");
      expect(d).toHaveProperty("meta");
    }
  });
  it("openapi.json serves the raw spec at the document root (no envelope)", async () => {
    const res = await ipg("/api/v1/openapi.json");
    expect(res.status).toBe(200);
    const d: any = await res.json();
    expect(d.openapi).toBe("3.0.0"); // standard tools expect this at root
    expect(d).not.toHaveProperty("data");
    expect(d.paths).toHaveProperty("/records");
    expect(d.paths).toHaveProperty("/records/{id}");
    expect(d.paths).toHaveProperty("/usage");
    expect(d.servers[0].url).toContain("/api/v1");
  });
  it("case detail resolves; unknown slug 404s", async () => {
    const res = await ipg("/api/v1/cases/roswell");
    expect(res.status).toBe(200);
    const d: any = await res.json();
    expect(d.data.slug).toBe("roswell");
    expect(Array.isArray(d.data.sources)).toBe(true);
    expect((await ipg("/api/v1/cases/nope")).status).toBe(404);
  });
  it("hub detail returns trimmed cards; unknown hub 404s", async () => {
    const hubs: any = await (await ipg("/api/v1/hubs")).json();
    expect(hubs.meta.total).toBeGreaterThan(0);
    const h0 = hubs.data[0];
    const res = await ipg(`/api/v1/hubs/${h0.kind}/${h0.slug}`);
    expect(res.status).toBe(200);
    const d: any = await res.json();
    expect(d.data.records.length).toBeGreaterThan(0);
    expect(Object.keys(d.data.records[0]).sort()).toEqual(
      ["id", "archive", "agency", "title", "summary", "kind", "redacted", "location", "incident_date", "doc_date", "thumb", "duration", "crop", "oneLiner"].sort()
    );
    expect((await ipg("/api/v1/hubs/nope/nope")).status).toBe(404);
  });
  it("CORS open, version + ratelimit headers present, cacheable GETs", async () => {
    const res = await ipg("/api/v1/records?per_page=1");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("x-api-version")).toBe("v1");
    expect(res.headers.get("x-ratelimit-limit")).toBe("600");
    expect(res.headers.get("x-ratelimit-remaining")).toBeTruthy();
    expect(res.headers.get("cache-control")).toContain("s-maxage=300");
    expect(v1Preflight().status).toBe(204);
    expect(v1Preflight().headers.get("access-control-allow-origin")).toBe("*");
    const opt = await worker.fetch(
      new Request("https://x/api/v1/records", { method: "OPTIONS" }),
      env as any, {} as any
    );
    expect(opt.status).toBe(204);
  });
  it("rate limit 429s past the cap with Retry-After (env-override)", async () => {
    const limited = { ...env, API_RATE_MAX: "2" } as any;
    const h = { headers: { "CF-Connecting-IP": "10.99.99.99" } };
    const fetchL = (p: string) => worker.fetch(new Request("https://x" + p, h), limited, {} as any);
    expect((await fetchL("/api/v1/records?per_page=1")).status).toBe(200);
    expect((await fetchL("/api/v1/records?per_page=1")).status).toBe(200);
    const third = await fetchL("/api/v1/records?per_page=1");
    expect(third.status).toBe(429);
    expect(third.headers.get("retry-after")).toBeTruthy();
    expect(((await third.json()) as any).error).toMatch(/rate limit/i);
  });
  it("GET /api/v1/usage returns the aggregate envelope (empty before any waitUntil hits)", async () => {
    const res = await ipg("/api/v1/usage");
    expect(res.status).toBe(200);
    const d: any = await res.json();
    expect(Object.keys(d).sort()).toEqual(["data", "meta"]);
    expect(d.meta).toMatchObject({ days: 30 });
    expect(Array.isArray(d.data)).toBe(true);
    expect(d.meta.total).toBe(d.data.reduce((n: number, r: any) => n + r.hits, 0));
  });
  it("sort=random returns one record and is never cached", async () => {
    const res = await ipg("/api/v1/records?sort=random&per_page=1");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    const d: any = await res.json();
    expect(d.meta.total).toBeGreaterThan(0);
    expect(d.data.length).toBe(1);
    expect(d.data[0].id).toEqual(expect.any(String));
  });
});
