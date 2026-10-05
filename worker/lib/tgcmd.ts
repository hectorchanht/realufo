// worker/lib/tgcmd.ts
import type { Env } from "../env";
import { getJob, openJobs, OPEN, setSetting } from "./jobs";
import { queue, skip } from "./gate";
import { stage } from "./xbot";
import { nextCandidate, sqlTime } from "./xpick";
import { tick as socialTick } from "./social/tick";
import { getFile, sendMessage } from "./tg";

// Owner commands in the private chat (spec: "Admin commands"). Every post still waits for ✅.
const DOWNLOAD_MAX = 20 * 1024 * 1024; // Telegram bots can download ≤20 MB

const HELP = [
  "/post <ID> · preview a record post (video clip or image)",
  "send an mp4 with caption \"<ID> text\" · your own video as a showcase post (≤20 MB; bigger: scripts/publish.sh)",
  "/queue · open jobs",
  "/status · today's posts, failures, month spend",
  "/pause · /resume · the bot's own daily picks",
  "/drain · re-run the fan-out for missed platforms",
  "/skip <job> · drop a job",
  "Reply to a preview to replace its text.",
].join("\n");

export async function command(env: Env, m: any) {
  const chat = env.TELEGRAM_OWNER_ID!;
  const say = (t: string) => sendMessage(env, chat, t);
  if (m.video || m.document?.mime_type === "video/mp4") return upload(env, m, say);
  const [cmd, arg = ""] = String(m.text ?? "").trim().split(/\s+/, 2);
  const now = new Date();
  switch (cmd) {
    case "/post": {
      const c = arg && (await nextCandidate({ ...env, X_FORCE_PICK: arg }, now));
      const d = c && (await stage(env, c, now));
      if (!c || !d) return say(`${arg || "?"}: not live, already posted, or over budget.`);
      const j = await queue(env, c, d);
      return j ? undefined : say(`${arg} already has an open job.`);
    }
    case "/queue": {
      const js = await openJobs(env);
      return say(js.length ? js.map((j) => `#${j.id} v${j.version} · ${j.kind} · ${j.stream} · ${j.ref} · ${j.status}`).join("\n") : "No open jobs.");
    }
    case "/status": {
      const day = sqlTime(now);
      const x = await env.DB.prepare("SELECT status, count(*) n FROM x_posts WHERE date(created_at)=date(?) GROUP BY status").bind(day).all<{ status: string; n: number }>();
      const f = await env.DB.prepare("SELECT platform, count(*) n FROM social_posts WHERE status='failed' AND deleted_at IS NULL AND created_at>=datetime(?,'-1 day') GROUP BY platform").bind(day).all<{ platform: string; n: number }>();
      const m$ = await env.DB.prepare("SELECT coalesce(sum(cost_usd),0) usd FROM x_posts WHERE status!='failed' AND strftime('%Y-%m',created_at)=strftime('%Y-%m',?)").bind(day).first<{ usd: number }>();
      return say([
        `Today on X: ${x.results.map((r) => `${r.status} ${r.n}`).join(", ") || "nothing"}`,
        `Failed last 24 h: ${f.results.map((r) => `${r.platform} ${r.n}`).join(", ") || "none"}`,
        `Month spend: $${(m$?.usd ?? 0).toFixed(2)} of $${env.X_MONTHLY_USD_CAP ?? "10"}`,
      ].join("\n"));
    }
    case "/pause": await setSetting(env, "paused_picks", "1"); return say("Bot picks paused.");
    case "/resume": await setSetting(env, "paused_picks", "0"); return say("Bot picks on (each still waits for your ✅).");
    case "/drain": await socialTick(env, now); return say("Fan-out ran once; /status for failures.");
    case "/skip": {
      const n = Number(arg.replace(/^#/, "")); // "#12" as /queue prints it
      if (!Number.isInteger(n) || n <= 0) return say("Usage: /skip <job number>");
      const j = await getJob(env, n);
      return say(j && (await skip(env, j)) ? `#${j.id} skipped.` : `#${n}: not found or already closed.`);
    }
    default: return say(HELP);
  }
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
