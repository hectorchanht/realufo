import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { bsky } from "../lib/social/bsky";
import type { SocialPost } from "../lib/social/common";

const ctx = { now: new Date("2026-10-10T12:00:00Z"), sleep: async () => {} };
const E = { ...env, BSKY_HANDLE: "realufo.org", BSKY_APP_PASSWORD: "app-pw" } as any;
const LINK = "https://realufo.org/doc/V1";
const P = (media: SocialPost["media"]): SocialPost => ({ text: `📼 orb\n\n${LINK}`, title: "orb", link: LINK, media });

let calls: string[] = [];
let record: any = null;
let jobState = "JOB_STATE_COMPLETED";
beforeEach(async () => {
  await env.MEDIA.put("clips/wargov/V1.mp4", new Uint8Array(1000));
  await env.MEDIA.put("thumbs/wargov/I1.jpg", new Uint8Array(500), { httpMetadata: { contentType: "image/jpeg" } });
  calls = []; record = null; jobState = "JOB_STATE_COMPLETED";
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any, init?: any) => {
    const u = String(input);
    calls.push(u.split("?")[0].replace(/^https:\/\/[^/]+\/xrpc\//, ""));
    if (u.endsWith("createSession")) return Response.json({ accessJwt: "JWT", did: "did:plc:abc", didDoc: { service: [{ id: "#atproto_pds", serviceEndpoint: "https://morel.us-east.host.bsky.network" }] } });
    if (u.includes("getServiceAuth")) { expect(u).toContain("aud=did%3Aweb%3Amorel.us-east.host.bsky.network"); return Response.json({ token: "SVC" }); }
    if (u.includes("uploadVideo")) { expect(init.headers.Authorization).toBe("Bearer SVC"); return Response.json({ jobId: "J1", state: "JOB_STATE_CREATED" }); }
    if (u.includes("getJobStatus")) { expect(init?.headers?.Authorization).toBeUndefined(); return Response.json({ jobStatus: { jobId: "J1", state: jobState, ...(jobState === "JOB_STATE_COMPLETED" ? { blob: { ref: "VB" } } : {}) } }); }
    if (u.endsWith("uploadBlob")) return Response.json({ blob: { ref: "IB" } });
    if (u.endsWith("createRecord")) { record = JSON.parse(init.body).record; return Response.json({ uri: "at://did:plc:abc/app.bsky.feed.post/1" }); }
    throw new Error("unexpected fetch " + u);
  });
});
afterEach(() => vi.restoreAllMocks());

const video = { kind: "video" as const, key: "clips/wargov/V1.mp4", url: "https://assets.realufo.org/clips/wargov/V1.mp4", size: 1000 };

describe("bsky", () => {
  it("text post carries a link facet", async () => {
    expect(await bsky.publish(E, P(null), ctx)).toEqual({ remoteId: "at://did:plc:abc/app.bsky.feed.post/1" });
    expect(record.text).toBe(`📼 orb\n\n${LINK}`);
    expect(record.facets[0].features[0].uri).toBe(LINK);
    expect(record.embed).toBeUndefined();
  });
  it("video goes through the video service and embeds the processed blob", async () => {
    await bsky.publish(E, P(video), ctx);
    expect(calls).toEqual(["com.atproto.server.createSession", "com.atproto.server.getServiceAuth", "app.bsky.video.uploadVideo", "app.bsky.video.getJobStatus", "com.atproto.repo.createRecord"]);
    expect(record.embed).toEqual({ $type: "app.bsky.embed.video", video: { ref: "VB" } });
  });
  it("video still processing → containerId, finish posts later", async () => {
    jobState = "JOB_STATE_ENCODING";
    expect(await bsky.publish(E, P(video), ctx)).toEqual({ containerId: "J1" });
    expect(await bsky.finish!(E, P(video), "J1", ctx)).toBe("processing");
    jobState = "JOB_STATE_COMPLETED";
    expect(await bsky.finish!(E, P(video), "J1", ctx)).toEqual({ remoteId: "at://did:plc:abc/app.bsky.feed.post/1" });
  });
  it("failed job → 422", async () => {
    jobState = "JOB_STATE_FAILED";
    await expect(bsky.finish!(E, P(video), "J1", ctx)).rejects.toMatchObject({ status: 422 });
  });
  it("small image → uploadBlob + images embed with alt text; >1 MB image → text only", async () => {
    await bsky.publish(E, P({ kind: "image", key: "thumbs/wargov/I1.jpg", url: "u", size: 500 }), ctx);
    expect(record.embed).toEqual({ $type: "app.bsky.embed.images", images: [{ alt: "orb", image: { ref: "IB" } }] });
    await bsky.publish(E, P({ kind: "image", key: "thumbs/wargov/I1.jpg", url: "u", size: 2_000_000 }), ctx);
    expect(record.embed).toBeUndefined();
  });
});
