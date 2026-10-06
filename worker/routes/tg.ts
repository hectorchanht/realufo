// worker/routes/tg.ts
import type { Env } from "../env";
import { error, json } from "../lib/json";
import { sameSecret } from "../lib/secret";
import { getJob, jobByMessage, move, openJobs, patchPayload, pendingByStream, revise, setJobMedia, setStreamPaused, streamPaused } from "../lib/jobs";
import { approve, preview, skip } from "../lib/gate";
import { queueCard, refreshQueueCard, showJob } from "../lib/tgcmd";
import { answerCallback, clearButtons, getFile, progress, sendMessage } from "../lib/tg";
import { command } from "../lib/tgcmd";
import { classifyIntent, PORTAL_STREAMS, T, zh, type NluIntent } from "../lib/tg-nlu";
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
  const chat = env.TELEGRAM_OWNER_ID!;
  // Queue card buttons (from /queue or /status): approve/skip, then re-render the card in place.
  if (action === "qok" || action === "qskip") {
    const job = await getJob(env, Number(id));
    if (!job) { await refreshQueueCard(env, chat, q.message.message_id); return ack(env, q.id, "job not found"); }
    const jv = job.version === Number(v) ? job : { ...job, version: -1 };
    if (action === "qok") {
      if (await move(env, job.id, Number(v), ["post_wait"], "approved")) {
        await ack(env, q.id, "posting…");
        // same as the preview ✅ path, minus the preview message's buttons
        const done = await progress(env, chat, "posting…");
        try {
          const line = await approve(env, { ...job, version: Number(v) });
          await sendMessage(env, chat, line).catch((e) => console.log(JSON.stringify({ tg: true, resultNotSent: job.id, error: String(e).slice(0, 200) })));
        } finally { await done(); }
      } else await ack(env, q.id, "already handled or out of date");
    } else {
      const done = await skip(env, jv);
      await ack(env, q.id, done ? "skipped" : "already handled");
    }
    await refreshQueueCard(env, chat, q.message.message_id);
    return;
  }
  if (action === "q") {
    await refreshQueueCard(env, chat, q.message.message_id);
    return ack(env, q.id);
  }
  const job = await getJob(env, Number(id));
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
  const done = await progress(env, chat, "posting…");
  let line: string;
  try {
    line = await approve(env, { ...job, version: Number(v) });
  } finally { await done(); }
  // the job is already final: a lost message must not fail the webhook (Telegram would re-send the update)
  await sendMessage(env, chat, line).catch((e) => console.log(JSON.stringify({ tg: true, resultNotSent: job.id, error: String(e).slice(0, 200) })));
}

async function onMessage(env: Env, m: any) {
  const chat = env.TELEGRAM_OWNER_ID!;
  // photo reply → image swap for a job that asked for one ("換張圖")
  if (m.photo && m.reply_to_message) {
    if (await onPhotoReply(env, m, chat)) return;
  }
  const text = typeof m.text === "string" ? m.text.trim() : "";
  // commands and media uploads keep the old path
  if (!text || text.startsWith("/")) return command(env, m);
  // Portal v2: natural-language replies. A reply targets its preview's job;
  // a bare message targets the single waiting job (if exactly one).
  let job = null;
  if (m.reply_to_message) {
    job = await jobByMessage(env, m.reply_to_message.message_id);
    if (!job) return sendMessage(env, chat, T.stale(zh(text)), undefined, m.message_id);
  } else {
    const waiting = (await openJobs(env)).filter((j) => j.status === "post_wait");
    if (waiting.length === 1) job = waiting[0];
    else if (waiting.length > 1) return sendMessage(env, chat, T.multi(zh(text)), undefined, m.message_id);
    // no waiting jobs: fall through to commands (HELP)
  }
  if (!job) return command(env, m);
  const cjk = zh(text);
  const intent = await classifyIntent(env, text, job);
  const done = await runIntent(env, m, chat, job, intent, cjk);
  if (done) return;
  // unknown + legacy kinds: the old behaviour — a bare reply replaces the caption.
  // (Other kinds have no caption to replace, so they get the clarification above.)
  if (job.kind === "post" || job.kind === "showcase") return legacyCaptionReplace(env, m, chat, job);
  return sendMessage(env, chat, T.clarify(cjk), undefined, m.message_id);
}

