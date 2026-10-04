// worker/tests/tg-webhook.spec.ts
import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { seedTestDB } from "./helpers";
import worker from "../index";
import { createJob, move, setMessages } from "../lib/jobs";

beforeAll(() => seedTestDB(env.DB));

const SECRETS = { X_API_KEY: "k", X_API_SECRET: "s", X_ACCESS_TOKEN: "t", X_ACCESS_SECRET: "ts" };
const E = (extra: Record<string, unknown> = {}) => ({
  ...env, ...SECRETS, FEATURE_X: "dry", FEATURE_GATE: "on", X_MONTHLY_USD_CAP: "10",
  TELEGRAM_BOT_TOKEN: "T0K", TELEGRAM_OWNER_ID: "777", TELEGRAM_WEBHOOK_SECRET: "hook", ...extra,
}) as any;
const hook = (e: any, update: unknown, secret = "hook") =>
  worker.fetch(new Request("https://realufo.org/__tg", { method: "POST", headers: { "x-telegram-bot-api-secret-token": secret, "content-type": "application/json" }, body: JSON.stringify(update) }), e, {} as any);
const tap = (data: string, from = 777) => ({ update_id: 1, callback_query: { id: "cq1", from: { id: from }, data, message: { message_id: 102, chat: { id: from } } } });
const reply = (text: string, to: number, from = 777) => ({ update_id: 2, message: { message_id: 200, from: { id: from }, chat: { id: from }, text, reply_to_message: { message_id: to } } });

let tg: { method: string; body: any }[] = [];
let xStatus = 201;
let xBody: unknown = { title: "err" };
let pings: any[] = [];
beforeEach(async () => {
  for (const t of ["bot_job_versions", "bot_jobs", "social_posts", "x_posts"]) await env.DB.prepare(`DELETE FROM ${t}`).run();
  await env.DB.prepare("DELETE FROM bot_settings WHERE key='t_article'").run();
  tg = []; pings = []; xStatus = 201; xBody = { title: "err" };
  vi.spyOn(globalThis, "fetch").mockImplementation(async (u: any, init?: any) => {
    const url = String(u);
    if (url === "https://api.x.com/2/tweets") return new Response(JSON.stringify(xStatus < 300 ? { data: { id: "T1" } } : xBody), { status: xStatus });
    if (url === "https://api.indexnow.org/indexnow") { pings.push(JSON.parse(init.body)); return new Response(null, { status: 200 }); }
    if (!url.startsWith("https://api.telegram.org/")) throw new Error("unexpected fetch " + url);
    tg.push({ method: url.split("/").pop()!, body: init.body instanceof FormData ? Object.fromEntries(init.body as any) : JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 300 + tg.length } }));
  });
});
afterEach(() => vi.restoreAllMocks());

const draft = { stream: "pick", ref: "WH-1", text: "Look at this\nhttps://realufo.org/doc/WH-1", ai: false, media: null, cost: 0.2 };
const mkJob = async () => {
  const j = (await createJob(E(), { kind: "post", stream: "pick", ref: "WH-1", status: "post_wait", caption: draft.text, media: null, payload: { x: draft } }))!;
  await setMessages(E(), j.id, [101, 102]);
  return j;
};
const xposts = async () => (await env.DB.prepare("SELECT stream, ref, text, status FROM x_posts").all<any>()).results;
const status = async (id: number) => (await env.DB.prepare("SELECT status, error FROM bot_jobs WHERE id=?").bind(id).first<any>())!;
const lastText = () => tg.filter((t) => t.method === "sendMessage").at(-1)!.body.text as string;

