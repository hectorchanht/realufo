import type { Env } from "../env";
import type { Media } from "./xpick";

// Job store for the Telegram gate (spec 2026-10-04-realufo-telegram-gate-design).
// A job = a post that is ready but waits for the owner's tap. Rows are never hard-deleted.

export type JobKind = "post" | "poll" | "showcase" | "article" | "video" | "record" | "short";
export type JobStatus = "prep" | "media" | "brief_wait" | "making" | "video_wait" | "post_wait" | "handmade" | "approved" | "posted" | "skipped" | "failed";
export type Job = {
  id: number; kind: JobKind; stream: string; ref: string; status: JobStatus; version: number;
  caption: string | null; media: Media; payload: any; tg_msgs: number[]; error: string | null;
};

export const OPEN: JobStatus[] = ["prep", "media", "brief_wait", "making", "video_wait", "post_wait", "handmade", "approved"];
export const BOT_STREAMS = ["pick", "release", "highlight", "poll"];
const OPEN_SQL = OPEN.map((s) => `'${s}'`).join(",");
const COLS = "id, kind, stream, ref, status, version, caption, media, payload, tg_msgs, error";

// Candidate queries use this to skip anything that already has a job (open, posted or skipped).
// Ignores failed jobs so they can be retried on the next tick.
export const NO_JOB = (refExpr: string) => `NOT EXISTS (SELECT 1 FROM bot_jobs j WHERE j.ref=${refExpr} AND j.deleted_at IS NULL AND j.status != 'failed')`;

type Row = Omit<Job, "media" | "payload" | "tg_msgs"> & { media: string | null; payload: string; tg_msgs: string | null };
// A corrupt JSON cell (seen once: two objects concatenated in media) must never
// take down the webhook — fall back to empty and let the job be handled/closed.
const safeJson = (s: string | null, fallback: any) => {
  try { return s ? JSON.parse(s) : fallback; } catch { return fallback; }
};
const parse = (r: Row | null): Job | null =>
  r && { ...r, media: safeJson(r.media, null), payload: safeJson(r.payload, {}), tg_msgs: safeJson(r.tg_msgs, []) };

export async function createJob(env: Env, j: { kind: JobKind; stream: string; ref: string; status: JobStatus; caption: string | null; media: Media; payload: unknown }): Promise<Job | null> {
  const exclusive = BOT_STREAMS.includes(j.stream) ? 1 : 0;
  const media = j.media ? JSON.stringify(j.media) : null;
  const row = await env.DB.prepare(
    `INSERT INTO bot_jobs(kind, stream, ref, status, caption, media, payload)
     SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7
     WHERE NOT EXISTS (SELECT 1 FROM bot_jobs WHERE deleted_at IS NULL AND status IN (${OPEN_SQL}) AND stream=?2 AND (?8 OR ref=?3))
     RETURNING ${COLS}`
  ).bind(j.kind, j.stream, j.ref, j.status, j.caption, media, JSON.stringify(j.payload), exclusive).first<Row>();
  if (!row) return null;
  await env.DB.prepare("INSERT INTO bot_job_versions(job_id, version, caption, media) VALUES (?, 1, ?, ?)").bind(row.id, j.caption, media).run();
  return parse(row);
}

export const getJob = async (env: Env, id: number) =>
  parse(await env.DB.prepare(`SELECT ${COLS} FROM bot_jobs WHERE id=? AND deleted_at IS NULL`).bind(id).first<Row>());

export const jobByMessage = async (env: Env, messageId: number) =>
  parse(await env.DB.prepare(
    `SELECT ${COLS} FROM bot_jobs b WHERE b.deleted_at IS NULL AND EXISTS (SELECT 1 FROM json_each(coalesce(b.tg_msgs,'[]')) WHERE value=?) ORDER BY id DESC LIMIT 1`
  ).bind(messageId).first<Row>());

