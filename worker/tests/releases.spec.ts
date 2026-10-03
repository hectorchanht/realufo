import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../index";
import { seedTestDB } from "./helpers";
import { trackerData, releaseBlock } from "../routes/releases";

beforeAll(() => seedTestDB(env.DB));
const call = async (path: string) => {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request("https://x" + path), env as any, ctx);
  await waitOnExecutionContext(ctx);
  return res;
};

describe("release tracker data", () => {
  it("builds the series from the seeded war.gov releases", async () => {
    const d = await trackerData(env as any, "https://t1", "2026-07-01");
    expect(d.series.map((r) => [r.no, r.date, r.files, r.gap])).toEqual([
      [1, "2026-05-08", 12, null],
      [2, "2026-06-12", 8, 35],
    ]);
    expect(d.series[1].newAgencies).toEqual(["FBI", "CIA", "IC"]);
    expect(d.window).toMatchObject({ next: 3, earliest: "2026-07-17", latest: "2026-07-17", state: "ahead" });
    expect(d.status.headline).toBe("Release 03: no date announced. If the pattern holds: Fri 17 Jul 2026, most likely around Fri 17 Jul.");
    expect(d.faq[0].q).toBe("When is the next UFO file release?");
  });

  it("GET /api/releases serves the same shape, publicly cacheable", async () => {
    const res = await call("/api/releases");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=300");
    const d: any = await res.json();
    expect(d.series).toHaveLength(2);
    expect(d.window.next).toBe(3);
    expect(typeof d.status.headline).toBe("string");
    expect(d.faq.length).toBeGreaterThan(3);
  });

  it("release block: newest has the upcoming slot, older has next", async () => {
    const newest = (await releaseBlock(env as any, "https://t2", 2, [], "2026-07-01"))!;
    expect(newest.size).toBe("8 files, −4 on Release 01");
    expect(newest.prev).toEqual({ no: 1, date: "2026-05-08" });
    expect(newest.next).toBeNull();
    expect(newest.upcoming).toBe("Release 03: expected Fri 17 Jul");
    const first = (await releaseBlock(env as any, "https://t2", 1, [], "2026-07-01"))!;
    expect(first.size).toBe("12 files: the first release");
    expect(first.next).toEqual({ no: 2, date: "2026-06-12" });
    expect(first.upcoming).toBeNull();
    expect(await releaseBlock(env as any, "https://t2", 99, [])).toBeNull();
  });
});
