// worker/routes/tg.ts
import type { Env } from "../env";
import { error, json } from "../lib/json";
import { sameSecret } from "../lib/secret";
import { getJob, jobByMessage, move, revise } from "../lib/jobs";
import { approve, preview, skip } from "../lib/gate";
import { answerCallback, clearButtons, sendMessage } from "../lib/tg";
import { command } from "../lib/tgcmd";
import { THREAD_SEP } from "../lib/x";
import { weightedLength } from "../lib/xcopy";

// POST /__tg: Telegram webhook (spec 2026-10-04-realufo-telegram-gate-design). Owner only;
// everything else is answered 200 and ignored so Telegram doesn't retry it.
export async function tgWebhook(req: Request, env: Env): Promise<Response> {
  const secret = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!env.TELEGRAM_WEBHOOK_SECRET || req.method !== "POST" || !(await sameSecret(secret, env.TELEGRAM_WEBHOOK_SECRET))) return error(404, "not found");
  const u = await req.json<any>().catch(() => ({}));
  const from = u.callback_query?.from?.id ?? u.message?.from?.id;
  const chat = u.callback_query ? u.callback_query.message?.chat?.id : u.message?.chat?.id; // the owner's private chat only, not a group
  if (!from || String(from) !== String(env.TELEGRAM_OWNER_ID) || String(chat) !== String(env.TELEGRAM_OWNER_ID)) return json({ ok: true });
  try {
    if (u.callback_query) await onButton(env, u.callback_query);
    else if (u.message) await onMessage(env, u.message);
  } catch (e) {
    // a 500 makes Telegram re-send this update (re-running uploads / AI drafts) and queue later ones behind it
    const token = env.TELEGRAM_BOT_TOKEN;
    let reason = e instanceof Error ? e.message : String(e);
    if (token) reason = reason.split(token).join("…"); // TgError bodies can echo the bot URL
    reason = reason.slice(0, 300);
    console.log(JSON.stringify({ tg: true, failed: reason }));
    await sendMessage(env, env.TELEGRAM_OWNER_ID!, `⚠️ failed: ${reason}`).catch(() => {});
  }
  return json({ ok: true });
}

// A stale callback id must never leave a job half-moved, so acks are best effort.
const ack = (env: Env, id: string, text?: string) => answerCallback(env, id, text).catch(() => {});

async function onButton(env: Env, q: any) {
  const [action, id, v] = String(q.data ?? "").split(":");
  const job = await getJob(env, Number(id));
  const chat = env.TELEGRAM_OWNER_ID!;
  if (!job) return ack(env, q.id, "job not found");
  if (action === "skip") {
    const ok = await skip(env, job.version === Number(v) ? job : { ...job, version: -1 });
    await ack(env, q.id, ok ? "skipped" : "already handled");
    if (ok) await clearButtons(env, chat, q.message.message_id).catch(() => {});
    return;
  }
  if (action !== "ok") return ack(env, q.id);
  if (!(await move(env, job.id, Number(v), ["post_wait"], "approved"))) return ack(env, q.id, "already handled or out of date");
  await ack(env, q.id, "posting…"); // answer first: approval can take a while
  await clearButtons(env, chat, q.message.message_id).catch(() => {});
  const line = await approve(env, { ...job, version: Number(v) });
  // the job is already final: a lost message must not fail the webhook (Telegram would re-send the update)
  await sendMessage(env, chat, line).catch((e) => console.log(JSON.stringify({ tg: true, resultNotSent: job.id, error: String(e).slice(0, 200) })));
}

async function onMessage(env: Env, m: any) {
  const chat = env.TELEGRAM_OWNER_ID!;
  // a reply that starts with "/" is a command, not a new caption
  if (m.reply_to_message && typeof m.text === "string" && !m.text.trimStart().startsWith("/")) {
    const job = await jobByMessage(env, m.reply_to_message.message_id);
    if (!job) return sendMessage(env, chat, "That preview is out of date (or not a job). Reply to the newest preview.", undefined, m.message_id);
    if (job.kind !== "post" && job.kind !== "showcase") return sendMessage(env, chat, `#${job.id} is a ${job.kind} job; edit it at its source and re-send.`);
    if (job.status !== "post_wait") return sendMessage(env, chat, `#${job.id} is ${job.status}; only waiting previews can be edited.`);
    // A showcase caption may be a thread (parts joined by THREAD_SEP): the reply replaces only the head tweet.
    const [head, ...rest] = (job.caption ?? "").split(THREAD_SEP);
    const link = head.match(/https:\/\/realufo\.org\/\S+$/)?.[0];
    const newHead = link && !m.text.includes(link) ? `${m.text.trim()}\n${link}` : m.text.trim();
    const len = weightedLength(newHead);
    if (len > 280) return sendMessage(env, chat, `#${job.id}: that is ${len}/280 for X; shorten it and reply again. Nothing changed.`);
    const next = await revise(env, job.id, job.version, [newHead, ...rest].join(THREAD_SEP), m.text);
    if (!next) return sendMessage(env, chat, `#${job.id} changed meanwhile; reply to the newest preview.`);
    return preview(env, next);
  }
  return command(env, m);
}
