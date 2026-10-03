import { describe, it, expect } from "vitest";
import { trendScore } from "../routes/feed";

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
