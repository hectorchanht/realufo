// worker/tests/tg-commands.spec.ts
import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { seedTestDB } from "./helpers";
import worker from "../index";
import { getSetting } from "../lib/jobs";

beforeAll(() => seedTestDB(env.DB));
const SECRETS = { X_API_KEY: "k", X_API_SECRET: "s", X_ACCESS_TOKEN: "t", X_ACCESS_SECRET: "ts" };
const AI = { run: async () => ({ response: "A clip. #UAP" }) };
// cloudflare:test carries wrangler.jsonc's production vars: switch every other fan-out off (/drain runs the social tick)
const QUIET = { FEATURE_SOCIAL_FB: "off", FEATURE_SOCIAL_IG: "off", FEATURE_SOCIAL_THREADS: "off", FEATURE_SOCIAL_BSKY: "off", FEATURE_SOCIAL_YT: "off", FEATURE_SOCIAL_TIKTOK: "off", FEATURE_SOCIAL_TG: "off", FEATURE_PUSH: "off", X_POLLS: "" };
const E = () => ({ ...env, ...QUIET, ...SECRETS, AI, FEATURE_X: "dry", FEATURE_GATE: "on", X_MONTHLY_USD_CAP: "10", X_DAILY_MAX: "3",
  TELEGRAM_BOT_TOKEN: "T0K", TELEGRAM_OWNER_ID: "777", TELEGRAM_WEBHOOK_SECRET: "hook" }) as any;
const say = (msg: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  worker.fetch(new Request("https://realufo.org/__tg", { method: "POST", headers: { "x-telegram-bot-api-secret-token": "hook" },
    body: JSON.stringify({ update_id: 9, message: { message_id: 50, from: { id: 777 }, chat: { id: 777 }, ...msg } }) }), { ...E(), ...extra }, {} as any);

let tg: { method: string; body: any }[] = [];
let downloads: string[] = [];
let failGetFile = false;
beforeEach(async () => {
  for (const t of ["bot_job_versions", "bot_jobs", "social_posts", "x_posts"]) await env.DB.prepare(`DELETE FROM ${t}`).run();
  await env.DB.prepare("DELETE FROM records WHERE id LIKE 'CM-%'").run();
  await env.DB.prepare("INSERT INTO records(id,archive,kind,title,status) VALUES ('CM-1','wargov','video','Cmd object','live')").run();
  await env.MEDIA.put("clips/wargov/CM-1.mp4", new Uint8Array(100), { httpMetadata: { contentType: "video/mp4" } });
  for (const o of (await env.MEDIA.list({ prefix: "showcase/wargov/CM-" })).objects) await env.MEDIA.delete(o.key);
  tg = []; downloads = []; failGetFile = false;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (u: any, init?: any) => {
    const url = String(u);
    if (url.includes("/file/botT0K/")) { downloads.push(url); return new Response(new Uint8Array(64)); }
    if (!url.startsWith("https://api.telegram.org/")) throw new Error("unexpected fetch " + url);
    const method = url.split("/").pop()!;
    tg.push({ method, body: init?.body instanceof FormData ? Object.fromEntries(init.body as any) : init?.body ? JSON.parse(init.body) : {} });
    if (method === "getFile" && failGetFile) return new Response(JSON.stringify({ ok: false, description: "Bad Request: file is too big for botT0K" }), { status: 400 });
    if (method === "getFile") return new Response(JSON.stringify({ ok: true, result: { file_path: "videos/f.mp4" } }));
    return new Response(JSON.stringify({ ok: true, result: { message_id: 400 + tg.length } }));
  });
});
afterEach(() => vi.restoreAllMocks());
const lastText = () => tg.filter((t) => t.method === "sendMessage").at(-1)!.body.text as string;
const jobs = async () => (await env.DB.prepare("SELECT kind, stream, ref, status, caption FROM bot_jobs ORDER BY id").all<any>()).results;

