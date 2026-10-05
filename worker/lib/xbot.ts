import type { Env } from "../env";
import { createPost, uploadMedia, mediaStatus, XError, THREAD_SEP, type XSecrets, type Source } from "./x";
import { nextCandidate, withinBudget, costOf, isManual, sqlTime, type Candidate, type Media } from "./xpick";
import { draft, isClean } from "./xcopy";
import { gateOn, queue } from "./gate";

// One cron tick (Spec 4 §3, §6). Row goes in BEFORE X is called: UNIQUE(stream, ref)
// makes a second attempt at the same candidate a no-op.

type Row = { id: number; text: string; media_id: string | null; attempts: number; created_at: string };
const MAX_ATTEMPTS = 3;
const log = (o: Record<string, unknown>) => console.log(JSON.stringify({ xbot: true, ...o }));

export const secretsOf = (env: Env): XSecrets | null =>
  env.X_API_KEY && env.X_API_SECRET && env.X_ACCESS_TOKEN && env.X_ACCESS_SECRET
    ? { X_API_KEY: env.X_API_KEY, X_API_SECRET: env.X_API_SECRET, X_ACCESS_TOKEN: env.X_ACCESS_TOKEN, X_ACCESS_SECRET: env.X_ACCESS_SECRET }
    : null;

const r2Source = (env: Env, key: string, size: number): Source => ({
  size,
  read: async (offset, length) => (await env.MEDIA.get(key, { range: { offset, length } }))!.arrayBuffer(),
});

async function post(env: Env, s: XSecrets, row: Row, mediaIds: string[]) {
  let tweet: string;
  const [first, ...replies] = row.text.split(THREAD_SEP);
  try {
    tweet = await createPost(s, first, mediaIds);
  } catch (e) {
    if (!(e instanceof XError)) {
      // network error after send: X may have created it → manual check, never auto-retried
      await env.DB.prepare("UPDATE x_posts SET status='pending', attempts=0, error=? WHERE id=?").bind(String(e).slice(0, 500), row.id).run();
      return log({ ambiguous: row.id, error: String(e).slice(0, 200) });
    }
    if (e.status === 401 || e.status === 402 || (e.status === 403 && !/duplicate/i.test(e.body))) {
      // auth revoked / out of credits: nothing was posted; drop the row so the
      // candidate (a release announcement, a clip) isn't burned while we're down
      await env.DB.prepare("DELETE FROM x_posts WHERE id=?").bind(row.id).run();
      return log({ halted: row.id, status: e.status, body: e.body.slice(0, 200) });
    }
    const attempts = row.attempts + 1;
    const final = !(e.status === 429 || e.status >= 500) || attempts >= MAX_ATTEMPTS;
    await env.DB.prepare("UPDATE x_posts SET status=?, attempts=?, error=? WHERE id=?")
      .bind(final ? "failed" : "pending", attempts, String(e).slice(0, 500), row.id).run();
    return log({ error: row.id, status: e.status, final });
  }
  log({ posted: row.id, tweet }); // logged before the D1 write so a failed write is recoverable
  try {
    await env.DB.prepare("UPDATE x_posts SET status='posted', tweet_id=?, error=NULL WHERE id=?").bind(tweet, row.id).run();
  } catch (e) {
    log({ postedUnrecorded: row.id, tweet, error: String(e).slice(0, 200) }); // stays pending/attempts=0: never re-posted
  }
  // Thread replies: best effort, never retried (the head is what the row tracks).
  // ponytail: a failed reply stops the chain; finish it by hand from the logged ids.
  for (let i = 0, prev = tweet; i < replies.length; i++) {
    try {
      prev = await createPost(s, replies[i], [], prev);
      log({ reply: row.id, n: i + 1, tweet: prev });
    } catch (e) {
      return log({ replyFailed: row.id, n: i + 1, after: prev, error: String(e).slice(0, 200) });
    }
  }
}

async function resume(env: Env, s: XSecrets, now: Date) {
  const { results } = await env.DB.prepare(
    "SELECT id, text, media_id, attempts, created_at, status FROM x_posts WHERE status='processing' OR (status='pending' AND attempts>0)"
  ).all<Row & { status: string }>();
  const hourAgo = sqlTime(new Date(now.getTime() - 3600_000));
  for (const row of results) {
    if (row.status === "pending") {
      await post(env, s, row, row.media_id ? [row.media_id] : []);
      continue;
    }
    const st = await mediaStatus(s, row.media_id!).catch(() => "failed" as const);
    if (st === "pending" && row.created_at > hourAgo) continue; // still encoding; check next tick
    await env.DB.prepare("UPDATE x_posts SET status='pending' WHERE id=?").bind(row.id).run();
    await post(env, s, row, st === "succeeded" ? [row.media_id!] : []);
  }
}