// Executes a classified intent. Returns true when handled (false → caller tries legacy fallbacks).
async function runIntent(env: Env, m: any, chat: number, job: any, intent: NluIntent, cjk: boolean): Promise<boolean> {
  const say = (t: string) => sendMessage(env, chat, t, undefined, m.message_id);
  switch (intent.intent) {
    case "approve": {
      if (job.status !== "post_wait") { await say(cjk ? `#${job.id} 而家係 ${job.status},批唔到` : `#${job.id} is ${job.status}, can't approve`); return true; }
      if (!(await move(env, job.id, job.version, ["post_wait"], "approved"))) { await say(T.stale(cjk)); return true; }
      const replyId = m.reply_to_message?.message_id;
      if (replyId) await clearButtons(env, chat, replyId).catch(() => {});
      const line = await approve(env, { ...job, version: job.version });
      await say(`${T.approved(job.id, cjk)}\n${line}`);
      return true;
    }
    case "skip": {
      const ok = await skip(env, job);
      await say(ok ? T.skipped(job.id, cjk) : T.stale(cjk));
      return true;
    }
    case "show": {
      // "Show me video preview" — re-send the job's media, never touch the caption.
      await showJob(env, job, cjk);
      return true;
    }
    case "edit": {
      if (job.status !== "post_wait") { await say(cjk ? `#${job.id} 而家係 ${job.status},改唔到` : `#${job.id} is ${job.status}, can't edit`); return true; }
      if (intent.field === "image") {
        // "換張圖": flag the job and ask for the new image; the photo reply completes the swap.
        await patchPayload(env, job.id, { awaitingImage: true });
        await say(T.sendImage(job.id, cjk));
        return true;
      }
      const next = await applyEdit(env, job, intent.field, intent.value);
      if (!next) { await say(T.stale(cjk)); return true; }
      await say(intent.field === "pace" ? T.paceNoted(job.id, intent.value || "slower", cjk) : T.edited(job.id, cjk));
      await preview(env, next);
      return true;
    }
    case "pause":
    case "resume": {
      const pausing = intent.intent === "pause";
      const streams = intent.stream === "all" ? [...PORTAL_STREAMS] : [intent.stream];
      for (const s of streams) await setStreamPaused(env, s, pausing);
      const label = intent.stream === "all" ? (cjk ? "全部" : "all streams") : intent.stream;
      await say(pausing ? T.paused(label, cjk) : T.resumed(label, cjk));
      return true;
    }
    case "status": {
      const [pending, paused] = await Promise.all([
        pendingByStream(env),
        Promise.all([...PORTAL_STREAMS].map(async (s) => ((await streamPaused(env, s)) ? s : null))),
      ]);
      const pausedList = paused.filter(Boolean);
      const lines = [
        cjk ? "📋 等緊:" : "📋 Waiting:",
        ...(pending.length ? pending.map((p) => `· ${p.stream}: ${p.n}`) : [cjk ? "· 冇" : "· none"]),
        ...(pausedList.length ? [`${cjk ? "⏸️ 停咗:" : "⏸️ Paused:"} ${pausedList.join(", ")}`] : []),
      ];
      await say(lines.join("\n"));
      return true;
    }
    case "help": {
      await say(cjk ? "打 /help 睇晒所有指令 👍" : "Type /help for all commands 👍");
      return true;
    }
    default:
      return false; // unknown → caller tries legacy caption replace, else clarification
  }
}

