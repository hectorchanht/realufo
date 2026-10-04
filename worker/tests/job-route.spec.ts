import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { seedTestDB } from "./helpers";
import worker from "../index";

beforeAll(() => seedTestDB(env.DB));
const SECRETS = { X_API_KEY: "k", X_API_SECRET: "s", X_ACCESS_TOKEN: "t", X_ACCESS_SECRET: "ts" };
const AI = { run: async () => ({ response: "A clip. #UAP" }) };
// the test env carries wrangler.jsonc's production flags: switch the fan-out/push/polls off
const QUIET = { FEATURE_SOCIAL_FB: "off", FEATURE_SOCIAL_IG: "off", FEATURE_SOCIAL_THREADS: "off", FEATURE_SOCIAL_BSKY: "off", FEATURE_SOCIAL_YT: "off", FEATURE_SOCIAL_TIKTOK: "off", FEATURE_SOCIAL_TG: "off", FEATURE_PUSH: "off", X_POLLS: "" };
const E = (extra: Record<string, unknown> = {}) => ({ ...env, ...QUIET, ...SECRETS, AI, ADMIN_TOKEN: "adm", FEATURE_X: "dry", FEATURE_GATE: "on", X_MONTHLY_USD_CAP: "10",
  TELEGRAM_BOT_TOKEN: "T0K", TELEGRAM_OWNER_ID: "777", TELEGRAM_WEBHOOK_SECRET: "hook", ...extra }) as any;
const post = (e: any, path: string, body?: unknown, token = "adm") =>
  worker.fetch(new Request(`https://realufo.org${path}`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }), e, {} as any);
const tap = (e: any, data: string) =>
  worker.fetch(new Request("https://realufo.org/__tg", { method: "POST", headers: { "x-telegram-bot-api-secret-token": "hook" },
    body: JSON.stringify({ update_id: 5, callback_query: { id: "q", from: { id: 777 }, data, message: { message_id: 1, chat: { id: 777 } } } }) }), e, {} as any);

beforeEach(async () => {
  for (const t of ["bot_job_versions", "bot_jobs", "x_posts"]) await env.DB.prepare(`DELETE FROM ${t}`).run();
  await env.DB.prepare("DELETE FROM records WHERE id LIKE 'JR-%'").run();
  await env.DB.prepare("DELETE FROM articles WHERE slug='jr-story'").run();
  await env.DB.prepare("INSERT INTO records(id,archive,kind,title,status) VALUES ('JR-1','wargov','video','Job route object','live')").run();
  await env.MEDIA.put("clips/wargov/JR-1.mp4", new Uint8Array(100), { httpMetadata: { contentType: "video/mp4" } });
  vi.spyOn(globalThis, "fetch").mockImplementation(async (u: any) => {
    const url = String(u);
    if (url.startsWith("https://api.telegram.org/")) return new Response(JSON.stringify({ ok: true, result: { message_id: 7 } }));
    if (url.startsWith("https://api.indexnow.org/")) return new Response("", { status: 200 });
    throw new Error("unexpected fetch " + url);
  });
});
afterEach(() => vi.restoreAllMocks());

const article = (payload: Record<string, unknown>) => ({ kind: "article", ref: "jr-story", caption: "T\n\nB", media: null, payload: { sql: [], urls: [], ...payload } });

describe("operator paths under the gate", () => {
  it("/__tick?force=ID queues a job instead of posting", async () => {
    const r = await post(E(), "/__tick?force=JR-1");
    const body = await r.json<any>();
    expect(body.ok).toBe(true);
    expect(body.job).toEqual(expect.any(Number));
    expect((await env.DB.prepare("SELECT count(*) n FROM x_posts").first<any>()).n).toBe(0);
    // nothing to queue (unknown record) → job null, still nothing posted
    expect(await (await post(E(), "/__tick?force=JR-NOPE")).json()).toEqual({ ok: true, job: null });
  });
  it("/__job needs the admin token", async () => {
    expect((await post(E(), "/__job", { kind: "article" }, "nope")).status).toBe(404);
  });
  it("/__job article: rows are written only after ✅", async () => {
    const sql = ["INSERT INTO articles(slug,title,body) VALUES ('jr-story','T','B')"];
    const r = await post(E(), "/__job", { kind: "article", ref: "jr-story", caption: "T\n\nB", media: null, payload: { sql, urls: ["https://realufo.org/thread/ar_jr-story"] } });
    const { job } = await r.json<any>();
    expect(await env.DB.prepare("SELECT 1 FROM articles WHERE slug='jr-story'").first()).toBeNull();
    expect((await post(E(), "/__job", { kind: "article", ref: "jr-story", caption: "x", media: null, payload: { sql, urls: [] } })).status).toBe(409);
    await tap(E(), `ok:${job}:1`);
    expect(await env.DB.prepare("SELECT 1 FROM articles WHERE slug='jr-story'").first()).not.toBeNull();
    expect((await env.DB.prepare("SELECT status FROM bot_jobs WHERE id=?").bind(job).first<any>()).status).toBe("posted");
  });
  it("/__job rejects SQL outside the article tables, stacked statements, and foreign URLs", async () => {
    for (const sql of [
      "DELETE FROM records",
      "INSERT INTO articles(slug,title,body) VALUES ('jr-story','T','B'); DELETE FROM records",
      "UPDATE posts SET body='x' -- '\n; DELETE FROM records",
      // reads of other tables into a public row
      "UPDATE posts SET body=(SELECT group_concat(access_token||refresh_token) FROM social_auth) WHERE id='p1'",
      "UPDATE posts SET body=social_auth.refresh_token FROM social_auth WHERE posts.id='p1'",
      "INSERT INTO posts(id,thread_id,body) SELECT 'p9','t1',endpoint FROM push_subs",
      42,
    ]) expect((await post(E(), "/__job", article({ sql: [sql] }))).status).toBe(400);
    expect((await post(E(), "/__job", article({ urls: ["https://evil.example/x"] }))).status).toBe(400);
    expect((await post(E(), "/__job", article({ showcase: { record: "JR-1" } }))).status).toBe(400);
    // ';', '--', select/from inside a string literal are fine
    expect((await post(E(), "/__job", article({ sql: ["INSERT INTO articles(slug,title,body) VALUES ('jr-story','T','a; b -- select x from y')"] }))).status).toBe(200);
    expect((await env.DB.prepare("SELECT count(*) n FROM bot_jobs").first<any>()).n).toBe(1);
  });
  it("/__job answers 502 when the preview never reached Telegram", async () => {
    vi.mocked(globalThis.fetch).mockImplementation(async () => new Response(JSON.stringify({ ok: false, description: "chat not found" }), { status: 400 }));
    const r = await post(E(), "/__job", article({}));
    expect(r.status).toBe(502);
    expect((await r.json<any>()).error).toMatch(/preview not delivered/);
    expect((await env.DB.prepare("SELECT status FROM bot_jobs WHERE ref='jr-story'").first<any>()).status).toBe("failed");
  });
});
