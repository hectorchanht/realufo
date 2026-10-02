import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { yt } from "../lib/social/yt";

const ctx = { now: new Date("2026-10-10T12:00:00Z"), sleep: async () => {} };
const E = { ...env, YT_CLIENT_ID: "ci", YT_CLIENT_SECRET: "cs", YT_REFRESH_TOKEN: "rt" } as any;
const video = { kind: "video" as const, key: "clips-v/wargov/V1.mp4", url: "https://assets.realufo.org/clips-v/wargov/V1.mp4", size: 1234 };
const P = (title = "Gulf orb #Shorts") => ({ text: "desc https://realufo.org/doc/V1", title, link: "https://realufo.org/doc/V1", media: video });

let meta: any = null;
let tokenStatus = 200;
let putBytes = 0;
beforeEach(async () => {
  await env.MEDIA.put("clips-v/wargov/V1.mp4", new Uint8Array(1234));
  meta = null; tokenStatus = 200; putBytes = 0;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any, init?: any) => {
    const u = String(input);
    if (u === "https://oauth2.googleapis.com/token")
      return tokenStatus === 200 ? Response.json({ access_token: "AT" }) : new Response('{"error":"invalid_grant"}', { status: tokenStatus });
    if (u.startsWith("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable")) {
      expect(init.headers.Authorization).toBe("Bearer AT");
      expect(init.headers["X-Upload-Content-Length"]).toBe("1234");
      meta = JSON.parse(init.body);
      return new Response(null, { status: 200, headers: { Location: "https://upload.example/session1" } });
    }
    if (u === "https://upload.example/session1") { putBytes = (init.body as ArrayBuffer).byteLength; return Response.json({ id: "YT1" }); }
    throw new Error("unexpected fetch " + u);
  });
});
afterEach(() => vi.restoreAllMocks());

describe("yt", () => {
  it("needs a vertical video", () => {
    expect(yt.needs).toBe("video");
    expect(yt.vertical).toBe(true);
  });
  it("resumable upload from R2 with #Shorts title", async () => {
    expect(await yt.publish(E, P(), ctx)).toEqual({ remoteId: "YT1" });
    expect(meta.snippet).toMatchObject({ title: "Gulf orb #Shorts", description: "desc https://realufo.org/doc/V1", categoryId: "28" });
    expect(meta.status).toEqual({ privacyStatus: "public", selfDeclaredMadeForKids: false });
    expect(putBytes).toBe(1234);
  });
  it("sends the composed title unchanged (ytTitle already added #Shorts)", async () => {
    await yt.publish(E, P("t".repeat(92) + " #Shorts"), ctx);
    expect(meta.snippet.title).toBe("t".repeat(92) + " #Shorts");
  });
  it("invalid_grant on token refresh → 401 auth error", async () => {
    tokenStatus = 400;
    await expect(yt.publish(E, P(), ctx)).rejects.toMatchObject({ status: 401 });
  });
});