async function upload(env: Env, s: XSecrets, rowId: number, media: Media, sleep?: (ms: number) => Promise<void>, maxWaitMs?: number) {
  if (!media) return { ids: [] as string[], processing: false };
  try {
    const up = await uploadMedia(s, r2Source(env, media.key, media.size), media.mime, { sleep, maxWaitMs });
    await env.DB.prepare("UPDATE x_posts SET media_id=? WHERE id=?").bind(up.mediaId, rowId).run();
    return { ids: up.ready ? [up.mediaId] : [], processing: !up.ready };
  } catch (e) {
    log({ mediaFailed: rowId, error: String(e).slice(0, 200) }); // post goes out without media
    return { ids: [], processing: false };
  }
}

// A post ready to write to x_posts (the gate keeps it in bot_jobs.payload.x until the owner taps ✅).
export type Draft = { stream: Candidate["stream"]; ref: string; text: string; ai: boolean; media: Media; cost: number };

// Safety + budget + copy for a candidate. null = don't post it (logged).
export async function stage(env: Env, c: Candidate, now: Date): Promise<Draft | null> {
  if (c.stream === "highlight" && !isClean(c.thread.title)) {
    // never put a "proof of aliens" thread title on the official account; failed row = don't pick again
    await env.DB.prepare("INSERT INTO x_posts(stream,ref,text,ai,cost_usd,status,error,created_at) VALUES ('highlight',?,?,0,0,'failed','unsafe title',?) ON CONFLICT DO NOTHING")
      .bind(c.ref, c.thread.title, sqlTime(now)).run();
    log({ unsafe: c.ref });
    return null;
  }
  const cost = costOf(c);
  if (!(await withinBudget(env, cost, now, isManual(c)))) {
    log({ budget: c.stream, ref: c.ref });
    return null;
  }
  const { text, ai } = await draft(env, c);
  return { stream: c.stream, ref: c.ref, text, ai, media: c.media, cost };
}

// Write the x_posts row and post it (the pre-gate path, unchanged). Returns the row id (null = duplicate).
// maxWaitMs caps the wait for X's media processing (default uploadMedia's); past it the row stays 'processing' for resume().
export async function publishDraft(env: Env, d: Draft, now = new Date(), sleep?: (ms: number) => Promise<void>, maxWaitMs?: number): Promise<number | null> {
  const mode = env.FEATURE_X ?? "off";
  if (mode !== "dry" && mode !== "on") throw new Error("FEATURE_X is off");
  const s = secretsOf(env);
  if (mode === "on" && !s) throw new Error("missing X secrets");
  const media = d.media ? `${d.media.mime.startsWith("video/") ? "clip" : "thumb"}:${d.media.key}` : null;
  const ins = await env.DB.prepare(
    `INSERT INTO x_posts(stream,ref,text,ai,media,cost_usd,status,created_at) VALUES (?,?,?,?,?,?,?,?)
     ON CONFLICT(stream, ref) DO NOTHING RETURNING id`
  ).bind(d.stream, d.ref, d.text, d.ai ? 1 : 0, media, d.cost, mode === "dry" ? "draft" : "pending", sqlTime(now)).first<{ id: number }>();
  if (!ins) { log({ duplicate: d.stream, ref: d.ref }); return null; }
  log({ stream: d.stream, ref: d.ref, mode, ai: d.ai, media, cost: d.cost });
  if (mode === "dry" || !s) return ins.id;
  const up = await upload(env, s, ins.id, d.media, sleep, maxWaitMs);
  if (up.processing) {
    await env.DB.prepare("UPDATE x_posts SET status='processing' WHERE id=?").bind(ins.id).run();
    return ins.id;
  }
  await post(env, s, { id: ins.id, text: d.text, media_id: null, attempts: 0, created_at: sqlTime(now) }, up.ids);
  return ins.id;
}

export async function tick(env: Env, now = new Date(), sleep?: (ms: number) => Promise<void>) {
  const mode = env.FEATURE_X ?? "off";
  if (mode !== "dry" && mode !== "on") return;
  const s = secretsOf(env);
  if (mode === "on" && !s) return log({ skipped: "missing X secrets" });
  if (s && mode === "on") await resume(env, s, now);

  const c = await nextCandidate(env, now);
  if (!c) return log({ idle: true });
  const d = await stage(env, c, now);
  if (!d) return;
  if (gateOn(env)) {
    const j = await queue(env, c, d);
    return log(j ? { queued: j.id, stream: j.stream, ref: j.ref } : { waiting: c.stream, ref: c.ref });
  }
  await publishDraft(env, d, now, sleep);
}
