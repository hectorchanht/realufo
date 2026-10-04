import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { seedTestDB } from "./helpers";
import { tick } from "../lib/xbot";
import { sqlTime } from "../lib/xpick";

beforeAll(async () => {
  await seedTestDB(env.DB);
  await env.DB.prepare("UPDATE bot_settings SET value='0' WHERE key='paused_picks'").run(); // migration 0038 seeds picks paused
});

const NOW = new Date("2026-10-10T15:00:00Z"); // pick slot
const SECRETS = { X_API_KEY: "k", X_API_SECRET: "s", X_ACCESS_TOKEN: "t", X_ACCESS_SECRET: "ts" };
const AI = { run: async () => ({ response: "Clip XT-V1 from the Gulf. #UAP" }) };
// Pin the bot schedule/budget these tests were written for: the cloudflare:test env
// carries wrangler.jsonc's production vars (X_PICK_HOURS="15,18,21", X_DAILY_MAX="4"
// since bfa2884), which would turn "later the same day" into a fresh pick slot.
const BOT = { X_PICK_HOURS: "14", X_DAILY_MAX: "3", X_MONTHLY_USD_CAP: "10" };
const E = (extra: Record<string, unknown> = {}) => ({ ...env, ...BOT, ...SECRETS, AI, FEATURE_X: "on", X_SINCE: "", ...extra }) as any;
const noSleep = async () => {};

