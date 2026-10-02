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
    // Only curated case pins survive; the prototype's fake per-pin counts are gone.
    expect(b.sightings.length).toBeGreaterThan(0);
    expect(b.sightings.every((s: any) => s.case_slug && !("count" in s))).toBe(true);
    expect(b.cases[0]).toHaveProperty("slug");
  });

  it("postsToday counts only today's posts; yearsCovered spans first to last decade", async () => {
    const n = (sql: string) => env.DB.prepare(sql).first<{ c: number }>().then((r) => r!.c);
    await env.DB.prepare("UPDATE posts SET created_at=datetime('now','-3 days') WHERE rowid=(SELECT min(rowid) FROM posts)").run();
    const today = await n("SELECT count(*) c FROM posts WHERE created_at >= date('now')");
    expect(today).toBeLessThan(await n("SELECT count(*) c FROM posts"));
    const b: any = await get("/api/bootstrap");
    expect(b.stats.postsToday).toBe(today);
    expect(b.stats.yearsCovered).toBe(`${b.stats.byDecade[0][0]}–${b.stats.byDecade.at(-1)[0]}`);
  });

  it("bootstrap returns real map places counted from record locations", async () => {
    await env.DB.prepare("INSERT INTO records (id,archive,agency,title,kind,location) VALUES ('MAP-1','wargov','DoW','MAP-1','pdf','Yellow Sea')").run();
    const b: any = await get("/api/bootstrap");
    expect(b.places.find((p: any) => p.name === "Yellow Sea")).toMatchObject({ count: 1, values: ["Yellow Sea"] });
    expect(typeof b.unmappedFiles).toBe("number");
  });

  it("feed returns featured records and hot threads with boardSlug", async () => {
    const f: any = await get("/api/feed");
    expect(f.featured.length).toBeGreaterThan(0);
    expect(f.hot.every((t: any) => t.boardSlug)).toBe(true);
  });
});

describe("ask schema + feature flag", () => {
  const boot = (FEATURE_ASK?: string) =>
    worker
      .fetch(new Request("https://x/api/bootstrap"), { ...env, FEATURE_ASK } as any, {} as any)
      .then((r) => r.json() as any);

  it("migration 0006 creates text_index and ask_cache", async () => {
    const t = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('text_index','ask_cache') ORDER BY name"
    ).all<{ name: string }>();
    expect(t.results.map((r) => r.name)).toEqual(["ask_cache", "text_index"]);
  });

  it("features.ask is true only when FEATURE_ASK is 'on'", async () => {
    expect((await boot("on")).features).toEqual({ ask: true });
    expect((await boot("hidden")).features).toEqual({ ask: false });
    expect((await boot("off")).features).toEqual({ ask: false });
    expect((await boot(undefined)).features).toEqual({ ask: false });
  });
});
