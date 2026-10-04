import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { sendMessage, sendMedia, answerCallback, TgError } from "../lib/tg";
import { sameSecret } from "../lib/secret";

const E = { ...env, TELEGRAM_BOT_TOKEN: "T0K" } as any;
let calls: { url: string; init: any }[] = [];
let reply: () => Response;
beforeEach(() => {
  calls = [];
  reply = () => new Response(JSON.stringify({ ok: true, result: { message_id: 42 } }));
  vi.spyOn(globalThis, "fetch").mockImplementation(async (u: any, init?: any) => { calls.push({ url: String(u), init }); return reply(); });
});
afterEach(() => vi.restoreAllMocks());

describe("tg client", () => {
  it("sendMessage posts JSON with buttons and returns the message id", async () => {
    const id = await sendMessage(E, 7, "hi", [[{ text: "✅", callback_data: "ok:1:1" }]], 5);
    expect(id).toBe(42);
    expect(calls[0].url).toBe("https://api.telegram.org/botT0K/sendMessage");
    expect(JSON.parse(calls[0].init.body)).toMatchObject({ chat_id: 7, text: "hi", reply_markup: { inline_keyboard: [[{ text: "✅", callback_data: "ok:1:1" }]] }, reply_parameters: { message_id: 5 } });
  });
  it("sendMedia picks sendVideo for mp4 and sendPhoto for images, multipart from R2", async () => {
    await env.MEDIA.put("tgtest/a.mp4", new Uint8Array(10), { httpMetadata: { contentType: "video/mp4" } });
    await env.MEDIA.put("tgtest/b.jpg", new Uint8Array(10), { httpMetadata: { contentType: "image/jpeg" } });
    await sendMedia(E, 7, "tgtest/a.mp4", "cap");
    await sendMedia(E, 7, "tgtest/b.jpg");
    expect(calls.map((c) => c.url.split("/").pop())).toEqual(["sendVideo", "sendPhoto"]);
    const f = calls[0].init.body as FormData;
    expect(f.get("chat_id")).toBe("7");
    expect(f.get("caption")).toBe("cap");
    expect(f.get("video")).toBeInstanceOf(Blob);
  });
  it("sendMedia throws 404 for a missing key and 413 over 50 MB, without calling Telegram", async () => {
    await expect(sendMedia(E, 7, "tgtest/none.mp4")).rejects.toMatchObject({ status: 404 });
    await env.MEDIA.put("tgtest/big.mp4", new Uint8Array(50 * 1024 * 1024 + 1), { httpMetadata: { contentType: "video/mp4" } });
    await expect(sendMedia(E, 7, "tgtest/big.mp4")).rejects.toMatchObject({ status: 413 });
    expect(calls).toEqual([]);
  });
  it("throws TgError when Telegram says ok:false", async () => {
    reply = () => new Response(JSON.stringify({ ok: false, description: "chat not found" }), { status: 400 });
    await expect(answerCallback(E, "q1")).rejects.toBeInstanceOf(TgError);
  });
  it("sameSecret compares in constant time", async () => {
    expect(await sameSecret("abc", "abc")).toBe(true);
    expect(await sameSecret("abc", "abd")).toBe(false);
  });
});
