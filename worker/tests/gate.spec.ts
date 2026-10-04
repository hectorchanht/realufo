// worker/tests/gate.spec.ts
import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { seedTestDB } from "./helpers";
import { tick } from "../lib/xbot";
import { setSetting } from "../lib/jobs";

beforeAll(() => seedTestDB(env.DB));

const NOW = new Date("2026-10-10T15:00:00Z");
const SECRETS = { X_API_KEY: "k", X_API_SECRET: "s", X_ACCESS_TOKEN: "t", X_ACCESS_SECRET: "ts" };
const TG = { TELEGRAM_BOT_TOKEN: "T0K", TELEGRAM_OWNER_ID: "777", FEATURE_GATE: "on" };
const AI = { run: async () => ({ response: "Clip GT-V1 from the Gulf. #UAP" }) };
const BOT = { X_PICK_HOURS: "14", X_DAILY_MAX: "3", X_MONTHLY_USD_CAP: "10" };
const E = (extra: Record<string, unknown> = {}) => ({ ...env, ...BOT, ...SECRETS, ...TG, AI, FEATURE_X: "on", X_SINCE: "", ...extra }) as any;

let tg: { method: string; body: any }[] = [];
let xCalls: string[] = [];
let failMedia = false;
let failMessage = false;
beforeEach(async () => {
  for (const t of ["bot_job_versions", "bot_jobs", "x_posts"]) await env.DB.prepare(`DELETE FROM ${t}`).run();
  await env.DB.prepare("DELETE FROM records WHERE id LIKE 'GT-%'").run();
  for (const o of (await env.MEDIA.list({ prefix: "clips/" })).objects) await env.MEDIA.delete(o.key);
  await env.DB.prepare("INSERT INTO records(id,archive,kind,title,status) VALUES ('GT-V1','wargov','video','Gulf object','live'), ('GT-V2','wargov','video','Sea object','live')").run();
  await env.MEDIA.put("clips/wargov/GT-V1.mp4", new Uint8Array(100), { httpMetadata: { contentType: "video/mp4" } });
  await env.MEDIA.put("clips/wargov/GT-V2.mp4", new Uint8Array(100), { httpMetadata: { contentType: "video/mp4" } });
  await setSetting(env as any, "paused_picks", "0");
  tg = []; xCalls = []; failMedia = false; failMessage = false;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (u: any, init?: any) => {
    const url = String(u);
    if (url.startsWith("https://api.telegram.org/")) {
      const method = url.split("/").pop()!;
      tg.push({ method, body: init.body instanceof FormData ? Object.fromEntries(init.body as any) : JSON.parse(init.body) });
      if (failMedia && method === "sendVideo") return new Response(JSON.stringify({ ok: false, description: "too big" }), { status: 413 });
      if (failMessage && method === "sendMessage") return new Response(JSON.stringify({ ok: false, description: "chat not found" }), { status: 400 });
      return new Response(JSON.stringify({ ok: true, result: { message_id: 100 + tg.length } }));
    }
    xCalls.push(url);
    throw new Error("unexpected fetch " + url);
  });
});
afterEach(() => vi.restoreAllMocks());

const jobs = async () => (await env.DB.prepare("SELECT stream, ref, status, kind, caption, tg_msgs, error FROM bot_jobs ORDER BY id").all<any>()).results;
const xposts = async () => (await env.DB.prepare("SELECT * FROM x_posts").all<any>()).results;

describe("gated tick", () => {
  it("makes a job and a Telegram preview instead of posting", async () => {
    await tick(E(), NOW);
    expect(await xposts()).toEqual([]);
    expect(xCalls).toEqual([]);
    const j = await jobs();
    expect(j).toHaveLength(1);
    expect(j[0]).toMatchObject({ stream: "pick", status: "post_wait", kind: "post" });
    expect(j[0].caption.endsWith(`https://realufo.org/doc/${j[0].ref}`)).toBe(true);
    expect(tg.map((t) => t.method)).toEqual(["sendVideo", "sendMessage"]);
    expect(tg[0].body.chat_id).toBe("777");
    expect(tg[1].body.reply_markup.inline_keyboard[0].map((b: any) => b.callback_data)).toEqual([expect.stringMatching(/^ok:\d+:1$/), expect.stringMatching(/^skip:\d+:1$/)]);
    expect(tg[1].body.text).toContain("Reply to this message to replace the text.");
    expect(JSON.parse(j[0].tg_msgs)).toEqual([101, 102]);
  });
  it("one open pick job at a time; a skipped record is never offered again", async () => {
    await tick(E(), NOW);
    await tick(E(), NOW);
    expect(await jobs()).toHaveLength(1);
    const first = (await jobs())[0].ref;
    await env.DB.prepare("UPDATE bot_jobs SET status='skipped'").run();
    await tick(E(), NOW);
    const all = await jobs();
    expect(all).toHaveLength(2);
    expect(all[1].ref).not.toBe(first);
  });
  it("a failed job does not block re-offering its record", async () => {
    await tick(E(), NOW);
    const first = (await jobs())[0].ref;
    await env.DB.prepare("UPDATE bot_jobs SET status='failed'").run();
    await env.DB.prepare("DELETE FROM records WHERE id=?").bind(first === "GT-V1" ? "GT-V2" : "GT-V1").run();
    await tick(E(), NOW);
    const all = await jobs();
    expect(all).toHaveLength(2);
    expect(all[1].ref).toBe(first);
  });
  it("a forced pick is offered again even after a skipped job, on its own stream", async () => {
    await tick(E(), NOW);
    const first = (await jobs())[0].ref;
    await env.DB.prepare("UPDATE bot_jobs SET status='skipped'").run();
    await tick(E({ X_FORCE_PICK: first }), NOW);
    const all = await jobs();
    expect(all).toHaveLength(2);
    expect(all[1]).toMatchObject({ stream: "manual", ref: first, status: "post_wait" });
  });
  it("paused picks: no pick job", async () => {
    await setSetting(env as any, "paused_picks", "1");
    await tick(E(), NOW);
    expect(await jobs()).toEqual([]);
  });
  it("preview still arrives when the media can't be sent (too big / missing)", async () => {
    failMedia = true;
    await tick(E(), NOW);
    const msg = tg.find((t) => t.method === "sendMessage")!;
    expect(msg.body.text).toContain("media not attached");
    expect(msg.body.text).toContain("https://assets.realufo.org/clips/wargov/");
    expect(msg.body.reply_markup).toBeDefined();
  });
  it("preview not delivered: the job ends failed, nothing is posted, tick does not throw", async () => {
    failMessage = true;
    await expect(tick(E(), NOW)).resolves.toBeUndefined();
    expect(await xposts()).toEqual([]);
    const j = await jobs();
    expect(j).toHaveLength(1);
    expect(j[0].status).toBe("failed");
    expect(j[0].error).toMatch(/^preview not delivered/);
  });
  it("gate off: posts directly as before", async () => {
    await tick(E({ FEATURE_GATE: "off", FEATURE_X: "dry" }), NOW);
    expect(await jobs()).toEqual([]);
    expect(await xposts()).toHaveLength(1);
  });
});
