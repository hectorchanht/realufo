// worker/lib/gate.ts
import type { Env } from "../env";
import { CDN, nextCandidate, sqlTime, withinBudget, type Candidate } from "./xpick";
import { publishDraft, stage, type Draft } from "./xbot"; // xbot imports gate back: only used inside functions, never at load
import { createJob, move, setMessages, type Job } from "./jobs";
import { sendMedia, sendMessage, TgError } from "./tg";
import { indexNow } from "./indexnow";

// The Telegram gate (spec 2026-10-04-realufo-telegram-gate-design): nothing is posted
// until the owner taps ✅ on a preview in the private chat.

export { CDN };
const TEXT_MAX = 3500; // Telegram message limit is 4096; leave room for the header/footer
// ✅ runs inside the webhook request: wait only this long for X's video processing, then leave
// the row 'processing' for the cron (xbot resume) to finish. The cron path keeps uploadMedia's 120 s.
const APPROVE_MEDIA_WAIT_MS = 10_000;
const log = (o: Record<string, unknown>) => console.log(JSON.stringify({ gate: true, ...o }));
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
export const gateOn = (env: Env) => env.FEATURE_GATE === "on";

const PLATFORM_FLAGS: [string, keyof Env][] = [
  ["Facebook", "FEATURE_SOCIAL_FB"], ["Instagram", "FEATURE_SOCIAL_IG"], ["Threads", "FEATURE_SOCIAL_THREADS"],
  ["Bluesky", "FEATURE_SOCIAL_BSKY"], ["YouTube", "FEATURE_SOCIAL_YT"], ["TikTok", "FEATURE_SOCIAL_TIKTOK"], ["Telegram", "FEATURE_SOCIAL_TG"],
];
export const targets = (env: Env) => ["X", ...PLATFORM_FLAGS.filter(([, f]) => env[f] === "on").map(([n]) => n)].join(", ");

// Operator posts (forced pick, showcase) get their own stream so a waiting bot pick never blocks them.
const jobStream = (c: Candidate) => (c.stream === "showcase" ? "showcase" : c.stream === "pick" && c.manual ? "manual" : c.stream);

export async function queue(env: Env, c: Candidate, d: Draft): Promise<Job | null> {
  const job = await createJob(env, {
    kind: c.stream === "showcase" ? "showcase" : "post", stream: jobStream(c), ref: c.ref,
    status: "post_wait", caption: d.text, media: d.media, payload: { x: d },
  });
  if (job) await preview(env, job);
  return job;
}

export async function preview(env: Env, job: Job): Promise<void> {
  const chat = env.TELEGRAM_OWNER_ID!;
  const msgs: number[] = [];
  let note = "";
  if (job.media) {
    try {
      msgs.push(await sendMedia(env, chat, job.media.key));
    } catch (e) {
      // too big / missing / any send error: the text + buttons still go out, with the CDN link
      note = `\n⚠️ media not attached (${e instanceof TgError ? e.status : errMsg(e)}): ${CDN}${job.media.key}`;
    }
  }
  const chars = Array.from(job.caption ?? ""); // code points: never cut an emoji in half
  const caption = chars.length > TEXT_MAX ? `${chars.slice(0, TEXT_MAX).join("")}…` : chars.join("");
  // only post/showcase run the caption; other kinds (article, poll) run their payload, so an edit would do nothing
  const edit = job.kind === "post" || job.kind === "showcase" ? "\nReply to this message to replace the text." : "";
  const text = `#${job.id} v${job.version} · ${job.kind} · ${job.stream} · ${job.ref}${note}\n\n${caption}\n\n→ ${targets(env)}${edit}`;
  try {
    msgs.push(await sendMessage(env, chat, text, [[
      { text: "✅ Post", callback_data: `ok:${job.id}:${job.version}` },
      { text: "❌ Skip", callback_data: `skip:${job.id}:${job.version}` },
    ]]));
  } catch (e) {
    // no buttons reached the owner: close the job (failed jobs can be offered again) instead of leaving it open and invisible
    const reason = `preview not delivered: ${errMsg(e)}`;
    await move(env, job.id, job.version, ["post_wait"], "failed", reason);
    return log({ previewFailed: job.id, error: reason.slice(0, 300) });
  }
  await setMessages(env, job.id, msgs);
}

