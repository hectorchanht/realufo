// worker/tests/tg-webhook.spec.ts
import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { seedTestDB } from "./helpers";
import worker from "../index";
import { createJob, move, revise, setMessages } from "../lib/jobs";
import { approve, sweepStuck } from "../lib/gate";
import { tick as socialTick } from "../lib/social/tick";

beforeAll(() => seedTestDB(env.DB));

const SECRETS = { X_API_KEY: "k", X_API_SECRET: "s", X_ACCESS_TOKEN: "t", X_ACCESS_SECRET: "ts" };
// cloudflare:test carries wrangler.jsonc's production vars: switch every other fan-out off so a test only does what it sets up
const QUIET = { FEATURE_SOCIAL_FB: "off", FEATURE_SOCIAL_IG: "off", FEATURE_SOCIAL_THREADS: "off", FEATURE_SOCIAL_BSKY: "off", FEATURE_SOCIAL_YT: "off", FEATURE_SOCIAL_TIKTOK: "off", FEATURE_SOCIAL_TG: "off", FEATURE_PUSH: "off", X_POLLS: "" };
const E = (extra: Record<string, unknown> = {}) => ({
  ...env, ...QUIET, ...SECRETS, FEATURE_X: "dry", FEATURE_GATE: "on", X_MONTHLY_USD_CAP: "10",
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
  await env.DB.prepare("DELETE FROM records WHERE id LIKE 'WH-%'").run();
  await env.MEDIA.delete("showcase/wargov/WH-S3.mp4");
  await env.MEDIA.delete("clips/wargov/WH-M.mp4");
  tg = []; pings = []; xStatus = 201; xBody = { title: "err" };
  vi.spyOn(globalThis, "fetch").mockImplementation(async (u: any, init?: any) => {
    const url = String(u);
    if (url === "https://api.x.com/2/tweets") return new Response(JSON.stringify(xStatus < 300 ? { data: { id: "T1" } } : xBody), { status: xStatus });
    if (url === "https://api.indexnow.org/indexnow") { pings.push(JSON.parse(init.body)); return new Response(null, { status: 200 }); }
    if (url.startsWith("https://api.x.com/2/media/upload/")) {
      // X still encoding after the upload: asks to check again in 15 s
      const step = url.split("/").pop();
      return new Response(JSON.stringify(step === "initialize" ? { data: { id: "M1" } } : step === "finalize" ? { data: { processing_info: { state: "pending", check_after_secs: 15 } } } : {}));
    }
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
  it("ignores the owner when the update comes from another chat (a group the bot was added to)", async () => {
    const j = await mkJob();
    const q = tap(`ok:${j.id}:1`);
    q.callback_query.message.chat.id = -100;
    const m = reply("Hijack", 102);
    m.message.chat.id = -100;
    expect((await hook(E(), q)).status).toBe(200);
    expect((await hook(E(), m)).status).toBe(200);
    expect(tg).toEqual([]);
    expect(await status(j.id)).toMatchObject({ status: "post_wait" });
    expect((await env.DB.prepare("SELECT version FROM bot_jobs WHERE id=?").bind(j.id).first<any>()).version).toBe(1);
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
  it("a reply keeps a showcase thread: only the head tweet is replaced, its link and the other parts stay", async () => {
    const link = "https://realufo.org/doc/WH-T";
    const caption = `Head text\n${link}\n---\nSecond tweet\n---\nThird tweet`;
    const j = (await createJob(E(), { kind: "showcase", stream: "showcase", ref: "WH-T", status: "post_wait", caption, media: null, payload: { x: { ...draft, stream: "showcase", ref: "WH-T", text: caption } } }))!;
    await setMessages(E(), j.id, [501]);
    await hook(E(), reply("New head", 501));
    const row = await env.DB.prepare("SELECT version, caption FROM bot_jobs WHERE id=?").bind(j.id).first<any>();
    expect(row).toEqual({ version: 2, caption: `New head\n${link}\n---\nSecond tweet\n---\nThird tweet` });
  });
  it("a reply that is a command runs the command and leaves the preview alone", async () => {
    const j = await mkJob();
    await hook(E(), reply("/queue", 102));
    expect(await env.DB.prepare("SELECT version, caption FROM bot_jobs WHERE id=?").bind(j.id).first()).toEqual({ version: 1, caption: draft.text });
    expect(lastText()).toBe(`#${j.id} v1 · post · pick · WH-1 · post_wait`);
  });
  it("a reply whose head is over 280 for X is refused and changes nothing", async () => {
    const j = await mkJob();
    await hook(E(), reply("x".repeat(300), 102));
    expect(lastText()).toMatch(/\/280/);
    expect(await env.DB.prepare("SELECT version, caption FROM bot_jobs WHERE id=?").bind(j.id).first()).toEqual({ version: 1, caption: draft.text });
  });
  it("approval while X can't post fails the job with the reason and tells the owner", async () => {
    const j = await mkJob();
    await hook(E({ FEATURE_X: "off" }), tap(`ok:${j.id}:1`));
    expect(await status(j.id)).toEqual({ status: "failed", error: "FEATURE_X is off" });
    expect(tg.filter((t) => t.method === "sendMessage").at(-1)!.body.text).toMatch(/failed.*FEATURE_X is off/);
    const j2 = (await createJob(E(), { kind: "post", stream: "manual", ref: "WH-2", status: "post_wait", caption: "t", media: null, payload: { x: { ...draft, ref: "WH-2", cost: 99 } } }))!;
    await hook(E(), tap(`ok:${j2.id}:1`));
    expect(await status(j2.id)).toMatchObject({ status: "failed", error: "over the monthly X budget" });
    const j3 = (await createJob(E(), { kind: "post", stream: "manual", ref: "WH-3", status: "post_wait", caption: "t", media: null, payload: { x: { ...draft, ref: "WH-3" } } }))!;
    await hook(E({ FEATURE_X: "on", X_API_KEY: undefined, X_API_SECRET: undefined, X_ACCESS_TOKEN: undefined, X_ACCESS_SECRET: undefined }), tap(`ok:${j3.id}:1`));
    expect(await status(j3.id)).toEqual({ status: "failed", error: "missing X secrets" });
    expect(await xposts()).toEqual([]);
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
  it("❌ cannot cancel a job that is already being approved", async () => {
    const j = await mkJob();
    await move(E(), j.id, 1, ["post_wait"], "approved");
    await hook(E(), tap(`skip:${j.id}:1`));
    expect((await status(j.id)).status).toBe("approved");
    expect(tg.find((t) => t.method === "answerCallbackQuery")!.body.text).toMatch(/already/);
  });
  it("an approval that finds the job changed meanwhile still says the post went out", async () => {
    const j = await mkJob();
    await move(E(), j.id, 1, ["post_wait"], "skipped"); // e.g. the sweep or another tap got there first
    const line = await approve(E(), j);
    expect(line).toMatch(/went out.*changed meanwhile/);
    expect(await xposts()).toHaveLength(1);
    expect((await status(j.id)).status).toBe("skipped");
  });
  it("an existing X row for the same post: posted rows are 'already on X', failed ones fail the job", async () => {
    await env.DB.prepare("INSERT INTO x_posts(stream, ref, text, ai, cost_usd, status) VALUES ('pick', 'WH-1', 't', 0, 0, 'posted')").run();
    const j = await mkJob();
    await hook(E(), tap(`ok:${j.id}:1`));
    expect((await status(j.id)).status).toBe("posted");
    expect(lastText()).toMatch(/already on X/);

    await env.DB.prepare("UPDATE x_posts SET status='failed', error='earlier failure'").run();
    const j2 = (await createJob(E(), { kind: "post", stream: "manual", ref: "WH-1", status: "post_wait", caption: "t", media: null, payload: { x: draft } }))!;
    await hook(E(), tap(`ok:${j2.id}:1`));
    expect(await status(j2.id)).toEqual({ status: "failed", error: "earlier failure" });
    expect(lastText()).toMatch(/failed.*earlier failure/);
  });
  it("✅ never runs the fan-out inline: the result line says the cron does it, and the cron's social tick picks it up", async () => {
    const j = await mkJob();
    const e = E({ FEATURE_X: "on", FEATURE_SOCIAL_BSKY: "dry", SOCIAL_SINCE: "2020-01-01" });
    await hook(e, tap(`ok:${j.id}:1`));
    expect((await status(j.id)).status).toBe("posted");
    expect(lastText()).toMatch(/fan-out on the next cron tick/);
    expect((await env.DB.prepare("SELECT platform FROM social_posts").all()).results).toEqual([]);
    await socialTick(e);
    expect((await env.DB.prepare("SELECT platform, status FROM social_posts").all<any>()).results).toEqual([{ platform: "bsky", status: "draft" }]);
  });
  it("✅ waits only briefly for X's video processing: slow media lands as 'processing' for the cron to finish", async () => {
    const media = { key: "clips/wargov/WH-M.mp4", mime: "video/mp4", size: 100 };
    await env.MEDIA.put(media.key, new Uint8Array(100), { httpMetadata: { contentType: "video/mp4" } });
    const j = (await createJob(E(), { kind: "post", stream: "pick", ref: "WH-M", status: "post_wait", caption: "t", media, payload: { x: { ...draft, ref: "WH-M", media } } }))!;
    await hook(E({ FEATURE_X: "on" }), tap(`ok:${j.id}:1`)); // the default 120 s wait would sleep 15 s here and time out
    expect(await xposts()).toEqual([{ stream: "pick", ref: "WH-M", text: "t", status: "processing" }]);
    expect((await status(j.id)).status).toBe("posted");
    expect(lastText()).toMatch(/\(processing\)/);
  });
  it("sweep: a job stuck in approved for 15+ minutes fails and the owner is told; fresh ones and gate-off are left alone", async () => {
    const stuck = await mkJob();
    await move(E(), stuck.id, 1, ["post_wait"], "approved");
    const fresh = (await createJob(E(), { kind: "post", stream: "manual", ref: "WH-9", status: "approved", caption: "t", media: null, payload: { x: draft } }))!;
    await env.DB.prepare("UPDATE bot_jobs SET updated_at=datetime('now','-20 minutes') WHERE id=?").bind(stuck.id).run();
    await sweepStuck(E({ FEATURE_GATE: "off" }));
    expect((await status(stuck.id)).status).toBe("approved");
    await sweepStuck(E());
    expect(await status(stuck.id)).toEqual({ status: "failed", error: "approve interrupted; check the X row" });
    expect((await status(fresh.id)).status).toBe("approved");
    expect(lastText()).toMatch(new RegExp(`#${stuck.id} approve was interrupted; check X before re-posting`));
    tg = [];
    await sweepStuck(E()); // nothing left to do: no second message
    expect(tg).toEqual([]);
  });
  it("sweep: a waiting job whose preview never got its buttons (15+ min) fails and the owner is told; delivered and re-sent ones stay", async () => {
    const old = (id: number) => env.DB.prepare("UPDATE bot_jobs SET updated_at=datetime('now','-20 minutes') WHERE id=?").bind(id).run();
    const cut = (await createJob(E(), { kind: "post", stream: "pick", ref: "WH-C1", status: "post_wait", caption: "t", media: null, payload: { x: draft } }))!;
    const empty = (await createJob(E(), { kind: "post", stream: "manual", ref: "WH-C2", status: "post_wait", caption: "t", media: null, payload: { x: draft } }))!;
    await setMessages(E(), empty.id, []);
    const shown = (await createJob(E(), { kind: "post", stream: "manual", ref: "WH-C3", status: "post_wait", caption: "t", media: null, payload: { x: draft } }))!;
    await setMessages(E(), shown.id, [601, 602]);
    const edited = (await createJob(E(), { kind: "post", stream: "manual", ref: "WH-C4", status: "post_wait", caption: "t", media: null, payload: { x: draft } }))!;
    await setMessages(E(), edited.id, [701]);
    for (const j of [cut, empty, shown, edited]) await old(j.id);
    await revise(E(), edited.id, 1, "t2", "owner edit"); // a revision is fresh again (its new preview is on the way)
    await sweepStuck(E());
    expect(await status(cut.id)).toEqual({ status: "failed", error: "preview interrupted" });
    expect(await status(empty.id)).toEqual({ status: "failed", error: "preview interrupted" });
    expect((await status(shown.id)).status).toBe("post_wait");
    expect((await status(edited.id)).status).toBe("post_wait");
    const sent = tg.filter((t) => t.method === "sendMessage").map((t) => t.body.text as string);
    expect(sent).toHaveLength(2);
    expect(sent[0]).toMatch(new RegExp(`#${cut.id} .*WH-C1.*preview`));
    tg = [];
    await sweepStuck(E());
    expect(tg).toEqual([]);
  });
  it("the cron sweeps stuck jobs on every tick, even with FEATURE_X off", async () => {
    const j = await mkJob();
    await move(E(), j.id, 1, ["post_wait"], "approved");
    await env.DB.prepare("UPDATE bot_jobs SET updated_at=datetime('now','-20 minutes') WHERE id=?").bind(j.id).run();
    const waits: Promise<unknown>[] = [];
    await worker.scheduled({} as any, E({ FEATURE_X: "off" }), { waitUntil: (p: Promise<unknown>) => void waits.push(p) } as any);
    await Promise.all(waits);
    expect((await status(j.id)).status).toBe("failed");
    expect(lastText()).toMatch(/interrupted/);
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
  it("article approval fails before any site row when the showcase video is missing", async () => {
    const j = (await createJob(E(), { kind: "article", stream: "article", ref: "art-3", status: "post_wait", caption: "Story", media: null,
      payload: { sql: ["INSERT INTO bot_settings(key, value) VALUES ('t_article', '1')"], urls: ["https://realufo.org/a/z"], showcase: { record: "WH-S4", text: "t" } } }))!;
    await hook(E(), tap(`ok:${j.id}:1`));
    expect(await status(j.id)).toMatchObject({ status: "failed", error: expect.stringMatching(/showcase video missing/) });
    expect(await env.DB.prepare("SELECT value FROM bot_settings WHERE key='t_article'").first()).toBeNull();
    expect(pings).toEqual([]);
  });
  it("article approval whose showcase post fails after the site rows: the owner is told the rows were written", async () => {
    await env.DB.prepare("INSERT INTO records(id,archive,kind,title,status) VALUES ('WH-S3','wargov','video','Showcase test','live')").run();
    await env.MEDIA.put("showcase/wargov/WH-S3.mp4", new Uint8Array(100), { httpMetadata: { contentType: "video/mp4" } });
    const j = (await createJob(E(), { kind: "article", stream: "article", ref: "art-5", status: "post_wait", caption: "Story", media: null,
      payload: { sql: ["INSERT INTO bot_settings(key, value) VALUES ('t_article', '1')"], urls: ["https://realufo.org/a/v"], showcase: { record: "WH-S3", text: "Watch this" } } }))!;
    await hook(E({ FEATURE_X: "off" }), tap(`ok:${j.id}:1`));
    expect((await status(j.id)).status).toBe("failed");
    expect(await env.DB.prepare("SELECT value FROM bot_settings WHERE key='t_article'").first()).toEqual({ value: "1" });
    expect(lastText()).toBe(`⚠️ #${j.id} failed after the site rows were written: FEATURE_X is off`);
  });
  it("article approval with a showcase: site rows, then the staged showcase post", async () => {
    await env.DB.prepare("INSERT INTO records(id,archive,kind,title,status) VALUES ('WH-S3','wargov','video','Showcase test','live')").run();
    await env.MEDIA.put("showcase/wargov/WH-S3.mp4", new Uint8Array(100), { httpMetadata: { contentType: "video/mp4" } });
    const j = (await createJob(E(), { kind: "article", stream: "article", ref: "art-4", status: "post_wait", caption: "Story", media: null,
      payload: { sql: ["INSERT INTO bot_settings(key, value) VALUES ('t_article', '1')"], urls: ["https://realufo.org/a/w"], showcase: { record: "WH-S3", text: "Watch this" } } }))!;
    await hook(E(), tap(`ok:${j.id}:1`));
    expect((await status(j.id)).status).toBe("posted");
    expect(await env.DB.prepare("SELECT value FROM bot_settings WHERE key='t_article'").first()).toEqual({ value: "1" });
    expect((await xposts()).map((r) => [r.stream, r.ref, r.status])).toEqual([["showcase", "WH-S3", "draft"]]);
  });
});
