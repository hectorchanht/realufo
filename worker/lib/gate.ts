// worker/lib/gate.ts
import type { Env } from "../env";
import { CDN, nextCandidate, withinBudget, type Candidate } from "./xpick";
import { publishDraft, stage, type Draft } from "./xbot"; // xbot imports gate back: only used inside functions, never at load
import { createJob, move, setMessages, type Job } from "./jobs";
import { sendMedia, sendMessage, TgError } from "./tg";
import { tick as socialTick } from "./social/tick";
import { indexNow } from "./indexnow";

// The Telegram gate (spec 2026-10-04-realufo-telegram-gate-design): nothing is posted
// until the owner taps ✅ on a preview in the private chat.

export { CDN };
const TEXT_MAX = 3500; // Telegram message limit is 4096; leave room for the header/footer
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
  const caption = (job.caption ?? "").length > TEXT_MAX ? `${job.caption!.slice(0, TEXT_MAX)}…` : (job.caption ?? "");
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
export async function approve(env: Env, job: Job, now = new Date()): Promise<string> {
  try {
    let line = "";
    if (job.kind === "post" || job.kind === "showcase") {
      const d: Draft = { ...job.payload.x, text: job.caption ?? job.payload.x.text };
      line = await postDraft(env, d, now);
    } else if (job.kind === "article") {
      const p = job.payload as { sql: string[]; urls: string[]; showcase?: { record: string; text: string } };
      // check the half that can refuse BEFORE writing site rows, so a failed job leaves nothing behind
      if (p.showcase && (await env.DB.prepare("SELECT 1 FROM x_posts WHERE stream='showcase' AND ref=?").bind(p.showcase.record).first()))
        throw new Error(`showcase already posted for ${p.showcase.record}`);
      if (p.sql.length) await env.DB.batch(p.sql.map((s) => env.DB.prepare(s)));
      await indexNow(p.urls);
      line = `site: ${p.urls[0] ?? "rows written"}`;
      if (p.showcase) {
        const c = await nextCandidate({ ...env, X_FORCE_SHOWCASE: p.showcase.record, X_SHOWCASE_TEXT: p.showcase.text }, now);
        const d = c && c.stream === "showcase" ? await stage(env, c, now) : null;
        if (!d) throw new Error("showcase video missing in R2, already posted, or over budget");
        line += ` · ${await postDraft(env, d, now)}`;
      }
    } else if (job.kind === "poll") {
      line = "poll approved: posts on the next tick";
    } else {
      throw new Error(`kind ${job.kind} has no approve step yet`);
    }
    await move(env, job.id, job.version, ["approved"], "posted");
    return `✅ #${job.id} ${line}`;
  } catch (e) {
    const msg = errMsg(e);
    await move(env, job.id, job.version, ["approved"], "failed", msg);
    return `⚠️ #${job.id} failed: ${msg}`;
  }
}

async function postDraft(env: Env, d: Draft, now: Date): Promise<string> {
  if (!(await withinBudget(env, d.cost, now, true))) throw new Error("over the monthly X budget");
  const id = await publishDraft(env, d, now);
  if (id === null) return "already on X";
  // xbot swallows X's refusals (it drops the row on 401/402/403, marks it failed on other 4xx): read the outcome back
  const r = await env.DB.prepare("SELECT status, error FROM x_posts WHERE id=?").bind(id).first<{ status: string; error: string | null }>();
  if (!r || r.status === "failed") throw new Error(r?.error ?? "X rejected the post (auth or credits)");
  await socialTick(env, now).catch(() => {}); // start the fan-out now; the cron finishes slow platforms
  return `X row ${id} (${r.status}) · fan-out started`;
}

// "approved" too: frees a job stranded when the Worker died mid-approve
export const skip = (env: Env, job: Job) => move(env, job.id, job.version, ["post_wait", "brief_wait", "video_wait", "handmade", "prep", "media", "making", "approved"], "skipped");
