import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../index";
import { seedTestDB } from "./helpers";

beforeAll(() => seedTestDB(env.DB));

describe("embed badge", () => {
  it("GET /embed/badge returns a framable HTML badge", async () => {
    const res = await worker.fetch(new Request("https://x/embed/badge"), env as any, {} as any);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.headers.get("x-frame-options")).toBeNull(); // framable by design
    const html = await res.text();
    expect(html).toContain("REALUFO");
    expect(html).toContain("https://realufo.org/releases");
  });
  it("?theme=light renders the light variant", async () => {
    const res = await worker.fetch(new Request("https://x/embed/badge?theme=light"), env as any, {} as any);
    const html = await res.text();
    expect(html).toContain("#ffffff");
  });
});

describe("embed record card", () => {
  it("GET /embed/card/:id returns a framable HTML card linking to the doc", async () => {
    const res = await worker.fetch(new Request("https://x/embed/card/FBI-UAP-D002"), env as any, {} as any);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.headers.get("x-frame-options")).toBeNull(); // framable by design
    const html = await res.text();
    expect(html).toContain("REALUFO");
    expect(html).toContain("https://realufo.org/doc/FBI-UAP-D002");
  });
  it("?theme=light renders the light variant; unknown id 404s", async () => {
    const light = await worker.fetch(new Request("https://x/embed/card/FBI-UAP-D002?theme=light"), env as any, {} as any);
    expect((await light.text())).toContain("#ffffff");
    const missing = await worker.fetch(new Request("https://x/embed/card/NOPE-NOT-REAL"), env as any, {} as any);
    expect(missing.status).toBe(404);
  });
});
