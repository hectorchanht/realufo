import { env, applyD1Migrations } from "cloudflare:test";
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { fb, ig, threads } from "../lib/social/meta";
import type { SocialPost } from "../lib/social/common";

beforeAll(() => applyD1Migrations(env.DB, env.TEST_MIGRATIONS));

const NOW = new Date("2026-10-10T12:00:00Z");
const ctx = { now: NOW, sleep: async () => {} };
const E = { ...env, META_PAGE_ID: "PG", META_PAGE_TOKEN: "PT", IG_USER_ID: "IG", THREADS_USER_ID: "TU" } as any;
const video = { kind: "video" as const, key: "clips/wargov/V1.mp4", url: "https://assets.realufo.org/clips/wargov/V1.mp4", size: 100 };
const image = { kind: "image" as const, key: "thumbs/wargov/I1.jpg", url: "https://assets.realufo.org/thumbs/wargov/I1.jpg", size: 100 };
const P = (media: SocialPost["media"]): SocialPost => ({ text: "hello", title: "hello", link: "https://realufo.org/doc/V1", media });

let calls: { url: string; body: string }[] = [];
let status = "FINISHED";
let fail: { match: string; code: number; body: string } | null = null;
beforeEach(async () => {
  await env.DB.prepare("DELETE FROM social_auth").run();
  await env.DB.prepare("INSERT INTO social_auth(platform,access_token,expires_at) VALUES ('threads','TH','2027-01-01 00:00:00')").run();
  calls = []; status = "FINISHED"; fail = null;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any, init?: any) => {
    const url = String(input);
    calls.push({ url: url.split("?")[0], body: String(init?.body ?? url.split("?")[1] ?? "") });
    if (fail && url.includes(fail.match)) return new Response(fail.body, { status: fail.code });
    if (url.includes("/PG/videos")) return Response.json({ id: "FBV" });
    if (url.includes("/PG/photos")) return Response.json({ id: "FBP", post_id: "PG_FBP" });
    if (url.includes("/PG/feed")) return Response.json({ id: "PG_FEED" });
    if (url.endsWith("/IG/media") || url.endsWith("/TU/threads")) return Response.json({ id: "C1" });
    if (url.includes("/C1?")) return Response.json({ status_code: status, status });
    if (url.endsWith("/media_publish") || url.endsWith("/threads_publish")) return Response.json({ id: "PUB1" });
    throw new Error("unexpected fetch " + url);
  });
});
afterEach(() => vi.restoreAllMocks());

describe("fb", () => {
  it("video → /videos with file_url and description", async () => {
    expect(await fb.publish(E, P(video), ctx)).toEqual({ remoteId: "FBV" });
    expect(calls[0].url).toBe("https://graph.facebook.com/v25.0/PG/videos");
    expect(calls[0].body).toContain("file_url=https%3A%2F%2Fassets.realufo.org%2Fclips%2Fwargov%2FV1.mp4");
    expect(calls[0].body).toContain("access_token=PT");
  });
  it("image → /photos (post_id preferred); none → /feed with link", async () => {
    expect(await fb.publish(E, P(image), ctx)).toEqual({ remoteId: "PG_FBP" });
    expect(await fb.publish(E, P(null), ctx)).toEqual({ remoteId: "PG_FEED" });
    expect(calls[1].body).toContain("link=https%3A%2F%2Frealufo.org%2Fdoc%2FV1");
  });
  it("Meta code 190 surfaces as an auth SocialError", async () => {
    fail = { match: "/PG/videos", code: 400, body: '{"error":{"code":190,"message":"expired"}}' };
    await expect(fb.publish(E, P(video), ctx)).rejects.toMatchObject({ status: 400 });
  });
  it("configured needs page id + token", () => {
    expect(fb.configured(E)).toBe(true);
    expect(fb.configured({ ...E, META_PAGE_TOKEN: undefined })).toBe(false);
  });
});

describe("ig", () => {
  it("vertical, video only (IG rejects portrait PDF thumbs); finished container publishes in the same call", async () => {
    expect(ig.vertical).toBe(true);
    expect(ig.needs).toBe("video");
    expect(await ig.publish(E, P(video), ctx)).toEqual({ remoteId: "PUB1" });
    expect(calls[0].body).toContain("media_type=REELS");
    expect(calls.map((c) => c.url.replace("https://graph.facebook.com/v25.0", ""))).toEqual(["/IG/media", "/C1", "/IG/media_publish"]);
  });
  it("image uses image_url, no media_type", async () => {
    await ig.publish(E, P(image), ctx);
    expect(calls[0].body).toContain("image_url=");
    expect(calls[0].body).not.toContain("media_type");
  });
  it("still IN_PROGRESS after polling → containerId; finish later", async () => {
    status = "IN_PROGRESS";
    expect(await ig.publish(E, P(video), ctx)).toEqual({ containerId: "C1" });
    expect(await ig.finish!(E, P(video), "C1", ctx)).toBe("processing");
    status = "FINISHED";
    expect(await ig.finish!(E, P(video), "C1", ctx)).toEqual({ remoteId: "PUB1" });
  });
  it("ERROR container → 422", async () => {
    status = "ERROR";
    await expect(ig.finish!(E, P(video), "C1", ctx)).rejects.toMatchObject({ status: 422 });
  });
});

describe("threads", () => {
  it("uses the social_auth token on graph.threads.net; TEXT when no media", async () => {
    expect(await threads.publish(E, P(null), ctx)).toEqual({ remoteId: "PUB1" });
    expect(calls[0].url).toBe("https://graph.threads.net/v1.0/TU/threads");
    expect(calls[0].body).toContain("media_type=TEXT");
    expect(calls[0].body).toContain("access_token=TH");
    expect(calls.at(-1)!.url).toBe("https://graph.threads.net/v1.0/TU/threads_publish");
  });
  it("video → VIDEO + video_url", async () => {
    await threads.publish(E, P(video), ctx);
    expect(calls[0].body).toContain("media_type=VIDEO");
    expect(calls[0].body).toContain("video_url=");
  });
});
