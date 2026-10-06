import type { Env } from "../env";

// Telegram Bot API client (spec 2026-10-04-realufo-telegram-gate-design). HTTP or ok:false → TgError.
const API = "https://api.telegram.org";
const UPLOAD_MAX = 50 * 1024 * 1024; // bot upload limit

export class TgError extends Error {
  constructor(public status: number, public body: string) {
    super(`telegram ${status}: ${body.slice(0, 300)}`);
  }
}
export type KeyboardButton = { text: string; callback_data?: string; url?: string };
export type Keyboard = KeyboardButton[][];

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
  const ct = o.httpMetadata?.contentType;
  const type = key.endsWith(".mp4") && (!ct || /octet-stream/.test(ct)) ? "video/mp4" : ct ?? "image/jpeg"; // generic type on an mp4 = video
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

// Chat "typing… / uploading video…" indicator. Best effort: never fails the caller.
export const sendAction = (env: Env, chat: string | number, action: "typing" | "upload_video" | "upload_photo") =>
  call(env, "sendChatAction", { chat_id: chat, action }).catch(() => {});

export const deleteMessage = (env: Env, chat: string | number, messageId: number) =>
  call(env, "deleteMessage", { chat_id: chat, message_id: messageId });

// "⏳ doing…" placeholder for slow ops (staging, uploading, publishing).
// Returns a cleanup that deletes it — call it in a finally.
export async function progress(env: Env, chat: string | number, text: string): Promise<() => Promise<void>> {
  let id = 0;
  try { id = await sendMessage(env, chat, `⏳ ${text}`); } catch { /* non-fatal */ }
  return async () => { if (id) await deleteMessage(env, chat, id).catch(() => {}); };
}

// Re-render a bot message in place (queue list refresh after an approve/skip tap).
export const editMessage = async (env: Env, chat: string | number, messageId: number, text: string, keyboard?: Keyboard) => {
  await call(env, "editMessageText", {
    chat_id: chat, message_id: messageId, text,
    link_preview_options: { is_disabled: true },
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
  });
};

// Owner command menu in the Telegram "/" popup. Idempotent; called on /help.
export const setCommands = (env: Env) =>
  call(env, "setMyCommands", {
    commands: [
      { command: "post", description: "Preview a record: /post <record ID>" },
      { command: "show", description: "Re-send a job's video/images: /show [job #]" },
      { command: "ok", description: "Approve a job by number: /ok <job #>" },
      { command: "info", description: "Full job details: /info <job #>" },
      { command: "queue", description: "Open jobs — approve/skip inline" },
      { command: "status", description: "Today's posts, waiting jobs, spend" },
      { command: "skip", description: "Drop a job: /skip <job # or record ID>" },
      { command: "pause", description: "Pause a stream: /pause <stream|all>" },
      { command: "resume", description: "Resume a stream: /resume <stream|all>" },
      { command: "drain", description: "Re-run the social fan-out once" },
      { command: "help", description: "All commands" },
    ],
  }).catch(() => {});

export const clearButtons = async (env: Env, chat: string | number, messageId: number) => {
  await call(env, "editMessageReplyMarkup", { chat_id: chat, message_id: messageId, reply_markup: { inline_keyboard: [] } });
};

export async function getFile(env: Env, fileId: string): Promise<ArrayBuffer> {
  const f = await call(env, "getFile", { file_id: fileId });
  const res = await fetch(`${API}/file/bot${env.TELEGRAM_BOT_TOKEN}/${f.file_path}`);
  if (!res.ok) throw new TgError(res.status, await res.text());
  return res.arrayBuffer();
}
