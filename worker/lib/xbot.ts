import type { Env } from "../env";
import { createPost, uploadMedia, mediaStatus, XError, type XSecrets, type Source } from "./x";
import { nextCandidate, withinBudget, costOf, sqlTime, type Media } from "./xpick";
import { draft, isClean } from "./xcopy";

// One cron tick (Spec 4 §3, §6). Row goes in BEFORE X is called: UNIQUE(stream, ref)
// makes a second attempt at the same candidate a no-op.

type Row = { id: number; text: string; media_id: string | null; attempts: number; created_at: string };
const MAX_ATTEMPTS = 3;
const log = (o: Record<string, unknown>) => console.log(JSON.stringify({ xbot: true, ...o }));

const secretsOf = (env: Env): XSecrets | null =>
  env.X_API_KEY && env.X_API_SECRET && env.X_ACCESS_TOKEN && env.X_ACCESS_SECRET
    ? { X_API_KEY: env.X_API_KEY, X_API_SECRET: env.X_API_SECRET, X_ACCESS_TOKEN: env.X_ACCESS_TOKEN, X_ACCESS_SECRET: env.X_ACCESS_SECRET }
    : null;

const r2Source = (env: Env, key: string, size: number): Source => ({
  size,
  read: async (offset, length) => (await env.MEDIA.get(key, { range: { offset, length } }))!.arrayBuffer(),
});

async function post(env: Env, s: XSecrets, row: Row, mediaIds: string[]) {
  let tweet: string;
  try {
    tweet = await createPost(s, row.text, mediaIds);
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

async function upload(env: Env, s: XSecrets, rowId: number, media: Media, sleep?: (ms: number) => Promise<void>) {
  if (!media) return { ids: [] as string[], processing: false };
  try {
    const up = await uploadMedia(s, r2Source(env, media.key, media.size), media.mime, { sleep });
    await env.DB.prepare("UPDATE x_posts SET media_id=? WHERE id=?").bind(up.mediaId, rowId).run();
    return { ids: up.ready ? [up.mediaId] : [], processing: !up.ready };
  } catch (e) {
    log({ mediaFailed: rowId, error: String(e).slice(0, 200) }); // post goes out without media
    return { ids: [], processing: false };
  }
}

export async function tick(env: Env, now = new Date(), sleep?: (ms: number) => Promise<void>) {
  const mode = env.FEATURE_X ?? "off";
  if (mode !== "dry" && mode !== "on") return;
  const s = secretsOf(env);
  if (mode === "on" && !s) return log({ skipped: "missing X secrets" });
  if (s && mode === "on") await resume(env, s, now);

  const c = await nextCandidate(env, now);
  if (!c) return log({ idle: true });
  if (c.stream === "highlight" && !isClean(c.thread.title)) {
    // never put a "proof of aliens" thread title on the official account; failed row = don't pick again
    await env.DB.prepare("INSERT INTO x_posts(stream,ref,text,ai,cost_usd,status,error,created_at) VALUES ('highlight',?,?,0,0,'failed','unsafe title',?) ON CONFLICT DO NOTHING")
      .bind(c.ref, c.thread.title, sqlTime(now)).run();
    return log({ unsafe: c.ref });
  }
  const cost = costOf(c);
  if (!(await withinBudget(env, cost, now))) return log({ budget: c.stream, ref: c.ref });

  const { text, ai } = await draft(env, c);
  const media = c.media ? `${c.media.mime.startsWith("video/") ? "clip" : "thumb"}:${c.media.key}` : null;
  const ins = await env.DB.prepare(
    `INSERT INTO x_posts(stream,ref,text,ai,media,cost_usd,status,created_at) VALUES (?,?,?,?,?,?,?,?)
     ON CONFLICT(stream, ref) DO NOTHING RETURNING id`
  ).bind(c.stream, c.ref, text, ai ? 1 : 0, media, cost, mode === "dry" ? "draft" : "pending", sqlTime(now)).first<{ id: number }>();
  if (!ins) return log({ duplicate: c.stream, ref: c.ref });
  log({ stream: c.stream, ref: c.ref, mode, ai, media, cost });
  if (mode === "dry" || !s) return;

  const up = await upload(env, s, ins.id, c.media, sleep);
  if (up.processing) {
    await env.DB.prepare("UPDATE x_posts SET status='processing' WHERE id=?").bind(ins.id).run();
    return;
  }
  await post(env, s, { id: ins.id, text, media_id: null, attempts: 0, created_at: sqlTime(now) }, up.ids);
}
