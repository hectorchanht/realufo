import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { seedTestDB } from "./helpers";
import { tick } from "../lib/xbot";
import { sqlTime } from "../lib/xpick";

beforeAll(() => seedTestDB(env.DB));

const NOW = new Date("2026-10-10T15:00:00Z"); // pick slot
const SECRETS = { X_API_KEY: "k", X_API_SECRET: "s", X_ACCESS_TOKEN: "t", X_ACCESS_SECRET: "ts" };
const AI = { run: async () => ({ response: "Clip XT-V1 from the Gulf. #UAP" }) };
const E = (extra: Record<string, unknown> = {}) => ({ ...env, ...SECRETS, AI, FEATURE_X: "on", X_SINCE: "", ...extra }) as any;
const noSleep = async () => {};

let xCalls: string[] = [];
let tweetStatus = 201;
let finalizeState: string | null = "succeeded";
beforeEach(async () => {
  await env.DB.prepare("DELETE FROM x_posts").run();
  await env.DB.prepare("DELETE FROM records WHERE id LIKE 'XT-%'").run();
  for (const o of (await env.MEDIA.list({ prefix: "clips/" })).objects) await env.MEDIA.delete(o.key);
  await env.DB.prepare("INSERT INTO records(id,archive,kind,title,status) VALUES ('XT-V1','wargov','video','Gulf object','live')").run();
  await env.MEDIA.put("clips/wargov/XT-V1.mp4", new Uint8Array(5 * 1024 * 1024)); // 2 chunks
  xCalls = []; tweetStatus = 201; finalizeState = "succeeded";
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any) => {
    const u = String(input);
    xCalls.push(u.replace("https://api.x.com", ""));
    const json = (j: unknown, status = 200) => new Response(JSON.stringify(j), { status });
    if (u.endsWith("/initialize")) return json({ data: { id: "M1" } });
    if (u.includes("/append")) return new Response(null, { status: 204 });
    if (u.endsWith("/finalize")) return json({ data: { id: "M1", ...(finalizeState ? { processing_info: { state: finalizeState, check_after_secs: 20 } } : {}) } });
    if (u.includes("command=STATUS")) return json({ data: { processing_info: { state: finalizeState ?? "succeeded" } } });
    if (u.endsWith("/2/tweets")) return tweetStatus < 300 ? json({ data: { id: "T99" } }, tweetStatus) : json({ title: "err" }, tweetStatus);
    throw new Error("unexpected fetch " + u);
  });
});
afterEach(() => vi.restoreAllMocks());

const rows = async () => (await env.DB.prepare("SELECT * FROM x_posts ORDER BY id").all<any>()).results;

describe("tick", () => {
  it("off: does nothing", async () => {
    await tick(E({ FEATURE_X: "off" }), NOW, noSleep);
    expect(await rows()).toEqual([]);
    expect(xCalls).toEqual([]);
  });
  it("dry: writes a draft row and calls no X endpoint", async () => {
    await tick(E({ FEATURE_X: "dry" }), NOW, noSleep);
    const r = await rows();
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ stream: "pick", ref: "XT-V1", status: "draft", ai: 1, media: "clip:clips/wargov/XT-V1.mp4" });
    expect(r[0].cost_usd).toBeCloseTo(0.03);
    expect(xCalls).toEqual([]);
  });
  it("on: uploads the clip in chunks and posts with its media id", async () => {
    await tick(E(), NOW, noSleep);
    expect(xCalls).toEqual(["/2/media/upload/initialize", "/2/media/upload/M1/append", "/2/media/upload/M1/append", "/2/media/upload/M1/finalize", "/2/tweets"]);
    expect((await rows())[0]).toMatchObject({ status: "posted", tweet_id: "T99", media_id: "M1" });
  });
  it("on without secrets: no X calls, no rows", async () => {
    await tick(E({ X_API_KEY: undefined }), NOW, noSleep);
    expect(xCalls).toEqual([]);
    expect(await rows()).toEqual([]);
  });
  it("overlapping ticks on the same candidate → one row, one post", async () => {
    // both ticks can pick XT-V1 before either inserts; ON CONFLICT DO NOTHING makes one a no-op
    await Promise.all([tick(E(), NOW, noSleep), tick(E(), NOW, noSleep)]);
    expect(xCalls.filter((u) => u === "/2/tweets")).toHaveLength(1);
    expect(await rows()).toHaveLength(1);
  });
  it("video still encoding → processing, then resumed and posted next tick", async () => {
    finalizeState = "in_progress";
    await tick(E(), NOW, noSleep);
    expect((await rows())[0]).toMatchObject({ status: "processing", media_id: "M1" });
    finalizeState = "succeeded";
    xCalls = [];
    await tick(E(), new Date("2026-10-10T18:00:00Z"), noSleep);
    expect(xCalls).toContain("/2/tweets");
    expect((await rows())[0]).toMatchObject({ status: "posted", tweet_id: "T99" });
  });
  it("403 → failed, no retry; 429 → pending with attempts, retried next tick", async () => {
    tweetStatus = 403;
    await tick(E(), NOW, noSleep);
    expect((await rows())[0]).toMatchObject({ status: "failed" });
    await env.DB.prepare("DELETE FROM x_posts").run();
    tweetStatus = 429;
    await tick(E(), NOW, noSleep);
    expect((await rows())[0]).toMatchObject({ status: "pending", attempts: 1 });
    tweetStatus = 201;
    await tick(E(), new Date("2026-10-10T18:00:00Z"), noSleep);
    expect((await rows())[0]).toMatchObject({ status: "posted" });
  });
  it("media upload failure still posts, without media", async () => {
    finalizeState = "failed";
    await tick(E(), NOW, noSleep);
    expect(xCalls.at(-1)).toBe("/2/tweets");
    expect((await rows())[0]).toMatchObject({ status: "posted", media_id: null });
  });
  it("crashed pending row (attempts=0) is left alone", async () => {
    await env.DB.prepare("INSERT INTO x_posts(stream,ref,text,ai,cost_usd,status,created_at) VALUES ('pick','XT-V1','t',0,0.03,'pending',?)")
      .bind(sqlTime(NOW)).run();
    await tick(E(), new Date("2026-10-11T15:00:00Z"), noSleep);
    // may post some other pick, but never retries the crashed row (X may have created it)
    const r = await env.DB.prepare("SELECT status, attempts FROM x_posts WHERE ref='XT-V1'").first();
    expect(r).toEqual({ status: "pending", attempts: 0 });
  });
});
