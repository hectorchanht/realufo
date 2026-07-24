import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../index";
import { seedTestDB } from "./helpers";

beforeAll(() => seedTestDB(env.DB));
const get = (p: string) => worker.fetch(new Request("https://x" + p), env as any, {} as any).then((r) => r.json());

describe("bootstrap+feed", () => {
  it("bootstrap returns only archives that have real records, with real counts + real stats", async () => {
    const b: any = await get("/api/bootstrap");
    // No fake fillups: every returned archive actually has records, and stats
    // reflect the seeded data (28 records) — not the curated 91,808.
    expect(b.archives.length).toBeGreaterThan(0);
    expect(b.archives.length).toBeLessThan(15);
    expect(b.archives.every((a: any) => a.count > 0)).toBe(true);
    expect(b.stats.records).toBe(28);
    expect(b.stats.archives).toBe(b.archives.length);
    expect(b.boards.length).toBe(7);
    expect(b.sightings.length).toBe(12);
    expect(b.cases[0]).toHaveProperty("slug");
  });

  it("feed returns featured records and hot threads with boardSlug", async () => {
    const f: any = await get("/api/feed");
    expect(f.featured.length).toBeGreaterThan(0);
    expect(f.hot.every((t: any) => t.boardSlug)).toBe(true);
  });
});
