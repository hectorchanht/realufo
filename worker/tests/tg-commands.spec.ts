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
const QUIET = { FEATURE_SOCIAL_FB: "off", FEATURE_SOCIAL_IG: "off", FEATURE_SOCIAL_THREADS: "off", FEATURE_SOCIAL_BSKY: "off", FEATURE_SOCIAL_YT: "off", FEATURE_SOCIAL_TIKTOK: "off", FEATURE_PUSH: "off", X_POLLS: "" };
const E = () => ({ ...env, ...QUIET, ...SECRETS, AI, FEATURE_X: "dry", FEATURE_GATE: "on", X_MONTHLY_USD_CAP: "10", X_DAILY_MAX: "3",
  TELEGRAM_BOT_TOKEN: "T0K", TELEGRAM_OWNER_ID: "777", TELEGRAM_WEBHOOK_SECRET: "hook" }) as any;
const say = (msg: Record<string, unknown>) =>
  worker.fetch(new Request("https://realufo.org/__tg", { method: "POST", headers: { "x-telegram-bot-api-secret-token": "hook" },
    body: JSON.stringify({ update_id: 9, message: { message_id: 50, from: { id: 777 }, chat: { id: 777 }, ...msg } }) }), E(), {} as any);

let tg: { method: string; body: any }[] = [];
let downloads: string[] = [];
beforeEach(async () => {
  for (const t of ["bot_job_versions", "bot_jobs", "social_posts", "x_posts"]) await env.DB.prepare(`DELETE FROM ${t}`).run();
  await env.DB.prepare("DELETE FROM records WHERE id LIKE 'CM-%'").run();
  await env.DB.prepare("INSERT INTO records(id,archive,kind,title,status) VALUES ('CM-1','wargov','video','Cmd object','live')").run();
  await env.MEDIA.put("clips/wargov/CM-1.mp4", new Uint8Array(100), { httpMetadata: { contentType: "video/mp4" } });
  for (const o of (await env.MEDIA.list({ prefix: "showcase/wargov/CM-" })).objects) await env.MEDIA.delete(o.key);
  tg = []; downloads = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (u: any, init?: any) => {
    const url = String(u);
    if (url.includes("/file/botT0K/")) { downloads.push(url); return new Response(new Uint8Array(64)); }
    if (!url.startsWith("https://api.telegram.org/")) throw new Error("unexpected fetch " + url);
    const method = url.split("/").pop()!;
    tg.push({ method, body: init?.body instanceof FormData ? Object.fromEntries(init.body as any) : init?.body ? JSON.parse(init.body) : {} });
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
    expect(lastText()).toContain("/post <ID>");
    await say({ text: "hello" });
    expect(lastText()).toContain("/queue");
  });
  it("/post <ID> queues an operator job with a preview", async () => {
    await say({ text: "/post CM-1" });
    expect(await jobs()).toEqual([expect.objectContaining({ kind: "post", stream: "manual", ref: "CM-1", status: "post_wait" })]);
    expect(tg.map((t) => t.method)).toContain("sendVideo");
  });
  it("/post of an unknown or already-posted record explains why", async () => {
    await say({ text: "/post NOPE-1" });
    expect(lastText()).toMatch(/not live|already posted|over budget/);
  });
  it("/pause and /resume flip paused_picks", async () => {
    await say({ text: "/resume" });
    expect(await getSetting(E(), "paused_picks")).toBe("0");
    await say({ text: "/pause" });
    expect(await getSetting(E(), "paused_picks")).toBe("1");
  });
  it("/queue lists open jobs; /skip <id> skips one", async () => {
    await say({ text: "/post CM-1" });
    const id = (await env.DB.prepare("SELECT id FROM bot_jobs").first<any>()).id;
    await say({ text: "/queue" });
    expect(lastText()).toContain(`#${id}`);
    await say({ text: `/skip ${id}` });
    expect((await jobs())[0].status).toBe("skipped");
  });
  it("/skip of a missing job says so", async () => {
    await say({ text: "/skip 999999" });
    expect(lastText()).toMatch(/not found or already closed/);
  });
  it("/status reports today's posts and the month's spend", async () => {
    await say({ text: "/status" });
    expect(lastText()).toMatch(/today/i);
    expect(lastText()).toMatch(/\$/);
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
