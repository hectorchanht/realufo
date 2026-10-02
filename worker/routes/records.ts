import type { Env } from "../env";
import { json, error } from "../lib/json";
import { thumbSql } from "../lib/db";

export async function listRecords(req: Request, env: Env) {
  const u = new URL(req.url);
  const where: string[] = [];
  const bind: unknown[] = [];
  const arch = u.searchParams.get("archive");
  if (arch && arch !== "all") {
    where.push("r.archive=?");
    bind.push(arch);
  }
  const type = u.searchParams.get("type");
  if (type && type !== "all") {
    where.push("r.kind=?");
    bind.push(type.toLowerCase());
  }
  if (u.searchParams.get("redacted") === "1") where.push("r.redacted=1");
  const q = (u.searchParams.get("q") || "").trim();
  if (q) {
    where.push("(lower(r.title||' '||r.agency||' '||coalesce(r.location,'')||' '||coalesce(r.summary,'')) LIKE ?)");
    bind.push("%" + q.toLowerCase() + "%");
  }
  const w = where.length ? "WHERE " + where.join(" AND ") : "";
  const limit = Math.max(1, Math.min(100, Number(u.searchParams.get("limit")) || 40));
  const offset = Math.max(0, Number(u.searchParams.get("offset")) || 0);
  const total = await env.DB.prepare(`SELECT count(*) c FROM records r ${w}`).bind(...bind).first<{ c: number }>();
  const rows = await env.DB.prepare(
    `
    SELECT r.id,r.archive,r.agency,r.title,r.summary,r.kind,r.redacted,r.location,r.incident_date,r.doc_date,
      ${thumbSql("r.id")} thumb
    FROM records r ${w} ORDER BY r.featured DESC, r.created_at DESC LIMIT ? OFFSET ?`
  )
    .bind(...bind, limit, offset)
    .all();
  return json({ count: total?.c ?? 0, records: rows.results });
}

// "NASA-UAP-D030" → ["NASA-UAP-D", 30, ""]; "NASA-UAP-D003A" → [.., 3, "A"].
// Ids without a trailing number, or with no prefix (pure numbers), have no series.
function seriesKey(id: string): [string, number, string] | null {
  const m = /^(.*\D)(\d+)([A-Za-z]*)$/.exec(id);
  return m ? [m[1], Number(m[2]), m[3]] : null;
}

async function seriesNav(env: Env, id: string) {
  const key = seriesKey(id);
  if (!key) return { prev: null, next: null };
  const rows = await env.DB.prepare("SELECT id FROM records WHERE substr(id,1,?)=?")
    .bind(key[0].length, key[0])
    .all<{ id: string }>();
  const ids = rows.results
    .map((r) => [r.id, seriesKey(r.id)] as const)
    .filter(([, k]) => k && k[0] === key[0])
    .sort(([, a], [, b]) => a![1] - b![1] || a![2].localeCompare(b![2]))
    .map(([i]) => i);
  const i = ids.indexOf(id);
  return { prev: ids[i - 1] ?? null, next: ids[i + 1] ?? null };
}

// war.gov doc_date is the release date ("7/10/26"); release N = rank of that
// date among all distinct war.gov release dates. Other archives have no
// numbered releases.
function isoDate(mdy: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/.exec(mdy.trim());
  return m ? `20${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : null;
}

async function releaseOf(env: Env, record: { archive: string; doc_date: string | null }) {
  const date = record.archive === "wargov" && record.doc_date ? isoDate(record.doc_date) : null;
  if (!date) return null;
  const rows = await env.DB.prepare(
    "SELECT DISTINCT doc_date d FROM records WHERE archive='wargov' AND doc_date IS NOT NULL"
  ).all<{ d: string }>();
  const dates = [...new Set(rows.results.map((r) => isoDate(r.d)).filter(Boolean))].sort();
  return { no: dates.indexOf(date) + 1, date };
}

export async function getRecord(_req: Request, env: Env, p: Record<string, string>) {
  const record = await env.DB.prepare("SELECT * FROM records WHERE id=?")
    .bind(p.id)
    .first<{ archive: string; doc_date: string | null }>();
  if (!record) return error(404, "record not found");
  const [assets, promoted, series, release] = await Promise.all([
    env.DB.prepare("SELECT role,cdn_url,mime,width,height FROM assets WHERE record_id=?").bind(p.id).all(),
    env.DB.prepare(
      `SELECT t.id,t.no,t.title,t.stance,t.votes,t.source_record_id,b.slug boardSlug,b.accent accent
                    FROM threads t JOIN boards b ON b.id=t.board_id WHERE t.source_record_id=?`
    )
      .bind(p.id)
      .all(),
    seriesNav(env, p.id),
    releaseOf(env, record),
  ]);
  return json({ record, assets: assets.results, promotedThreads: promoted.results, series, release });
}
