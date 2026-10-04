import type { Env } from "../env";

// Telegram Bot API client (spec 2026-10-04-realufo-telegram-gate-design). HTTP or ok:false → TgError.
const API = "https://api.telegram.org";
const UPLOAD_MAX = 50 * 1024 * 1024; // bot upload limit

export class TgError extends Error {
  constructor(public status: number, public body: string) {
    super(`telegram ${status}: ${body.slice(0, 300)}`);
  }
}
export type Keyboard = { text: string; callback_data: string }[][];

async function call(env: Env, method: string, body: FormData | Record<string, unknown>): Promise<any> {
  const init: RequestInit = body instanceof FormData
    ? { method: "POST", body }
    : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
  const res = await fetch(`${API}/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, init);
  const text = await res.text();
  let j: any = {};
  try { j = JSON.parse(text); } catch { /* non-JSON = error below */ }
  if (!res.ok || !j.ok) throw new TgError(res.ok ? 502 : res.status, text);
  return j.result;
}

export async function sendMessage(env: Env, chat: string | number, text: string, keyboard?: Keyboard, replyTo?: number): Promise<number> {
  const r = await call(env, "sendMessage", {
    chat_id: chat, text, link_preview_options: { is_disabled: true },
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
    ...(replyTo ? { reply_parameters: { message_id: replyTo } } : {}),
  });
  return r.message_id;
}

export async function sendMedia(env: Env, chat: string | number, key: string, caption?: string): Promise<number> {
  const o = await env.MEDIA.get(key);
  if (!o) throw new TgError(404, `media missing in R2: ${key}`);
  if (o.size > UPLOAD_MAX) { await o.body.cancel(); throw new TgError(413, `${key} is ${o.size} bytes (> 50 MB)`); }
  const type = o.httpMetadata?.contentType ?? (key.endsWith(".mp4") ? "video/mp4" : "image/jpeg");
  const video = type.startsWith("video/");
  const f = new FormData();
  f.set("chat_id", String(chat));
  if (caption) f.set("caption", caption);
  if (video) f.set("supports_streaming", "true");
  f.set(video ? "video" : "photo", new Blob([await o.arrayBuffer()], { type }), key.split("/").pop()!);
  return (await call(env, video ? "sendVideo" : "sendPhoto", f)).message_id;
}

export const answerCallback = async (env: Env, id: string, text?: string) => {
  await call(env, "answerCallbackQuery", { callback_query_id: id, ...(text ? { text } : {}) });
};

export const clearButtons = async (env: Env, chat: string | number, messageId: number) => {
  await call(env, "editMessageReplyMarkup", { chat_id: chat, message_id: messageId, reply_markup: { inline_keyboard: [] } });
};

export async function getFile(env: Env, fileId: string): Promise<ArrayBuffer> {
  const f = await call(env, "getFile", { file_id: fileId });
  const res = await fetch(`${API}/file/bot${env.TELEGRAM_BOT_TOKEN}/${f.file_path}`);
  if (!res.ok) throw new TgError(res.status, await res.text());
  return res.arrayBuffer();
}
