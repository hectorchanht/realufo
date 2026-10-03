import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import { seedTestDB } from "./helpers";
import { trendScore, feedClips } from "../routes/feed";

const now = Date.parse("2026-10-02T12:00:00Z");
const ago = (h: number) => new Date(now - h * 3_600_000).toISOString().slice(0, 19).replace("T", " ");

describe("trendScore", () => {
  it("a voted pic thread from yesterday beats an empty thread with a fresh reply", () => {
    const good = { votes: 12, reply_count: 6, img_count: 3, thumb: "https://c/x.jpg", lastPost: ago(20) };
    const junk = { votes: 0, reply_count: 1, img_count: 0, thumb: null, lastPost: ago(0.1) };
    expect(trendScore(good, now)).toBeGreaterThan(trendScore(junk, now));
  });

  it("a pic breaks an otherwise equal tie", () => {
    const base = { votes: 2, reply_count: 1, img_count: 0, lastPost: ago(3) };
    expect(trendScore({ ...base, thumb: "https://c/x.jpg" }, now)).toBeGreaterThan(trendScore({ ...base, thumb: null }, now));
  });

  it("decays: same engagement, older activity ranks lower; falls back to created_at", () => {
    const t = { votes: 5, reply_count: 2, img_count: 0 };
    expect(trendScore({ ...t, lastPost: ago(1) }, now)).toBeGreaterThan(trendScore({ ...t, created_at: ago(48) }, now));
  });
});

describe("feedClips", () => {
  const rec = (id: string, status = "live") =>
    env.DB.prepare("INSERT INTO records(id,archive,kind,title,status,created_at) VALUES (?,'wargov','video',?,?,?)")
      .bind(id, `Title ${id}`, status, `2026-09-0${id.slice(-1)} 00:00:00`).run();

  beforeAll(async () => {
    await seedTestDB(env.DB);
    await rec("FC-1"); await rec("FC-2"); await rec("FC-3", "failed"); await rec("FC-4");
    for (const id of ["FC-1", "FC-2", "FC-3"]) await env.MEDIA.put(`clips-v/wargov/${id}.mp4`, new Uint8Array(1));
  });

  it("lists live records that have a vertical clip, newest first, with CDN urls", async () => {
    const clips = await feedClips(env as any);
    expect(clips.map((c) => c.id)).toEqual(["FC-2", "FC-1"]); // FC-3 not live, FC-4 has no clip
    expect(clips[0]).toMatchObject({ title: "Title FC-2", clip: "https://assets.realufo.org/clips-v/wargov/FC-2.mp4" });
  });

  it("puts portrait videos (crop w < h) first; landscape crops keep date order", async () => {
    const crop = (id: string, c: string) =>
      env.DB.prepare("INSERT INTO assets(record_id,role,cdn_url,mime,crop) VALUES (?,'full','x','video/mp4',?)").bind(id, c).run();
    await crop("FC-1", "616:1080:652:0");
    await crop("FC-2", "960:720:160:0");
    expect((await feedClips(env as any)).map((c) => c.id)).toEqual(["FC-1", "FC-2"]);
  });

  it("degrades to [] when R2 listing fails", async () => {
    const broken = { ...env, MEDIA: { list: () => Promise.reject(new Error("r2 down")) } };
    expect(await feedClips(broken as any)).toEqual([]);
  });
});