describe("POST /__tg", () => {
  it("404 on a wrong or missing secret", async () => {
    expect((await hook(E(), tap("ok:1:1"), "nope")).status).toBe(404);
    expect((await hook(E({ TELEGRAM_WEBHOOK_SECRET: undefined }), tap("ok:1:1"))).status).toBe(404);
  });
  it("ignores anyone but the owner, channel posts and chat-member updates (200, nothing sent)", async () => {
    const j = await mkJob();
    expect((await hook(E(), tap(`ok:${j.id}:1`, 555))).status).toBe(200);
    expect((await hook(E(), { update_id: 3, channel_post: { chat: { id: -100 }, text: "hi" } })).status).toBe(200);
    expect((await hook(E(), { update_id: 4, my_chat_member: { from: { id: 777 }, chat: { id: -100 } } })).status).toBe(200);
    expect(tg).toEqual([]);
    expect((await status(j.id)).status).toBe("post_wait");
  });
  it("✅ writes the x_posts row once, even if Telegram re-sends the update", async () => {
    const j = await mkJob();
    await hook(E(), tap(`ok:${j.id}:1`));
    await hook(E(), tap(`ok:${j.id}:1`));
    expect(await xposts()).toEqual([{ stream: "pick", ref: "WH-1", text: draft.text, status: "draft" }]);
    expect((await status(j.id)).status).toBe("posted");
    const answers = tg.filter((t) => t.method === "answerCallbackQuery").map((t) => t.body.text);
    expect(answers[1]).toMatch(/already/);
  });
  it("❌ skips: no row, buttons cleared", async () => {
    const j = await mkJob();
    await hook(E(), tap(`skip:${j.id}:1`));
    expect(await xposts()).toEqual([]);
    expect((await status(j.id)).status).toBe("skipped");
    expect(tg.some((t) => t.method === "editMessageReplyMarkup")).toBe(true);
  });
  it("a reply replaces the text (new version, new preview); old buttons go stale", async () => {
    const j = await mkJob();
    await hook(E(), reply("Better text", 102));
    const row = await env.DB.prepare("SELECT version, caption FROM bot_jobs WHERE id=?").bind(j.id).first<any>();
    expect(row).toEqual({ version: 2, caption: "Better text\nhttps://realufo.org/doc/WH-1" });
    expect(tg.filter((t) => t.method === "sendMessage").at(-1)!.body.text).toContain(`#${j.id} v2`);
    await hook(E(), tap(`ok:${j.id}:1`)); // stale v1 button
    expect(await xposts()).toEqual([]);
    await hook(E(), tap(`ok:${j.id}:2`));
    expect((await xposts())[0].text).toBe("Better text\nhttps://realufo.org/doc/WH-1");
  });
  it("a reply to an out-of-date preview is refused", async () => {
    const j = await mkJob();
    await hook(E(), reply("v2 text", 102));
    tg = [];
    await hook(E(), reply("edit the old one", 101));
    expect(tg.at(-1)!.body.text).toMatch(/out of date/);
    expect((await env.DB.prepare("SELECT version FROM bot_jobs WHERE id=?").bind(j.id).first<any>()).version).toBe(2);
  });
  it("approval while X can't post fails the job with the reason and tells the owner", async () => {
    const j = await mkJob();
    await hook(E({ FEATURE_X: "off" }), tap(`ok:${j.id}:1`));
    expect(await status(j.id)).toEqual({ status: "failed", error: "FEATURE_X is off" });
    expect(tg.filter((t) => t.method === "sendMessage").at(-1)!.body.text).toMatch(/failed.*FEATURE_X is off/);
    const j2 = (await createJob(E(), { kind: "post", stream: "manual", ref: "WH-2", status: "post_wait", caption: "t", media: null, payload: { x: { ...draft, ref: "WH-2", cost: 99 } } }))!;
    await hook(E(), tap(`ok:${j2.id}:1`));
    expect(await status(j2.id)).toMatchObject({ status: "failed", error: "over the monthly X budget" });
  });
  it("approval when X accepts the post: job posted, X row posted", async () => {
    const j = await mkJob();
    await hook(E({ FEATURE_X: "on" }), tap(`ok:${j.id}:1`));
    expect((await status(j.id)).status).toBe("posted");
    expect(await xposts()).toEqual([{ stream: "pick", ref: "WH-1", text: draft.text, status: "posted" }]);
  });
  it("approval never reports success when X rejected the post (row dropped, or marked failed)", async () => {
    const j = await mkJob();
    xStatus = 403; // not a duplicate: xbot removes the row so the candidate isn't burned
    await hook(E({ FEATURE_X: "on" }), tap(`ok:${j.id}:1`));
    expect(await status(j.id)).toMatchObject({ status: "failed", error: expect.stringMatching(/X rejected/) });
    expect(lastText()).toMatch(/failed.*X rejected/);
    expect(await xposts()).toEqual([]);

    const j2 = (await createJob(E(), { kind: "post", stream: "manual", ref: "WH-2", status: "post_wait", caption: "t", media: null, payload: { x: { ...draft, ref: "WH-2" } } }))!;
    xBody = { detail: "You are not allowed to create a Tweet with duplicate content." };
    await hook(E({ FEATURE_X: "on" }), tap(`ok:${j2.id}:1`)); // duplicate: row kept as failed
    expect(await status(j2.id)).toMatchObject({ status: "failed", error: expect.stringMatching(/duplicate/) });
    expect(lastText()).toMatch(/failed.*duplicate/);
  });
  it("a reply to a non-post job (article) is refused and changes nothing", async () => {
    const j = (await createJob(E(), { kind: "article", stream: "article", ref: "art-1", status: "post_wait", caption: "Story\nhttps://realufo.org/a/x", media: null, payload: { sql: [], urls: [] } }))!;
    await setMessages(E(), j.id, [401]);
    await hook(E(), reply("new text", 401));
    expect(lastText()).toMatch(/article/);
    expect(await env.DB.prepare("SELECT version, caption, status FROM bot_jobs WHERE id=?").bind(j.id).first()).toEqual({ version: 1, caption: "Story\nhttps://realufo.org/a/x", status: "post_wait" });
  });
  it("❌ also frees a job stuck in approved (Worker died mid-approve)", async () => {
    const j = await mkJob();
    await move(E(), j.id, 1, ["post_wait"], "approved");
    await hook(E(), tap(`skip:${j.id}:1`));
    expect((await status(j.id)).status).toBe("skipped");
  });
  it("article approval writes the site rows and pings IndexNow", async () => {
    const j = (await createJob(E(), { kind: "article", stream: "article", ref: "art-1", status: "post_wait", caption: "Story", media: null,
      payload: { sql: ["INSERT INTO bot_settings(key, value) VALUES ('t_article', '1')"], urls: ["https://realufo.org/a/x"] } }))!;
    await hook(E(), tap(`ok:${j.id}:1`));
    expect((await status(j.id)).status).toBe("posted");
    expect(await env.DB.prepare("SELECT value FROM bot_settings WHERE key='t_article'").first()).toEqual({ value: "1" });
    expect(pings[0].urlList).toEqual(["https://realufo.org/a/x"]);
  });
  it("article approval with a showcase that is already on X fails before any site row is written", async () => {
    await env.DB.prepare("INSERT INTO x_posts(stream, ref, text, ai, cost_usd, status) VALUES ('showcase', 'WH-S', 't', 0, 0, 'posted')").run();
    const j = (await createJob(E(), { kind: "article", stream: "article", ref: "art-2", status: "post_wait", caption: "Story", media: null,
      payload: { sql: ["INSERT INTO bot_settings(key, value) VALUES ('t_article', '1')"], urls: ["https://realufo.org/a/y"], showcase: { record: "WH-S", text: "t" } } }))!;
    await hook(E(), tap(`ok:${j.id}:1`));
    expect(await status(j.id)).toMatchObject({ status: "failed", error: "showcase already posted for WH-S" });
    expect(await env.DB.prepare("SELECT value FROM bot_settings WHERE key='t_article'").first()).toBeNull();
    expect(pings).toEqual([]);
  });
});