export async function move(env: Env, id: number, version: number, from: JobStatus[], to: JobStatus, error?: string): Promise<boolean> {
  const r = await env.DB.prepare(
    `UPDATE bot_jobs SET status=?, error=?, updated_at=datetime('now')
     WHERE id=? AND version=? AND deleted_at IS NULL AND status IN (SELECT value FROM json_each(?))`
  ).bind(to, error ?? null, id, version, JSON.stringify(from)).run();
  if (r.meta.changes !== 1) return false;
  await env.DB.prepare("UPDATE bot_job_versions SET decision=? WHERE job_id=? AND version=?").bind(to, id, version).run();
  return true;
}

export async function revise(env: Env, id: number, version: number, caption: string, note: string): Promise<Job | null> {
  const row = await env.DB.prepare(
    `UPDATE bot_jobs SET version=version+1, caption=?, tg_msgs=NULL, updated_at=datetime('now')
     WHERE id=? AND version=? AND status='post_wait' AND deleted_at IS NULL RETURNING ${COLS}`
  ).bind(caption, id, version).first<Row>();
  if (!row) return null;
  await env.DB.prepare("INSERT INTO bot_job_versions(job_id, version, caption, media, note) VALUES (?, ?, ?, ?, ?)")
    .bind(id, row.version, caption, row.media, note).run();
  return parse(row);
}

export const setMessages = async (env: Env, id: number, msgs: number[]) => {
  await env.DB.prepare("UPDATE bot_jobs SET tg_msgs=? WHERE id=?").bind(JSON.stringify(msgs), id).run();
};

// Portal v2: swap a job's media JSON (e.g. the owner sent a replacement image).
// Call before revise() so the new version row carries the new media.
export const setJobMedia = async (env: Env, id: number, media: { key: string; mime?: string; size?: number } | null): Promise<void> => {
  await env.DB.prepare("UPDATE bot_jobs SET media=?, updated_at=datetime('now') WHERE id=? AND deleted_at IS NULL")
    .bind(media ? JSON.stringify(media) : null, id).run();
};

// Portal v2: merge keys into a job's payload JSON (e.g. an edit intent's field/value).
// Versioned via revise(); the payload patch itself doesn't bump the version.
export const patchPayload = async (env: Env, id: number, patch: Record<string, unknown>): Promise<void> => {
  const row = await env.DB.prepare("SELECT payload FROM bot_jobs WHERE id=? AND deleted_at IS NULL").bind(id).first<{ payload: string }>();
  if (!row) return;
  const merged = { ...JSON.parse(row.payload), ...patch };
  await env.DB.prepare("UPDATE bot_jobs SET payload=?, updated_at=datetime('now') WHERE id=?").bind(JSON.stringify(merged), id).run();
};

export const openJobs = async (env: Env) =>
  (await env.DB.prepare(`SELECT ${COLS} FROM bot_jobs WHERE deleted_at IS NULL AND status IN (${OPEN_SQL}) ORDER BY id`).all<Row>()).results.map((r) => parse(r)!);

// Portal v2: per-stream human pause. "1" = paused (queueContent refuses new jobs); existing
// pending jobs are untouched. Key: paused_<stream>; "all" fans out in the callers.
export const streamPaused = async (env: Env, stream: string): Promise<boolean> =>
  (await getSetting(env, `paused_${stream}`)) === "1";

export const setStreamPaused = async (env: Env, stream: string, paused: boolean): Promise<void> => {
  await setSetting(env, `paused_${stream}`, paused ? "1" : "0");
};

// Pending-job counts per stream for /status.
export const pendingByStream = async (env: Env): Promise<{ stream: string; n: number }[]> =>
  (await env.DB.prepare(
    `SELECT stream, count(*) n FROM bot_jobs WHERE deleted_at IS NULL AND status IN (${OPEN_SQL}) GROUP BY stream ORDER BY stream`
  ).all<{ stream: string; n: number }>()).results;

export const getSetting = async (env: Env, key: string) =>
  (await env.DB.prepare("SELECT value FROM bot_settings WHERE key=?").bind(key).first<{ value: string }>())?.value ?? null;

export const setSetting = async (env: Env, key: string, value: string) => {
  await env.DB.prepare("INSERT INTO bot_settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(key, value).run();
};
