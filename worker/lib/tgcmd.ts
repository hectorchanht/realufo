// worker/lib/tgcmd.ts
import type { Env } from "../env";
import { getJob, openJobs, OPEN, pendingByStream, setSetting, setStreamPaused, streamPaused, type Job } from "./jobs";
import { queue, skip } from "./gate";
import { stage } from "./xbot";
import { costOf, monthSpend, nextCandidate, sqlTime, type Candidate } from "./xpick";
import { SKIP_REASONS, tick as socialTick } from "./social/tick";
import { editMessage, getFile, sendMessage, setCommands, type Keyboard } from "./tg";
import { PORTAL_STREAMS } from "./tg-nlu";

// Owner commands in the private chat (spec: "Admin commands"). Every post still waits for ✅.
const DOWNLOAD_MAX = 20 * 1024 * 1024; // Telegram bots can download ≤20 MB

const HELP = [
  "/post <ID> · preview a record post (video clip or image)",
  "send an mp4 with caption \"<ID> text\" · your own video as a showcase post (≤20 MB; bigger: scripts/publish.sh)",
  "/queue · open jobs",
  "/status · posts today, waiting jobs per stream, paused streams, failures, spend",
  "/pause [stream] · /resume [stream] · stream = record|short|article|social|poll|all (no arg = bot picks, as before)",
  "/drain · re-run the fan-out for missed platforms",
  "/skip <job # or record ID> · drop a job",
  "Reply to a preview: ok / 唔要 / show video / title 改做 X / pause shorts / status — natural text works too.",
].join("\n");

