import { docTitle } from "./ssr";
import type { Env } from "../env";
import { wargovReleases } from "../routes/records";

// What the bot posts next (Spec 4 §4.2–4.4) and whether it can afford it.

export type Media = { key: string; mime: string; size: number } | null;
export type PickRecord = {
  id: string; archive: string; kind: string; title: string | null; agency: string | null;
  incident_date: string | null; location: string | null; summary: string | null; duration: number | null;
  tldr_bullets?: string | null; tldr_joke?: string | null;
};
export type Candidate =
  | { stream: "release"; ref: string; label: string; link: string; kinds: Record<string, number>; titles: string[]; media: Media }
  | { stream: "pick"; ref: string; record: PickRecord; link: string; media: Media }
  | { stream: "highlight"; ref: string; thread: { id: string; title: string; body: string; votes: number }; media: Media };

// No dots: X auto-links bare domains like war.gov and bills them as URLs.
export const ARCHIVE_NAME: Record<string, string> = { wargov: "Dept. of War", aaro: "AARO", nara: "National Archives", nasa: "NASA" };

const CDN = "https://assets.realufo.org/";
const SITE = "https://realufo.org";
const IMAGE_MAX = 5 * 1024 * 1024; // X image limit
const SETTLE_MS = 2 * 3600_000; // ingest may still be adding files to a release

export const sqlTime = (d: Date) => d.toISOString().slice(0, 19).replace("T", " ");

export const costOf = (c: Candidate) => ("link" in c ? 0.2 : 0.015) + (c.media ? 0.015 : 0); // ponytail: media upload unpriced on X's card; assume one post-create charge

// Rows that may have cost money: everything but failed.
export async function withinBudget(env: Env, cost: number, now: Date): Promise<boolean> {
  const t = sqlTime(now);
  const r = await env.DB.prepare(
    `SELECT sum(date(created_at)=date(?1)) today, coalesce(sum(CASE WHEN strftime('%Y-%m',created_at)=strftime('%Y-%m',?1) THEN cost_usd END),0) month
     FROM x_posts WHERE status!='failed'`
  ).bind(t).first<{ today: number | null; month: number }>();
  return (r?.today ?? 0) < Number(env.X_DAILY_MAX ?? 3) && (r?.month ?? 0) + cost <= Number(env.X_MONTHLY_USD_CAP ?? 10) + 1e-9;
}

export async function mediaFor(env: Env, rec: { id: string; archive: string; kind: string }): Promise<Media> {
  if (rec.kind === "video") {
    const key = `clips/${rec.archive}/${rec.id}.mp4`;
    const o = await env.MEDIA.head(key);
    if (o) return { key, mime: "video/mp4", size: o.size };
  }
  const t = await env.DB.prepare("SELECT cdn_url, mime FROM assets WHERE record_id=? AND role='thumb' LIMIT 1")
    .bind(rec.id).first<{ cdn_url: string; mime: string | null }>();
  if (!t?.cdn_url.startsWith(CDN)) return null;
  const key = t.cdn_url.slice(CDN.length);
  const o = await env.MEDIA.head(key);
  return o && o.size <= IMAGE_MAX ? { key, mime: t.mime ?? "image/jpeg", size: o.size } : null;
}

const postedToday = async (env: Env, stream: string, now: Date) =>
  !!(await env.DB.prepare("SELECT 1 FROM x_posts WHERE stream=? AND status!='failed' AND date(created_at)=date(?) LIMIT 1")
    .bind(stream, sqlTime(now)).first());
const isPosted = async (env: Env, stream: string, ref: string) =>
  !!(await env.DB.prepare("SELECT 1 FROM x_posts WHERE stream=? AND ref=?").bind(stream, ref).first());

type GroupRow = { id: string; archive: string; kind: string; title: string | null; created_at: string };

async function releaseFrom(env: Env, ref: string, label: string, link: string, rows: GroupRow[], now: Date): Promise<Candidate | null> {
  if (!rows.length || (await isPosted(env, "release", ref))) return null;
  const since = env.X_SINCE ?? "";
  const first = rows.reduce((a, r) => (r.created_at < a ? r.created_at : a), rows[0].created_at);
  const last = rows.reduce((a, r) => (r.created_at > a ? r.created_at : a), rows[0].created_at);
  if (!since || first < since || last > sqlTime(new Date(now.getTime() - SETTLE_MS))) return null;
  const kinds: Record<string, number> = {};
  for (const r of rows) kinds[r.kind] = (kinds[r.kind] ?? 0) + 1;
  let media: Media = null;
  for (const r of [...rows].sort((a, b) => Number(b.kind === "video") - Number(a.kind === "video")).slice(0, 5))
    if ((media = await mediaFor(env, r))) break;
  return { stream: "release", ref, label, link, kinds, titles: rows.slice(0, 5).map((r) => docTitle(r.title ?? "", r.id, r.kind)), media };
}