// Runs an approved job: the same writes the pre-gate paths made. Caller has already moved it
// post_wait → approved (exactly once). Ends posted or failed; returns a line for the owner.
// Nothing slow after the final move: the social fan-out runs on the cron, never in the webhook.
export async function approve(env: Env, job: Job, now = new Date()): Promise<string> {
  let line = "";
  let fanOut = false;
  let siteRows = false;
  try {
    if (job.kind === "post" || job.kind === "showcase") {
      const d: Draft = { ...job.payload.x, text: job.caption ?? job.payload.x.text };
      line = await postDraft(env, d, now);
      fanOut = true;
    } else if (job.kind === "article") {
      const p = job.payload as { sql: string[]; urls: string[]; showcase?: { record: string; text: string } };
      // the checks that can refuse come BEFORE the site rows; the showcase post itself can still fail after them
      let sc: Draft | null = null;
      if (p.showcase) {
        if (await env.DB.prepare("SELECT 1 FROM x_posts WHERE stream='showcase' AND ref=?").bind(p.showcase.record).first())
          throw new Error(`showcase already posted for ${p.showcase.record}`);
        const c = await nextCandidate({ ...env, X_FORCE_SHOWCASE: p.showcase.record, X_SHOWCASE_TEXT: p.showcase.text }, now);
        sc = c && c.stream === "showcase" ? await stage(env, c, now) : null;
        if (!sc) throw new Error("showcase video missing in R2 or over budget");
      }
      if (p.sql.length) await env.DB.batch(p.sql.map((s) => env.DB.prepare(s)));
      siteRows = true;
      await indexNow(p.urls);
      line = `site: ${p.urls[0] ?? "rows written"}`;
      if (sc) {
        line += ` · ${await postDraft(env, sc, now)}`;
        fanOut = true;
      }
    } else if (job.kind === "poll") {
      line = "poll approved: posts on the next tick";
    } else {
      throw new Error(`kind ${job.kind} has no approve step yet`);
    }
  } catch (e) {
    const msg = errMsg(e);
    const after = siteRows ? " after the site rows were written" : "";
    await move(env, job.id, job.version, ["approved"], "failed", siteRows ? `site rows written; ${msg}` : msg);
    return `⚠️ #${job.id} failed${after}: ${msg}`;
  }
  const ok = await move(env, job.id, job.version, ["approved"], "posted");
  return ok
    ? `✅ #${job.id} ${line}${fanOut ? " · fan-out on the next cron tick" : ""}`
    : `⚠️ #${job.id} went out (${line}) but the job changed meanwhile; check its status`;
}

async function postDraft(env: Env, d: Draft, now: Date): Promise<string> {
  if (!(await withinBudget(env, d.cost, now, true))) throw new Error("over the monthly X budget");
  const id = await publishDraft(env, d, now, undefined, APPROVE_MEDIA_WAIT_MS);
  // xbot swallows X's refusals (it drops the row on 401/402/403, marks it failed on other 4xx): read the outcome back.
  // By (stream, ref) so a duplicate (id === null) goes through the same check as a fresh row.
  const r = await env.DB.prepare("SELECT id, status, error FROM x_posts WHERE stream=? AND ref=?").bind(d.stream, d.ref).first<{ id: number; status: string; error: string | null }>();
  if (!r || r.status === "failed") throw new Error(r?.error ?? "X rejected the post (auth or credits)");
  return `${id === null ? "already on X" : "X row"} ${r.id} (${r.status})`;
}

// Cron safety net for work cut off mid-request (Workers may cancel it, the isolate may die), after 15 minutes:
// - still "approved": approve was interrupted → failed, the owner is told to check X;
// - "post_wait" with no preview messages: the preview never got its buttons (bot streams are exclusive, so the
//   stream would stop silently) → failed; NO_JOB offers failed jobs again. revise() bumps updated_at.
export async function sweepStuck(env: Env, now = new Date()): Promise<void> {
  if (!gateOn(env)) return;
  const { results } = await env.DB.prepare(
    `SELECT id, version, status, stream, ref FROM bot_jobs WHERE deleted_at IS NULL AND updated_at < ?
     AND (status='approved' OR (status='post_wait' AND coalesce(tg_msgs,'[]')='[]')) ORDER BY id`
  ).bind(sqlTime(new Date(now.getTime() - 15 * 60_000))).all<{ id: number; version: number; status: "approved" | "post_wait"; stream: string; ref: string }>();
  for (const j of results) {
    const approved = j.status === "approved";
    if (!(await move(env, j.id, j.version, [j.status], "failed", approved ? "approve interrupted; check the X row" : "preview interrupted"))) continue;
    const text = approved
      ? `⚠️ #${j.id} approve was interrupted; check X before re-posting`
      : `⚠️ #${j.id} ${j.stream} · ${j.ref}: the preview was cut off, job closed (bot picks come back on their own; re-send operator posts)`;
    await sendMessage(env, env.TELEGRAM_OWNER_ID!, text).catch(() => {});
  }
}

export const skip = (env: Env, job: Job) => move(env, job.id, job.version, ["post_wait", "brief_wait", "video_wait", "handmade", "prep", "media", "making"], "skipped");
