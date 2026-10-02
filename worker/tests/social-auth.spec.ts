import { env, applyD1Migrations } from "cloudflare:test";
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { token } from "../lib/social/auth";
import { SocialError } from "../lib/social/common";

beforeAll(() => applyD1Migrations(env.DB, env.TEST_MIGRATIONS));

const NOW = new Date("2026-10-10T12:00:00Z");
const E = { ...env, TIKTOK_CLIENT_KEY: "ck", TIKTOK_CLIENT_SECRET: "cs" } as any;
const put = (platform: string, access: string, expires: string | null, refresh: string | null = null) =>
  env.DB.prepare("INSERT INTO social_auth(platform,access_token,refresh_token,expires_at) VALUES (?,?,?,?)").bind(platform, access, refresh, expires).run();
const row = (p: string) => env.DB.prepare("SELECT * FROM social_auth WHERE platform=?").bind(p).first<any>();

let calls: string[] = [];
let refreshStatus = 200;
beforeEach(async () => {
  await env.DB.prepare("DELETE FROM social_auth").run();
  calls = []; refreshStatus = 200;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any, init?: any) => {
    const u = String(input);
    calls.push(u.split("?")[0]);
    if (refreshStatus !== 200) return new Response('{"error":"nope"}', { status: refreshStatus });
    if (u.startsWith("https://graph.threads.net/refresh_access_token")) return Response.json({ access_token: "TH2", expires_in: 5184000 });
    if (u === "https://open.tiktokapis.com/v2/oauth/token/") {
      expect(String(init.body)).toContain("grant_type=refresh_token");
      return Response.json({ access_token: "TT2", expires_in: 86400, refresh_token: "RT2" });
    }
    throw new Error("unexpected fetch " + u);
  });
});
afterEach(() => vi.restoreAllMocks());

describe("token", () => {
  it("no row → 401", async () => {
    await expect(token(E, "threads", NOW)).rejects.toMatchObject({ status: 401 });
  });
  it("fresh token is returned without a refresh", async () => {
    await put("threads", "TH1", "2026-11-30 00:00:00");
    expect(await token(E, "threads", NOW)).toBe("TH1");
    expect(calls).toEqual([]);
  });
  it("threads within 7 days of expiry refreshes and persists", async () => {
    await put("threads", "TH1", "2026-10-14 00:00:00");
    expect(await token(E, "threads", NOW)).toBe("TH2");
    expect(await row("threads")).toMatchObject({ access_token: "TH2", expires_at: "2026-12-09 12:00:00" });
  });
  it("tiktok within 1 h refreshes and stores the new refresh token", async () => {
    await put("tiktok", "TT1", "2026-10-10 12:30:00", "RT1");
    expect(await token(E, "tiktok", NOW)).toBe("TT2");
    expect(await row("tiktok")).toMatchObject({ access_token: "TT2", refresh_token: "RT2", expires_at: "2026-10-11 12:00:00" });
  });
  it("tiktok refreshes 5 h before expiry (cron runs every 3 h)", async () => {
    await put("tiktok", "TT1", "2026-10-10 17:00:00", "RT1");
    expect(await token(E, "tiktok", NOW)).toBe("TT2");
  });
  it("refresh failure on a still-valid token keeps the old token", async () => {
    await put("threads", "TH1", "2026-10-12 00:00:00");
    refreshStatus = 500;
    expect(await token(E, "threads", NOW)).toBe("TH1");
  });
  it("refresh failure on an expired token throws 401", async () => {
    await put("tiktok", "TT1", "2026-10-10 11:00:00", "RT1");
    refreshStatus = 400;
    const e = await token(E, "tiktok", NOW).catch((x) => x);
    expect(e).toBeInstanceOf(SocialError);
    expect(e.status).toBe(401);
  });
});