describe("admin commands", () => {
  it("/help lists the commands; unknown text gets help", async () => {
    await say({ text: "/help" });
    expect(lastText()).toContain("/post");
    expect(lastText()).toContain("/show");
    expect(lastText()).toContain("/queue");
    await say({ text: "hello" });
    expect(lastText()).toContain("/queue");
  });
  it("/show re-sends the job's video; /info shows full details; /ok approves by number", async () => {
    await say({ text: "/post CM-1" });
    const id = (await env.DB.prepare("SELECT id FROM bot_jobs").first<any>()).id;
    // /show: re-sends the clip with its job tag, plus a ⏳ that gets cleaned up
    tg = [];
    await say({ text: `/show ${id}` });
    const videos = tg.filter((t) => t.method === "sendVideo");
    expect(videos.length).toBe(1);
    expect(String(videos[0].body.caption)).toContain(`#${id} · CM-1`);
    expect(tg.some((t) => t.method === "sendChatAction" && t.body.action === "upload_video")).toBe(true);
    expect(tg.filter((t) => t.method === "deleteMessage").length).toBe(1);
    // /info: full job details
    await say({ text: `/info ${id}` });
    expect(lastText()).toContain(`#${id} v1 · post · manual · post_wait`);
    expect(lastText()).toContain("media: video/mp4");
    expect(lastText()).toContain("clips/wargov/CM-1.mp4");
    // /ok: approves by number
    await say({ text: `/ok ${id}` });
    expect((await jobs())[0].status).toBe("posted");
    await say({ text: "/ok 999999" });
    expect(lastText()).toMatch(/not waiting for approval/);
    await say({ text: "/show 999999" });
    expect(lastText()).toMatch(/not found or already closed/);
  });
  it("/post <ID> queues an operator job with a preview", async () => {
    await say({ text: "/post CM-1" });
    expect(await jobs()).toEqual([expect.objectContaining({ kind: "post", stream: "manual", ref: "CM-1", status: "post_wait" })]);
    expect(tg.map((t) => t.method)).toContain("sendVideo");
  });
  it("/post preview for a video also sends the money-shot still and key moments", async () => {
    await env.DB.prepare("UPDATE records SET ai_moments=? WHERE id='CM-1'").bind(JSON.stringify({
      moments: [
        { start: 0, end: 4.5, text: "Infrared view: a small bright spot sits below-right of the crosshair." },
        { start: 4.5, end: 51.7, text: "The view widens: pale streaky bands drift past below." },
      ],
    })).run();
    await env.DB.prepare("INSERT INTO assets(record_id, role, cdn_url, mime) VALUES ('CM-1','thumb','https://assets.realufo.org/thumbs/wargov/CM-1.jpg','image/jpeg')").run();
    await env.MEDIA.put("thumbs/wargov/CM-1.jpg", new Uint8Array(50), { httpMetadata: { contentType: "image/jpeg" } });
    await say({ text: "/post CM-1" });
    const methods = tg.map((t) => t.method);
    expect(methods).toContain("sendVideo");
    expect(methods).toContain("sendPhoto"); // money-shot still after the clip
    expect(methods.indexOf("sendPhoto")).toBeGreaterThan(methods.indexOf("sendVideo"));
    // every media message is tagged with its job, so a bare video is never orphaned
    const caps = tg.filter((t) => t.method === "sendVideo" || t.method === "sendPhoto").map((t) => String(t.body.caption ?? ""));
    expect(caps[0]).toMatch(/#\d+ · CM-1$/);
    expect(caps[1]).toMatch(/#\d+ · CM-1 · money shot$/);
    expect(lastText()).toContain("🔍 Key moments");
    expect(lastText()).toContain("0:00–0:04 · Infrared view:");
    // metadata line (archive · date · place) and a doc URL button
    expect(lastText()).toContain("Dept. of War");
    const kb = JSON.parse(tg.filter((t) => t.method === "sendMessage").at(-1)!.body.reply_markup).inline_keyboard as { text: string; url?: string }[][];
    expect(kb[1][0]).toEqual({ text: "📄 Open doc", url: "https://realufo.org/doc/CM-1" });
  });
  it("/post says the exact reason when no preview is made", async () => {
    await say({ text: "/post" });
    expect(lastText()).toBe("Usage: /post <record ID>");
    await say({ text: "/post NOPE-1" });
    expect(lastText()).toBe("NOPE-1: no record with that ID.");
    await env.DB.prepare("INSERT INTO records(id,archive,kind,title,status) VALUES ('CM-2','wargov','video','Not yet','pending'), ('CM-3','wargov','pdf','Doc (original title not published)','live')").run();
    await say({ text: "/post CM-2" });
    expect(lastText()).toBe("CM-2: record is pending, not live.");
    await say({ text: "/post CM-3" });
    expect(lastText()).toBe("CM-3: its title isn't published yet (placeholder), so it isn't offered.");
    await say({ text: "/post CM-1" }, { X_MONTHLY_USD_CAP: "0" });
    expect(lastText()).toMatch(/^CM-1: over the monthly X budget \(\$0\.00 spent \+ \$0\.\d\d for this post > \$0\)\.$/);
    await env.DB.prepare("INSERT INTO x_posts(stream,ref,text,ai,cost_usd,status,created_at) VALUES ('pick','CM-1','t',0,0,'posted','2026-10-03 08:38:57')").run();
    await say({ text: "/post CM-1" });
    expect(lastText()).toBe("CM-1: already posted on X on 2026-10-03.");
    await env.DB.prepare("UPDATE x_posts SET status='failed' WHERE ref='CM-1'").run();
    await say({ text: "/post CM-1" });
    expect(lastText()).toBe("CM-1: an earlier X post failed on 2026-10-03; that row blocks a re-post.");
    expect(await jobs()).toEqual([]);
  });
  it("/pause and /resume flip paused_picks", async () => {
    await say({ text: "/resume" });
    expect(await getSetting(E(), "paused_picks")).toBe("0");
    await say({ text: "/pause" });
    expect(await getSetting(E(), "paused_picks")).toBe("1");
  });
  it("/queue lists open jobs with per-job approve/skip buttons; /skip <id> skips one", async () => {
    await say({ text: "/post CM-1" });
    const id = (await env.DB.prepare("SELECT id FROM bot_jobs").first<any>()).id;
    await say({ text: "/queue" });
    expect(lastText()).toContain(`#${id}`);
    expect(lastText()).toContain("CM-1");
    const kb = JSON.parse(tg.filter((t) => t.method === "sendMessage").at(-1)!.body.reply_markup).inline_keyboard as { text: string; callback_data: string }[][];
    expect(kb[0][0]).toEqual({ text: `✅ #${id}`, callback_data: `qok:${id}:1` });
    expect(kb[0][1]).toEqual({ text: `❌ #${id}`, callback_data: `qskip:${id}:1` });
    await say({ text: `/skip ${id}` });
    expect((await jobs())[0].status).toBe("skipped");
  });
  it("/skip of a missing job says so", async () => {
    await say({ text: "/skip 999999" });
    expect(lastText()).toMatch(/not found or already closed/);
  });
  it("/skip #<id> works as typed in /queue; /skip <ref> skips by record ID", async () => {
    await say({ text: "/post CM-1" });
    const id = (await env.DB.prepare("SELECT id FROM bot_jobs").first<any>()).id;
    await say({ text: `/skip #${id}` });
    expect((await jobs())[0].status).toBe("skipped");
    for (const bad of ["/skip", "/skip #"]) {
      await say({ text: bad });
      expect(lastText()).toBe("Usage: /skip <job number | record ID>");
    }
    for (const bad of ["/skip abc", "/skip 0", "/skip 1.5"]) {
      await say({ text: bad });
      expect(lastText()).toMatch(/not found or already closed/);
    }
    await say({ text: "/post CM-1" });
    await say({ text: "/skip CM-1" });
    expect(lastText()).toMatch(/#\d+ skipped\./);
    expect((await jobs())[1].status).toBe("skipped");
  });
  it("a command that throws still answers 200 (no Telegram re-send loop) and tells the owner, without the bot token", async () => {
    failGetFile = true;
    const res = await say({ caption: "CM-1 Watch frame 12", video: { file_id: "F1", file_size: 64, mime_type: "video/mp4" } });
    expect(res.status).toBe(200);
    expect(lastText()).toMatch(/^⚠️ failed: telegram 400/);
    expect(lastText()).not.toContain("T0K");
  });
  it("/status reports today's posts and the month's spend", async () => {
    await say({ text: "/status" });
    expect(lastText()).toMatch(/today/i);
    expect(lastText()).toMatch(/\$/);
  });
  it("/status keeps 'needs video' skips out of the failure count", async () => {
    const x = await env.DB.prepare("INSERT INTO x_posts(stream,ref,text,ai,cost_usd,status) VALUES ('release','congress:2026-10-03','t',0,0.2,'posted') RETURNING id").first<{ id: number }>();
    await env.DB.prepare(
      "INSERT INTO social_posts(x_post_id,platform,status,error) VALUES (?1,'ig','failed','no video'), (?1,'tiktok','failed','no video'), (?1,'fb','failed','social 500: boom')"
    ).bind(x!.id).run();
    await say({ text: "/status" });
    expect(lastText()).toContain("Failed last 24 h: fb 1");
    expect(lastText()).toContain("Skipped (needs video) last 24 h: ig 1, tiktok 1");
  });
  it("/drain runs the fan-out once without touching any platform", async () => {
    await say({ text: "/drain" });
    expect(lastText()).toMatch(/fan-out/i);
  });
  it("an mp4 with caption '<ID> text' becomes a showcase job; too big is refused", async () => {
    await say({ caption: "CM-1 Watch frame 12", video: { file_id: "F1", file_size: 64, mime_type: "video/mp4" } });
    expect(await env.MEDIA.head("showcase/wargov/CM-1.mp4")).not.toBeNull();
    expect(await jobs()).toEqual([expect.objectContaining({ kind: "showcase", stream: "showcase", ref: "CM-1", status: "post_wait" })]);
    await say({ caption: "CM-1 again", video: { file_id: "F2", file_size: 21 * 1024 * 1024, mime_type: "video/mp4" } });
    expect(lastText()).toMatch(/20 MB/);
  });
  it("a second mp4 while a showcase job is open is refused before anything is downloaded or overwritten", async () => {
    await say({ caption: "CM-1 first", video: { file_id: "F1", file_size: 64, mime_type: "video/mp4" } });
    const before = (await env.MEDIA.head("showcase/wargov/CM-1.mp4"))!.etag;
    downloads = [];
    await say({ caption: "CM-1 second", video: { file_id: "F2", file_size: 65, mime_type: "video/mp4" } });
    expect(lastText()).toMatch(/already has an open showcase job/);
    expect(downloads).toEqual([]);
    expect((await env.MEDIA.head("showcase/wargov/CM-1.mp4"))!.etag).toBe(before);
    expect(await jobs()).toHaveLength(1);
  });
});
