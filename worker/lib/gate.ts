// worker/lib/gate.ts
import type { Env } from "../env";
import { ARCHIVE_NAME, CDN, SITE, nextCandidate, sqlTime, withinBudget, thumbFor, evidenceText, type Candidate, type Media } from "./xpick";
import { publishDraft, stage, type Draft } from "./xbot"; // xbot imports gate back: only used inside functions, never at load
import { createJob, move, setMessages, streamPaused, type Job, type JobKind } from "./jobs";
import { sendMedia, sendMessage, TgError, type Keyboard } from "./tg";
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
  const extras = await previewExtras(env, c, d.media);
  const job = await createJob(env, {
    kind: c.stream === "showcase" ? "showcase" : "post", stream: jobStream(c), ref: c.ref,
    status: "post_wait", caption: d.text, media: d.media,
    payload: { x: d, preview_extra: extras.media, evidence: extras.evidence, meta: extras.meta },
  });
  if (job) await preview(env, job);
  return job;
}

const fmtDur = (s: number) => {
  s = Math.round(s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}` : `${m}:${String(ss).padStart(2, "0")}`;
};

// What the gate preview shows beyond the post media: for a video record, the
// money-shot still (the AI-picked thumb) plus the key moments as evidence text.
// Every single-record job also gets a metadata line (archive · date · place).
// Stored on the job payload so re-previews (edits) show the same set.
async function previewExtras(env: Env, c: Candidate, primary: Media): Promise<{
  media: { key: string; mime: string; size: number }[]; evidence: string | null; meta: string | null;
}> {
  const rec = "record" in c ? c.record : null;
  if (!rec) return { media: [], evidence: null, meta: null };
  const meta = [
    ARCHIVE_NAME[rec.archive] ?? rec.archive,
    rec.incident_date,
    rec.location,
    rec.duration ? fmtDur(rec.duration) : null,
  ].filter(Boolean).join(" · ") || null;
  if (!primary?.mime.startsWith("video/")) return { media: [], evidence: null, meta };
  const media: { key: string; mime: string; size: number }[] = [];
  // money-shot still: the AI-picked representative frame (thumb). The primary is the
  // clip here, so this is always a different image when it exists.
  const thumb = await thumbFor(env, rec);
  if (thumb && thumb.key !== primary.key) media.push(thumb);
  return { media, evidence: evidenceText(rec.ai_moments), meta };
}

// Portal v2: the universal content gate. EVERY content addition (record, short, article,
// social, poll) goes through here; nothing goes live without the owner's tap.
// Returns null when the stream is human-paused (caller stays quiet — the owner paused it).
export async function queueContent(env: Env, j: {
  kind: JobKind; stream: string; ref: string; caption: string | null;
  media?: { key: string; mime?: string; size?: number } | null; payload?: unknown;
}): Promise<Job | null> {
  if (await streamPaused(env, j.stream)) return null;
  const job = await createJob(env, {
    kind: j.kind, stream: j.stream, ref: j.ref, status: "post_wait",
    caption: j.caption, media: j.media ?? null, payload: j.payload ?? {},
  });
  if (job) await preview(env, job);
  return job;
}

// Sends a job's media (primary + money-shot extra) as tagged messages. Used by
// preview() and by the "show me the video" intent — a bare video/photo arriving
// before (or after) the text is otherwise impossible to match to its preview.
export async function sendJobMedia(env: Env, job: Job): Promise<{ msgs: number[]; note: string }> {
  const chat = env.TELEGRAM_OWNER_ID!;
  const msgs: number[] = [];
  let note = "";
  const tag = `#${job.id} · ${job.ref}`;
  const sendOne = async (key: string, caption?: string) => {
    try {
      msgs.push(await sendMedia(env, chat, key, caption));
    } catch (e) {
      // too big / missing / any send error: the text + buttons still go out, with the CDN link
      note += `\n⚠️ media not attached (${e instanceof TgError ? e.status : errMsg(e)}): ${CDN}${key}`;
    }
  };
  if (job.media) await sendOne(job.media.key, tag);
  for (const m of (job.payload?.preview_extra as { key: string }[] | undefined) ?? []) await sendOne(m.key, `${tag} · money shot`);
  return { msgs, note };
}

export async function preview(env: Env, job: Job): Promise<void> {
  const chat = env.TELEGRAM_OWNER_ID!;
  const { msgs, note } = await sendJobMedia(env, job);
  const chars = Array.from(job.caption ?? ""); // code points: never cut an emoji in half
  const caption = chars.length > TEXT_MAX ? `${chars.slice(0, TEXT_MAX).join("")}…` : chars.join("");
  const evidence = typeof job.payload?.evidence === "string" && job.payload.evidence ? `\n\n🔍 Key moments\n${job.payload.evidence}` : "";
  const meta = typeof job.payload?.meta === "string" && job.payload.meta ? `\n${job.payload.meta}` : "";
  const goLabel = job.kind === "record" ? "✅ Publish" : job.kind === "short" ? "✅ Post short" : "✅ Post";
  // Single-record jobs link straight to the doc page.
  const docUrl = (job.kind === "post" || job.kind === "showcase") && ["pick", "manual", "showcase"].includes(job.stream)
    ? `${SITE}/doc/${encodeURIComponent(job.ref)}` : null;
  const kb: Keyboard = [
    [
      { text: goLabel, callback_data: `ok:${job.id}:${job.version}` },
      { text: "❌ Skip", callback_data: `skip:${job.id}:${job.version}` },
    ],
    ...(docUrl ? [[{ text: "📄 Open doc", url: docUrl }]] : []),
  ];
  const text = `#${job.id} v${job.version} · ${job.kind} · ${job.stream} · ${job.ref}${note}${meta}\n\n${caption}${evidence}\n\n→ ${targets(env)}\nReply: ok / 唔要 / title 改做 X / pause ${job.stream} / status`;
  const tChars = Array.from(text); // caption + evidence can jointly pass the Bot API's 4096
  const finalText = tChars.length > 4000 ? `${tChars.slice(0, 4000).join("")}…` : text;
  try {
    msgs.push(await sendMessage(env, chat, finalText, kb));
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
    } else if (job.kind === "record") {
      // Portal v2: a staged record goes live. Payload carries the publish SQL
      // (e.g. UPDATE records SET status='live' WHERE id=? plus index rows).
      const p = job.payload as { sql?: string[] };
      if (p.sql?.length) await env.DB.batch(p.sql.map((s) => env.DB.prepare(s)));
      siteRows = true;
      line = `record ${job.ref} is live`;
    } else if (job.kind === "short") {
      // Portal v2: the curated short was rendered to the staging prefix by the ingest
      // clips step (invisible to the /shorts listing); approval promotes the R2 object
      // to the live clips-v/ prefix — the object's existence is the publish flag.
      const p = job.payload as { sql?: string[]; note?: string; r2move?: { from: string; to: string } };
      if (p.r2move) {
        if (!p.r2move.from.startsWith("clips-staging/") || !p.r2move.to.startsWith("clips-v/"))
          throw new Error("r2move must be clips-staging/ -> clips-v/");
        const obj = await env.MEDIA.get(p.r2move.from);
        if (!obj) throw new Error(`staged short missing: ${p.r2move.from}`);
        await env.MEDIA.put(p.r2move.to, obj.body, { httpMetadata: { contentType: "video/mp4" } });
        await env.MEDIA.delete(p.r2move.from);
      }
      if (p.sql?.length) await env.DB.batch(p.sql.map((s) => env.DB.prepare(s)));
      line = `short ${job.ref} posted${p.note ? ` (${p.note})` : ""}`;
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