// ---- Interactive queue card ----
// One message lists every open job with per-job ✅/❌ buttons, so the owner can
// triage without scrolling back to each preview. Callbacks (qok/qskip) are handled
// in routes/tg.ts and re-render this card in place via editMessage.
const mediaEmoji = (m: Job["media"]) => (!m ? "📝" : m.mime.startsWith("video/") ? "🎬" : "🖼️");
const sizeStr = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);
const ageStr = (createdAt: string) => {
  const mins = Math.max(0, Math.round((Date.now() - new Date(createdAt.replace(" ", "T") + "Z").getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h`;
  return `${Math.floor(mins / 1440)}d`;
};
const snippet = (t: string | null) => {
  const s = (t ?? "").split("\n")[0].replace(/\s+/g, " ").trim().slice(0, 80);
  return s ? ` · “${s}${(t ?? "").length > 80 ? "…" : ""}”` : "";
};

export async function queueCard(env: Env): Promise<{ text: string; keyboard?: Keyboard }> {
  const js = await openJobs(env);
  if (!js.length) return { text: "📋 Queue — empty, nothing waiting." };
  const lines = [`📋 Queue (${js.length})`, ""];
  const keyboard: Keyboard = [];
  for (const j of js) {
    const media = j.media ? `${mediaEmoji(j.media)} ${sizeStr(j.media.size)}` : `${mediaEmoji(null)} text only`;
    lines.push(`#${j.id} · ${j.stream} · ${j.ref} · ${ageStr(j.created_at)}`, `${media}${snippet(j.caption)}`, "");
    keyboard.push([
      { text: `✅ #${j.id}`, callback_data: `qok:${j.id}:${j.version}` },
      { text: `❌ #${j.id}`, callback_data: `qskip:${j.id}:${j.version}` },
    ]);
  }
  return { text: lines.join("\n").trimEnd(), keyboard };
}

// Re-render a queue card message after a qok/qskip tap (routes/tg.ts).
export async function refreshQueueCard(env: Env, chat: string | number, messageId: number): Promise<void> {
  const card = await queueCard(env);
  await editMessage(env, chat, messageId, card.text, card.keyboard).catch(() => {});
}

export async function command(env: Env, m: any) {
  const chat = env.TELEGRAM_OWNER_ID!;
  const say = (t: string) => sendMessage(env, chat, t);
  if (m.video || m.document?.mime_type === "video/mp4") return upload(env, m, say);
  const [cmd, arg = ""] = String(m.text ?? "").trim().split(/\s+/, 2);
  const now = new Date();
  switch (cmd) {
    case "/post": {
      if (!arg) return say("Usage: /post <record ID>");
      const c = await nextCandidate({ ...env, X_FORCE_PICK: arg }, now);
      const d = c && (await stage(env, c, now));
      if (!c || !d) return say(await whyNot(env, arg, c, now));
      const j = await queue(env, c, d);
      return j ? undefined : say(`${arg} already has an open job.`);
    }
    case "/queue": {
      const card = await queueCard(env);
      return sendMessage(env, chat, card.text, card.keyboard);
    }
    case "/status": {
      const day = sqlTime(now);
      const x = await env.DB.prepare("SELECT status, count(*) n FROM x_posts WHERE date(created_at)=date(?) GROUP BY status").bind(day).all<{ status: string; n: number }>();
      // failed rows of the last 24 h, split: real errors vs. "this platform can't take this media" skips
      const f = await env.DB.prepare(
        `SELECT platform, coalesce(error,'') IN (SELECT value FROM json_each(?2)) skip, count(*) n FROM social_posts
         WHERE status='failed' AND deleted_at IS NULL AND created_at>=datetime(?1,'-1 day') GROUP BY platform, skip ORDER BY platform`
      ).bind(day, JSON.stringify(SKIP_REASONS)).all<{ platform: string; skip: number; n: number }>();
      const list = (skip: number) => f.results.filter((r) => r.skip === skip).map((r) => `${r.platform} ${r.n}`).join(", ");
      // Portal v2: waiting jobs per stream + paused streams
      const pending = await pendingByStream(env);
      const paused = (await Promise.all([...PORTAL_STREAMS].map(async (s) => ((await streamPaused(env, s)) ? s : null)))).filter(Boolean);
      return sendMessage(env, chat, [
        `Today on X: ${x.results.map((r) => `${r.status} ${r.n}`).join(", ") || "nothing"}`,
        `Waiting: ${pending.length ? pending.map((p) => `${p.stream} ${p.n}`).join(", ") : "none"}`,
        ...(paused.length ? [`Paused: ${paused.join(", ")}`] : []),
        `Failed last 24 h: ${list(0) || "none"}`,
        ...(list(1) ? [`Skipped (needs video) last 24 h: ${list(1)}`] : []),
        `Month spend: $${(await monthSpend(env, now)).toFixed(2)} of $${env.X_MONTHLY_USD_CAP ?? "10"}`,
      ].join("\n"), [[{ text: "📋 Queue", callback_data: "q" }]]);
    }
    case "/pause": {
      // no arg = legacy: the bot's own daily picks. With arg: portal stream(s).
      if (!arg) { await setSetting(env, "paused_picks", "1"); return say("Bot picks paused."); }
      return say(await setPause(env, arg, true));
    }
    case "/resume": {
      if (!arg) { await setSetting(env, "paused_picks", "0"); return say("Bot picks on (each still waits for your ✅)."); }
      return say(await setPause(env, arg, false));
    }
    case "/drain": await socialTick(env, now); return say("Fan-out ran once; /status for failures.");
    case "/help": setCommands(env); return say(HELP);
    case "/skip": {
      const raw = arg.replace(/^#/, "");
      const n = Number(raw);
      // "#12" / "12" as /queue prints it, or the ref (record/release ID) from the same line
      const j = Number.isInteger(n) && n > 0
        ? await getJob(env, n)
        : raw ? (await openJobs(env)).find((x) => x.ref === raw) ?? null : null;
      if (!j) return say(raw ? `${arg}: not found or already closed.` : "Usage: /skip <job number | record ID>");
      return say((await skip(env, j)) ? `#${j.id} skipped.` : `#${j.id}: already closed.`);
    }
    default: return say(HELP);
  }
}

// Portal v2: /pause <stream|all> / /resume <stream|all>
async function setPause(env: Env, arg: string, pausing: boolean): Promise<string> {
  const v = arg.toLowerCase().replace(/s$/, "");
  const streams = v === "all" ? [...PORTAL_STREAMS] : [v];
  for (const s of streams) {
    if (!(PORTAL_STREAMS as readonly string[]).includes(s)) return `Unknown stream "${arg}". Use: ${(PORTAL_STREAMS as readonly string[]).join("|")} or all.`;
  }
  for (const s of streams) await setStreamPaused(env, s, pausing);
  const label = v === "all" ? "all streams" : streams.join(", ");
  return pausing ? `⏸️ ${label} paused — no new jobs will queue.` : `▶️ ${label} resumed.`;
}

// The one reason a /post <ID> got no preview. c = forced candidate (null: the record itself was refused).
async function whyNot(env: Env, id: string, c: Candidate | null, now: Date): Promise<string> {
  if (c) {
    // record is fine; stage refused it, and for a forced pick only the monthly cap can (no daily count)
    return `${id}: over the monthly X budget ($${(await monthSpend(env, now)).toFixed(2)} spent + $${costOf(c).toFixed(2)} for this post > $${env.X_MONTHLY_USD_CAP ?? "10"}).`;
  }
  const r = await env.DB.prepare("SELECT status, title FROM records WHERE id=?").bind(id).first<{ status: string; title: string | null }>();
  if (!r) return `${id}: no record with that ID.`;
  if (r.status !== "live") return `${id}: record is ${r.status}, not live.`;
  if ((r.title ?? "").includes("original title not published")) return `${id}: its title isn't published yet (placeholder), so it isn't offered.`;
  const p = await env.DB.prepare("SELECT status, created_at FROM x_posts WHERE stream='pick' AND ref=? ORDER BY id DESC LIMIT 1")
    .bind(id).first<{ status: string; created_at: string }>();
  if (p) {
    const day = p.created_at.slice(0, 10);
    return p.status === "failed" ? `${id}: an earlier X post failed on ${day}; that row blocks a re-post.` : `${id}: already posted on X on ${day}.`;
  }
  return `${id}: not offered (no reason found; check the logs).`;
}

async function upload(env: Env, m: any, say: (t: string) => Promise<number>) {
  const file = m.video ?? m.document;
  const [id, ...rest] = String(m.caption ?? "").trim().split(/\s+/);
  const text = rest.join(" ").trim();
  if (!id || !text) return say("Caption must be \"<RECORD-ID> post text\".");
  if ((file.file_size ?? 0) > DOWNLOAD_MAX) return say("Over 20 MB: bots can't download it. Use scripts/publish.sh --showcase.");
  const rec = await env.DB.prepare("SELECT archive FROM records WHERE id=? AND status='live'").bind(id).first<{ archive: string }>();
  if (!rec) return say(`${id}: no live record.`);
  if (await env.DB.prepare("SELECT 1 FROM x_posts WHERE stream='showcase' AND ref=?").bind(id).first()) return say(`${id}: a showcase is already posted for this record.`);
  // an open job's preview already showed the current file: replacing it would approve different bytes than the owner saw
  const open = await env.DB.prepare(`SELECT 1 FROM bot_jobs WHERE stream='showcase' AND ref=? AND deleted_at IS NULL AND status IN (${OPEN.map(() => "?").join(",")})`).bind(id, ...OPEN).first();
  if (open) return say(`${id} already has an open showcase job; /skip it first.`);
  await env.MEDIA.put(`showcase/${rec.archive}/${id}.mp4`, await getFile(env, file.file_id), {
    httpMetadata: { contentType: "video/mp4", cacheControl: "public, max-age=2592000" },
  });
  const now = new Date();
  const c = await nextCandidate({ ...env, X_FORCE_SHOWCASE: id, X_SHOWCASE_TEXT: text }, now);
  const d = c && (await stage(env, c, now));
  if (!c || !d) return say(`${id}: uploaded, but over budget; try again later.`);
  const j = await queue(env, c, d);
  return j ? undefined : say(`${id} already has an open showcase job.`);
}