async function releaseCandidate(env: Env, now: Date): Promise<Candidate | null> {
  if (!env.X_SINCE) return null;
  const cols = "id, archive, kind, title, created_at";
  for (const rel of (await wargovReleases(env)).reverse()) {
    const rows = await env.DB.prepare(
      `SELECT ${cols} FROM records WHERE archive='wargov' AND status='live' AND doc_date IN (${rel.raw.map(() => "?").join(",")}) ORDER BY id`
    ).bind(...rel.raw).all<GroupRow>();
    const no = String(rel.no).padStart(2, "0");
    // ref keyed on the release date, not its rank: a late file with an earlier
    // doc_date would shift every rank and re-announce an old release
    const c = await releaseFrom(env, `wargov:${rel.date}`, `${ARCHIVE_NAME.wargov} UAP Release ${no}`, `${SITE}/archive?release=${rel.no}`, rows.results, now);
    if (c) return c;
  }
  const groups = await env.DB.prepare(
    `SELECT archive, date(created_at) d FROM records WHERE archive!='wargov' AND status='live' AND date(created_at)>=?
     GROUP BY archive, d ORDER BY d DESC`
  ).bind(env.X_SINCE).all<{ archive: string; d: string }>();
  for (const g of groups.results) {
    const rows = await env.DB.prepare(`SELECT ${cols} FROM records WHERE archive=? AND status='live' AND date(created_at)=? ORDER BY id`)
      .bind(g.archive, g.d).all<GroupRow>();
    const name = ARCHIVE_NAME[g.archive] ?? g.archive.toUpperCase();
    const c = await releaseFrom(env, `${g.archive}:${g.d}`, `New ${name} files`, `${SITE}/archive?archive=${g.archive}`, rows.results, now);
    if (c) return c;
  }
  return null;
}

const PICK_COLS = `r.id, r.archive, r.kind, r.title, r.agency, r.incident_date, r.location, r.summary,
  (SELECT duration FROM assets d WHERE d.record_id=r.id AND d.role='full' AND d.duration IS NOT NULL LIMIT 1) duration,
  (SELECT bullets FROM record_tldr x WHERE x.record_id=r.id AND x.lang='en') tldr_bullets,
  (SELECT one_liner FROM record_tldr x WHERE x.record_id=r.id AND x.lang='en') tldr_joke`;
// placeholder-titled records (no published title/metadata) make weak posts: skip
const UNPOSTED = `r.status='live' AND coalesce(r.title,'') NOT LIKE '%original title not published%'
  AND NOT EXISTS (SELECT 1 FROM x_posts p WHERE p.stream='pick' AND p.ref=r.id)`;

// Record ids that have an MP4 under `prefix` (clips/ = X landscape, clips-v/ = 9:16 twins).
export async function clipIds(env: Env, prefix = "clips/"): Promise<string[]> {
  const ids: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.MEDIA.list({ prefix, cursor });
    for (const o of page.objects) ids.push(o.key.split("/").pop()!.replace(/\.mp4$/, ""));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return ids;
}

async function pickCandidate(env: Env): Promise<Candidate | null> {
  // Videos with a clip first ("people need videos to keep watching"), then image/pdf with a thumb.
  let r = await env.DB.prepare(`SELECT ${PICK_COLS} FROM records r WHERE r.kind='video' AND r.id IN (SELECT value FROM json_each(?)) AND ${UNPOSTED} ORDER BY random() LIMIT 1`)
    .bind(JSON.stringify(await clipIds(env))).first<PickRecord>();
  r ??= await env.DB.prepare(
    `SELECT ${PICK_COLS} FROM records r WHERE r.kind IN ('image','pdf') AND ${UNPOSTED}
     AND EXISTS (SELECT 1 FROM assets a WHERE a.record_id=r.id AND a.role='thumb') ORDER BY r.kind='image' DESC, random() LIMIT 1`
  ).first<PickRecord>();
  return r ? { stream: "pick", ref: r.id, record: r, link: `${SITE}/doc/${encodeURIComponent(r.id)}`, media: await mediaFor(env, r) } : null;
}

async function highlightCandidate(env: Env, now: Date): Promise<Candidate | null> {
  // Opt-in: votes are cheap to forge (anon ids are client-chosen), so this
  // stream puts user text on the official account only when the operator sets a bar.
  const min = Number(env.X_HIGHLIGHT_MIN_VOTES || 0);
  if (!(min > 0)) return null;
  const t = await env.DB.prepare(
    `SELECT t.id, t.title, t.op_body, t.votes, t.source_record_id, r.archive, r.kind FROM threads t
     LEFT JOIN records r ON r.id=t.source_record_id
     WHERE t.votes>=? AND t.created_at>=datetime(?,'-7 days')
       AND NOT EXISTS (SELECT 1 FROM x_posts p WHERE p.stream='highlight' AND p.ref=t.id)
     ORDER BY t.votes DESC LIMIT 1`
  ).bind(min, sqlTime(now))
    .first<{ id: string; title: string | null; op_body: string | null; votes: number; source_record_id: string | null; archive: string | null; kind: string | null }>();
  if (!t) return null;
  // Never user uploads: media only from the official record the thread is about.
  const media = t.source_record_id && t.archive && t.kind ? await mediaFor(env, { id: t.source_record_id, archive: t.archive, kind: t.kind }) : null;
  return { stream: "highlight", ref: t.id, thread: { id: t.id, title: t.title ?? "", body: (t.op_body ?? "").slice(0, 500), votes: t.votes }, media };
}

// Pick slots (UTC hours, e.g. "15,18,21"): a pick is due while today's picks are fewer
// than the slots already reached, so a failed tick is caught up by the next one.
async function pickDue(env: Env, now: Date): Promise<boolean> {
  const slots = (env.X_PICK_HOURS || "14").split(",").map(Number).filter((h) => h >= 0 && h < 24);
  const reached = slots.filter((h) => h <= now.getUTCHours()).length;
  if (!reached) return false;
  const r = await env.DB.prepare("SELECT count(*) n FROM x_posts WHERE stream='pick' AND status!='failed' AND date(created_at)=date(?)")
    .bind(sqlTime(now)).first<{ n: number }>();
  return (r?.n ?? 0) < reached;
}

export async function nextCandidate(env: Env, now: Date): Promise<Candidate | null> {
  const h = now.getUTCHours();
  return (
    (await releaseCandidate(env, now)) ??
    ((await pickDue(env, now)) ? await pickCandidate(env) : null) ??
    (h >= 20 && !(await postedToday(env, "highlight", now)) ? await highlightCandidate(env, now) : null)
  );
}
