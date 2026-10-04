// worker/lib/gate.ts
import type { Env } from "../env";
import { CDN, type Candidate } from "./xpick";
import type { Draft } from "./xbot";
import { createJob, move, setMessages, type Job } from "./jobs";
import { sendMedia, sendMessage, TgError } from "./tg";

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
