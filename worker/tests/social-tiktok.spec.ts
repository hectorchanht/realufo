import { env, applyD1Migrations } from "cloudflare:test";
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { tiktok } from "../lib/social/tiktok";

beforeAll(() => applyD1Migrations(env.DB, env.TEST_MIGRATIONS));

const ctx = { now: new Date("2026-10-10T12:00:00Z"), sleep: async () => {} };
const E = (extra = {}) => ({ ...env, TIKTOK_CLIENT_KEY: "ck", TIKTOK_CLIENT_SECRET: "cs", TIKTOK_PRIVACY: "SELF_ONLY", ...extra }) as any;
const P = { text: "orb #UFO", title: "orb", link: null, media: { kind: "video" as const, key: "clips-v/wargov/V1.mp4", url: "https://assets.realufo.org/clips-v/wargov/V1.mp4", size: 10 } };

let init: any = null;
let status = "PUBLISH_COMPLETE";
let initError = "ok";
beforeEach(async () => {
  await env.DB.prepare("DELETE FROM social_auth").run();
  await env.DB.prepare("INSERT INTO social_auth(platform,access_token,refresh_token,expires_at) VALUES ('tiktok','TT','RT','2026-10-11 00:00:00')").run();
  init = null; status = "PUBLISH_COMPLETE"; initError = "ok";
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any, req?: any) => {
    const u = String(input);
    expect(req.headers.Authorization).toBe("Bearer TT");
    if (u.endsWith("/creator_info/query/")) return Response.json({ data: { privacy_level_options: ["SELF_ONLY", "PUBLIC_TO_EVERYONE"] }, error: { code: "ok" } });
    if (u.endsWith("/video/init/")) { init = JSON.parse(req.body); return Response.json({ data: { publish_id: "PUB1" }, error: { code: initError, message: "x" } }); }
    if (u.endsWith("/status/fetch/"))
      return Response.json({ data: { status, ...(status === "PUBLISH_COMPLETE" ? { publicaly_available_post_id: [7123] } : {}), ...(status === "FAILED" ? { fail_reason: "file_format_check_failed" } : {}) }, error: { code: "ok" } });
    throw new Error("unexpected fetch " + u);
  });
});
afterEach(() => vi.restoreAllMocks());

describe("tiktok", () => {
  it("pulls the vertical clip from our CDN with the configured privacy", async () => {
    expect(await tiktok.publish(E(), P, ctx)).toEqual({ containerId: "PUB1" });
    expect(init.source_info).toEqual({ source: "PULL_FROM_URL", video_url: P.media.url });
    expect(init.post_info).toMatchObject({ title: "orb #UFO", privacy_level: "SELF_ONLY" });
  });
  it("privacy not offered by the creator → 400", async () => {
    await expect(tiktok.publish(E({ TIKTOK_PRIVACY: "FOLLOWER_OF_CREATOR" }), P, ctx)).rejects.toMatchObject({ status: 400 });
  });
  it("error.code other than ok → SocialError even on HTTP 200", async () => {
    initError = "spam_risk_too_many_posts";
    await expect(tiktok.publish(E(), P, ctx)).rejects.toMatchObject({ status: 400 });
  });
  it("finish: complete / processing / failed", async () => {
    expect(await tiktok.finish!(E(), P, "PUB1", ctx)).toEqual({ remoteId: "7123" });
    status = "PROCESSING_DOWNLOAD";
    expect(await tiktok.finish!(E(), P, "PUB1", ctx)).toBe("processing");
    status = "FAILED";
    await expect(tiktok.finish!(E(), P, "PUB1", ctx)).rejects.toMatchObject({ status: 422 });
  });
});
