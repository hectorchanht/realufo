// worker/lib/contentTick.ts
// Production producers for the Telegram Admin Portal v2 (the universal content gate).
//
// The ingest crawler no longer publishes directly:
// - new records are inserted with status='pending' (crawler/ingest/d1.py);
// - vertical Shorts twins are rendered to clips-staging/ (crawler/ingest/clips.py),
//   invisible to the /shorts listing (it reads clips-v/ straight from R2).
// This tick (runs on the worker cron) offers each one to the owner through
// queueContent(); nothing goes live without the owner's tap in Telegram.
//
// Content strategy: ONE curated Short per day — at most one open short job at a
// time and at most one posted per 24 h. No batch auto-posting.
import type { Env } from "../env";
import { gateOn, queueContent } from "./gate";
import { OPEN } from "./jobs";

const OPEN_SQL = OPEN.map((s) => `'${s}'`).join(",");

const STAGE_PREFIX = "clips-staging/";
const LIVE_PREFIX = "clips-v/";
const log = (o: Record<string, unknown>) => console.log(JSON.stringify({ contentTick: true, ...o }));
const errLine = (e: unknown) => String(e).slice(0, 300);
const escId = (id: string) => id.replace(/'/g, "''");

// Every pending record with no undecided job becomes a Telegram preview.
// Approval runs the payload SQL: pending -> live.
export async function queueStagedRecords(env: Env): Promise<number> {
  const rows = (await env.DB.prepare(
    `SELECT id, archive, kind, title, substr(summary, 1, 500) summary, doc_date FROM records
     WHERE status='pending'
       AND NOT EXISTS (SELECT 1 FROM bot_jobs j WHERE j.ref=records.id AND j.deleted_at IS NULL AND j.status != 'failed')
     ORDER BY id LIMIT 20`
  ).all<{ id: string; archive: string; kind: string; title: string | null; summary: string | null; doc_date: string | null }>()).results;
  let n = 0;
  for (const r of rows) {
    const caption = `${r.title || r.id}\n${r.archive} · ${r.kind}${r.doc_date ? ` · ${r.doc_date}` : ""}${r.summary ? `\n\n${r.summary}` : ""}`;
    const job = await queueContent(env, {
      kind: "record", stream: "record", ref: r.id, caption,
      payload: { sql: [`UPDATE records SET status='live' WHERE id='${escId(r.id)}'`] },
    });
    if (job) { n++; log({ queued: "record", ref: r.id, job: job.id }); }
  }
  return n;
}

async function listStaged(env: Env): Promise<{ key: string; uploaded: Date }[]> {
  const out: { key: string; uploaded: Date }[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.MEDIA.list({ prefix: STAGE_PREFIX, cursor });
    for (const o of page.objects) if (o.key.endsWith(".mp4")) out.push({ key: o.key, uploaded: o.uploaded });
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return out.sort((a, b) => a.uploaded.getTime() - b.uploaded.getTime()); // FIFO: oldest staged first
}

// One curated Short per day: the oldest staged twin with no undecided short job.
// The preview carries the actual clip (sendVideo), so the owner curates by watching.
export async function queueStagedShort(env: Env): Promise<number> {
  const open = await env.DB.prepare(
    `SELECT 1 FROM bot_jobs WHERE stream='short' AND deleted_at IS NULL AND status IN (${OPEN_SQL}) LIMIT 1`
  ).first();
  if (open) return 0; // one at a time in the gate
  const recent = await env.DB.prepare(
    `SELECT 1 FROM bot_jobs WHERE stream='short' AND status='posted' AND updated_at > datetime('now','-1 day') LIMIT 1`
  ).first();
  if (recent) return 0; // at most one posted per 24 h
  for (const o of await listStaged(env)) {
    const id = o.key.slice(STAGE_PREFIX.length).split("/").pop()!.replace(/\.mp4$/, "");
    const rec = await env.DB.prepare("SELECT id, archive, title, status FROM records WHERE id=?").bind(id)
      .first<{ id: string; archive: string; title: string | null; status: string }>();
    const to = rec ? `${LIVE_PREFIX}${rec.archive}/${rec.id}.mp4` : null;
    if (!rec || rec.status !== "live" || await env.MEDIA.head(to!)) {
      await env.MEDIA.delete(o.key); // orphan, or already promoted: drop the staging copy
      continue;
    }
    const offered = await env.DB.prepare(
      `SELECT 1 FROM bot_jobs WHERE stream='short' AND ref=? AND deleted_at IS NULL AND status != 'failed' LIMIT 1`
    ).bind(id).first();
    if (offered) continue;
    const job = await queueContent(env, {
      kind: "short", stream: "short", ref: rec.id,
      caption: `🎬 ${rec.title || rec.id}\n${rec.archive}/${rec.id}`,
      media: { key: o.key, mime: "video/mp4" },
      payload: { r2move: { from: o.key, to } },
    });
    if (job) log({ queued: "short", ref: rec.id, job: job.id });
    return job ? 1 : 0; // paused or raced: stay quiet, retry next tick
  }
  return 0;
}

// A skipped short never gets promoted: drop its staging file so clips-staging/
// doesn't fill with orphans (re-render with clips.py --force --only ID if wanted back).
async function dropSkippedStaging(env: Env): Promise<void> {
  const rows = (await env.DB.prepare(
    `SELECT payload FROM bot_jobs WHERE stream='short' AND status='skipped' AND deleted_at IS NULL
     AND updated_at > datetime('now','-7 days') LIMIT 50`
  ).all<{ payload: string }>()).results;
  for (const r of rows) {
    let from: unknown;
    try { from = (JSON.parse(r.payload) as any)?.r2move?.from; } catch { continue; }
    if (typeof from === "string" && from.startsWith(STAGE_PREFIX)) await env.MEDIA.delete(from);
  }
}

// Gate off = the pre-portal behavior: publish directly, no Telegram round-trip.
async function publishDirect(env: Env): Promise<void> {
  await env.DB.prepare("UPDATE records SET status='live' WHERE status='pending'").run();
  for (const o of await listStaged(env)) {
    const parts = o.key.slice(STAGE_PREFIX.length).split("/");
    const id = parts.pop()!.replace(/\.mp4$/, "");
    const rec = await env.DB.prepare("SELECT archive FROM records WHERE id=?").bind(id).first<{ archive: string }>();
    if (!rec) { await env.MEDIA.delete(o.key); continue; }
    const to = `${LIVE_PREFIX}${rec.archive}/${id}.mp4`;
    const obj = await env.MEDIA.get(o.key);
    if (!obj) continue;
    await env.MEDIA.put(to, obj.body, { httpMetadata: { contentType: "video/mp4" } });
    await env.MEDIA.delete(o.key);
    log({ direct: "short", ref: id });
  }
}

export async function contentTick(env: Env): Promise<void> {
  const logErr = (e: unknown) => log({ crashed: errLine(e) });
  try {
    if (gateOn(env)) {
      await queueStagedRecords(env).catch(logErr);
      await queueStagedShort(env).catch(logErr);
      await dropSkippedStaging(env).catch(logErr);
    } else {
      await publishDirect(env).catch(logErr);
    }
  } catch (e) { logErr(e); }
}
