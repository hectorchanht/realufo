import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { tg } from "../lib/social/tg";
import { compose } from "../lib/social/text";
import { SocialError } from "../lib/social/common";

const E = { ...env, TELEGRAM_BOT_TOKEN: "T0K", TELEGRAM_CHANNEL: "@realufo_org" } as any;
const ctx = { now: new Date("2026-10-10T15:00:00Z"), sleep: async () => {} };
let calls: { method: string; body: any }[] = [];
let status = 200;
beforeEach(() => {
  calls = []; status = 200;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (u: any, init?: any) => {
    calls.push({ method: String(u).split("/").pop()!, body: init.body instanceof FormData ? Object.fromEntries(init.body as any) : JSON.parse(init.body) });
    return status === 200 ? new Response(JSON.stringify({ ok: true, result: { message_id: 9 } })) : new Response(JSON.stringify({ ok: false }), { status });
  });
});
afterEach(() => vi.restoreAllMocks());

describe("telegram channel adapter", () => {
  it("video → sendVideo to the channel with the caption; remoteId = message id", async () => {
    await env.MEDIA.put("clips-v/wargov/TG-1.mp4", new Uint8Array(10), { httpMetadata: { contentType: "video/mp4" } });
    const r = await tg.publish(E, { text: "cap", title: "t", link: null, media: { kind: "video", key: "clips-v/wargov/TG-1.mp4", url: "u", size: 10 } }, ctx);
    expect(r).toEqual({ remoteId: "9" });
    expect(calls[0]).toMatchObject({ method: "sendVideo", body: { chat_id: "@realufo_org", caption: "cap" } });
  });
  it("no media → sendMessage", async () => {
    await tg.publish(E, { text: "just text", title: "t", link: null, media: null }, ctx);
    expect(calls[0]).toMatchObject({ method: "sendMessage", body: { chat_id: "@realufo_org", text: "just text" } });
  });
  it("Telegram errors become SocialError (retry rules apply)", async () => {
    status = 429;
    await expect(tg.publish(E, { text: "x", title: "t", link: null, media: null }, ctx)).rejects.toBeInstanceOf(SocialError);
  });
  it("configured only with token + channel; caption fits 1024 with link and tags", () => {
    expect(tg.configured(E)).toBe(true);
    expect(tg.configured({ ...E, TELEGRAM_CHANNEL: "" })).toBe(false);
    const c = compose("tg", "x".repeat(2000) + "\nhttps://realufo.org/doc/TG-1", "wargov", { id: "TG-1", kind: "video", title: "T", location: null });
    expect(c.text.length).toBeLessThanOrEqual(1024);
    expect(c.text).toContain("https://realufo.org/doc/TG-1");
    expect(c.text).toContain("#UFO");
  });
});