let xCalls: string[] = [];
let tweetStatus = 201;
let tweetBody: unknown = { title: "err" };
let tweetThrows = false;
let finalizeState: string | null = "succeeded";
beforeEach(async () => {
  await env.DB.prepare("DELETE FROM x_posts").run();
  await env.DB.prepare("DELETE FROM records WHERE id LIKE 'XT-%'").run();
  for (const o of (await env.MEDIA.list({ prefix: "clips/" })).objects) await env.MEDIA.delete(o.key);
  await env.DB.prepare("INSERT INTO records(id,archive,kind,title,status) VALUES ('XT-V1','wargov','video','Gulf object','live')").run();
  await env.MEDIA.put("clips/wargov/XT-V1.mp4", new Uint8Array(5 * 1024 * 1024)); // 2 chunks
  xCalls = []; tweetStatus = 201; tweetBody = { title: "err" }; tweetThrows = false; finalizeState = "succeeded";
  await env.DB.prepare("DELETE FROM threads WHERE id LIKE 'XT-%'").run();
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any) => {
    const u = String(input);
    xCalls.push(u.replace("https://api.x.com", ""));
    const json = (j: unknown, status = 200) => new Response(JSON.stringify(j), { status });
    if (u.endsWith("/initialize")) return json({ data: { id: "M1" } });
    if (u.includes("/append")) return new Response(null, { status: 204 });
    if (u.endsWith("/finalize")) return json({ data: { id: "M1", ...(finalizeState ? { processing_info: { state: finalizeState, check_after_secs: 20 } } : {}) } });
    if (u.includes("command=STATUS")) return json({ data: { processing_info: { state: finalizeState ?? "succeeded" } } });
    if (u.endsWith("/2/tweets")) {
      if (tweetThrows) throw new TypeError("network connection lost");
      return tweetStatus < 300 ? json({ data: { id: "T99" } }, tweetStatus) : json(tweetBody, tweetStatus);
    }
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
    expect(r[0].cost_usd).toBeCloseTo(0.215); // link + media
    expect(r[0].text.endsWith("\nhttps://realufo.org/doc/XT-V1")).toBe(true);
    expect(xCalls).toEqual([]);
  });
  it("showcase thread: the head tweet carries the video, the other parts reply in a chain", async () => {
    await env.MEDIA.put("showcase/wargov/XT-V1.mp4", new Uint8Array(1024));
    const base = vi.mocked(globalThis.fetch).getMockImplementation()!;
    const sent: any[] = [];
    vi.mocked(globalThis.fetch).mockImplementation(async (input: any, init?: any) => {
      if (!String(input).endsWith("/2/tweets")) return base(input, init);
      sent.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ data: { id: `T${sent.length}` } }), { status: 201 });
    });
    await tick(E({ X_FORCE_SHOWCASE: "XT-V1", X_SHOWCASE_TEXT: "Head text\n---\nreply one\n---\nreply two" }), NOW, noSleep);
    expect(sent.map((b) => b.reply?.in_reply_to_tweet_id ?? null)).toEqual([null, "T1", "T2"]);
    expect(sent[0].media.media_ids).toEqual(["M1"]);
    expect(sent[0].text).toBe("Head text\nhttps://realufo.org/doc/XT-V1");
    expect(sent.slice(1).map((b) => [b.text, b.media])).toEqual([["reply one", undefined], ["reply two", undefined]]);
    expect((await rows())[0]).toMatchObject({ stream: "showcase", status: "posted", tweet_id: "T1" });
    await env.MEDIA.delete("showcase/wargov/XT-V1.mp4");
  });
  it("daily cap full: the bot's pick waits, an operator showcase still posts (monthly $ cap still applies)", async () => {
    const day = sqlTime(NOW);
    for (const ref of ["XT-A", "XT-B", "XT-C"])
      await env.DB.prepare("INSERT INTO x_posts(stream,ref,text,ai,cost_usd,status,created_at) VALUES ('release',?,'t',0,0.2,'posted',?)").bind(ref, day).run();
    await tick(E(), NOW, noSleep);
    expect(xCalls).not.toContain("/2/tweets");
    await env.MEDIA.put("showcase/wargov/XT-V1.mp4", new Uint8Array(1024));
    await tick(E({ X_FORCE_SHOWCASE: "XT-V1", X_SHOWCASE_TEXT: "made by hand" }), NOW, noSleep);
    expect(xCalls).toContain("/2/tweets");
    await env.DB.prepare("DELETE FROM x_posts").run();
    for (const ref of ["XT-A", "XT-B"])
      await env.DB.prepare("INSERT INTO x_posts(stream,ref,text,ai,cost_usd,status,created_at) VALUES ('release',?,'t',0,5,'posted',?)").bind(ref, day).run();
    xCalls = [];
    await tick(E({ X_FORCE_SHOWCASE: "XT-V1", X_SHOWCASE_TEXT: "made by hand" }), NOW, noSleep);
    expect(xCalls).not.toContain("/2/tweets"); // $10 month already spent
    await env.MEDIA.delete("showcase/wargov/XT-V1.mp4");
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
  it("403 duplicate → failed, no retry; 429 → pending with attempts, retried next tick", async () => {
    tweetStatus = 403;
    tweetBody = { detail: "You are not allowed to create a Tweet with duplicate content." };
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
  it("401/402 (auth, out of credits) → row removed so the candidate isn't burned", async () => {
    for (const st of [401, 402]) {
      tweetStatus = st;
      await tick(E(), NOW, noSleep);
      expect(await rows()).toEqual([]);
    }
    tweetStatus = 201;
    await tick(E(), NOW, noSleep);
    expect((await rows())[0]).toMatchObject({ ref: "XT-V1", status: "posted" });
  });
  it("D1 failure after a successful post is never retried (no double post)", async () => {
    const DB = new Proxy(env.DB, {
      get: (t, k) => k === "prepare"
        ? (sql: string) => { if (sql.includes("status='posted'")) throw new Error("D1 overloaded"); return t.prepare(sql); }
        : (t as any)[k],
    });
    await tick(E({ DB }), NOW, noSleep).catch(() => {});
    await tick(E(), new Date("2026-10-10T18:00:00Z"), noSleep);
    expect(xCalls.filter((u) => u === "/2/tweets")).toHaveLength(1);
    expect((await rows())[0]).toMatchObject({ status: "pending", attempts: 0 });
  });
  it("network error on create is ambiguous → left pending for a manual check, not retried", async () => {
    tweetThrows = true;
    await tick(E(), NOW, noSleep);
    tweetThrows = false;
    await tick(E(), new Date("2026-10-10T18:00:00Z"), noSleep);
    expect(xCalls.filter((u) => u === "/2/tweets")).toHaveLength(1);
    expect((await rows())[0]).toMatchObject({ status: "pending", attempts: 0 });
  });
  it("highlight with a banned-claim title is never posted", async () => {
    await env.DB.prepare("INSERT INTO x_posts(stream,ref,text,ai,cost_usd,status,created_at) VALUES ('pick','other','t',0,0.03,'posted',?)")
      .bind(sqlTime(NOW)).run();
    await env.DB.prepare("INSERT INTO threads(id,title,op_body,votes,created_at) VALUES ('XT-T9','PROOF of the alien cover-up','b',99999,?)")
      .bind(sqlTime(NOW)).run();
    await tick(E({ X_HIGHLIGHT_MIN_VOTES: "5" }), new Date("2026-10-10T21:00:00Z"), noSleep);
    expect(xCalls).not.toContain("/2/tweets");
    expect(await env.DB.prepare("SELECT status FROM x_posts WHERE ref='XT-T9'").first()).toEqual({ status: "failed" });
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
