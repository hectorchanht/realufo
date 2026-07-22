import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../index";
import { seedTestDB } from "./helpers";

beforeAll(() => seedTestDB(env.DB));
const get = (p: string) => worker.fetch(new Request("https://x" + p), env as any, {} as any).then((r) => r.json());

describe("bootstrap+feed", () => {
  it("bootstrap returns archives, boards, stats, ticker, sightings, cases", async () => {
    const b: any = await get("/api/bootstrap");
    expect(b.archives.length).toBe(15);
    expect(b.boards.length).toBe(7);
    expect(b.stats.records).toBe(91808);
    expect(b.sightings.length).toBe(12);
    expect(b.cases[0]).toHaveProperty("slug");
  });

  it("feed returns featured records and hot threads with boardSlug", async () => {
    const f: any = await get("/api/feed");
    expect(f.featured.length).toBeGreaterThan(0);
    expect(f.hot.every((t: any) => t.boardSlug)).toBe(true);
  });
});