// Applies an edit intent: new caption + version bump + payload patch, then the caller re-previews.
// Text fields replace the caption; non-text fields (pace) keep the caption and ride in the payload.
const TEXT_FIELDS = ["title", "caption", "text", "description"];
async function applyEdit(env: Env, job: any, field: string, value: string) {
  let caption: string;
  if (TEXT_FIELDS.includes(field)) {
    if (job.kind === "post" || job.kind === "showcase") {
      // legacy thread rule: the reply replaces only the head tweet, link preserved
      const [head, ...rest] = String(job.caption ?? "").split(THREAD_SEP);
      const link = head.match(/https:\/\/realufo\.org\/\S+$/)?.[0];
      const newHead = link && !value.includes(link) ? `${value.trim()}\n${link}` : value.trim();
      if (weightedLength(newHead) > 280) return null; // too long: caller reports stale/unchanged
      caption = [newHead, ...rest].join(THREAD_SEP);
    } else {
      caption = value.trim();
    }
  } else {
    caption = job.caption ?? "";
  }
  await patchPayload(env, job.id, { [field]: value.trim(), [`edited_${field}_at`]: new Date().toISOString() });
  return revise(env, job.id, job.version, caption, `edit ${field}: ${value.slice(0, 80)}`);
}

// "換張圖" completion: Hector replies to a job preview with a photo. Downloads the
// largest size, stores it in R2 under a job-scoped key, swaps the job media, and re-previews.
async function onPhotoReply(env: Env, m: any, chat: number): Promise<boolean> {
  const job = await jobByMessage(env, m.reply_to_message.message_id);
  const cjk = true; // photo replies follow a Cantonese prompt; keep the follow-ups in Chinese
  if (!job) { await sendMessage(env, chat, T.stale(cjk), undefined, m.message_id); return true; }
  if (!job.payload?.awaitingImage) {
    await sendMessage(env, chat, `🖼️ 要換圖先覆「換張圖」,然後再掟張相嚟`, undefined, m.message_id);
    return true;
  }
  if (job.status !== "post_wait") { await sendMessage(env, chat, `#${job.id} 而家係 ${job.status},換唔到圖`, undefined, m.message_id); return true; }
  try {
    const sizes = m.photo as any[];
    const best = sizes[sizes.length - 1];
    const buf = await getFile(env, best.file_id);
    const key = `portal/${job.stream}/${job.ref}-v${job.version + 1}.jpg`;
    await env.MEDIA.put(key, buf, { httpMetadata: { contentType: "image/jpeg", cacheControl: "public, max-age=2592000" } });
    await setJobMedia(env, job.id, { key, mime: "image/jpeg", size: buf.byteLength });
    await patchPayload(env, job.id, { awaitingImage: false });
    const next = await revise(env, job.id, job.version, job.caption ?? "", "image swapped by owner");
    if (!next) { await sendMessage(env, chat, T.stale(cjk), undefined, m.message_id); return true; }
    await sendMessage(env, chat, T.edited(job.id, cjk), undefined, m.message_id);
    await preview(env, next);
  } catch (e) {
    await sendMessage(env, chat, `🖼️ 換圖失敗: ${String(e).slice(0, 120)}`, undefined, m.message_id);
  }
  return true;
}

// The pre-portal behaviour, kept for post/showcase: a bare reply replaces the caption text.
async function legacyCaptionReplace(env: Env, m: any, chat: number, job: any) {
  if (job.status !== "post_wait") return sendMessage(env, chat, `#${job.id} is ${job.status}; only waiting previews can be edited.`);
  const next = await applyEdit(env, job, "caption", m.text.trim());
  if (!next) {
    const cjk = zh(m.text);
    return sendMessage(env, chat, cjk ? `#${job.id}: 太長,改唔到` : `#${job.id}: too long for X; shorten it and reply again. Nothing changed.`);
  }
  return preview(env, next);
}
