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
  const release = u.searchParams.get("release");
  if (release) {
    where.push("r.archive='wargov' AND r.doc_date IN (SELECT value FROM json_each(?))");
    bind.push(JSON.stringify((await wargovReleases(env)).find((r) => String(r.no) === release)?.raw ?? []));
  }
  for (const col of ["agency", "location"]) {
    const v = u.searchParams.get(col);
    if (v) {
      where.push(`r.${col}=?`);
      bind.push(v);
    }
  }
  const decade = Number(u.searchParams.get("decade"));
  if (decade) {
    // Free-text incident dates → match the distinct values whose year lands in the decade.
    const rows = await env.DB.prepare("SELECT DISTINCT incident_date d FROM records WHERE incident_date IS NOT NULL").all<{ d: string }>();
    where.push("r.incident_date IN (SELECT value FROM json_each(?))");
    bind.push(JSON.stringify(rows.results.map((r) => r.d).filter((d) => decadeOf(d) === decade)));
  }
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

// All war.gov releases, oldest first: no, ISO date, the raw doc_date strings
// that map to it, and how many files it holds.
async function wargovReleases(env: Env) {
  const rows = await env.DB.prepare(
    "SELECT doc_date d, count(*) n FROM records WHERE archive='wargov' AND doc_date IS NOT NULL GROUP BY doc_date"
  ).all<{ d: string; n: number }>();
  const byDate = new Map<string, { raw: string[]; count: number }>();
  for (const r of rows.results) {
    const date = isoDate(r.d);
    if (!date) continue;
    const e = byDate.get(date) ?? { raw: [], count: 0 };
    e.raw.push(r.d);
    e.count += r.n;
    byDate.set(date, e);
  }
  return [...byDate.keys()].sort().map((date, i) => ({ no: i + 1, date, ...byDate.get(date)! }));
}

async function releaseOf(env: Env, record: { archive: string; doc_date: string | null }) {
  const date = record.archive === "wargov" && record.doc_date ? isoDate(record.doc_date) : null;
  if (!date) return null;
  const rel = (await wargovReleases(env)).find((r) => r.date === date);
  return rel ? { no: rel.no, date } : null;
}

// Related groups shown under a file, uapbrowser-style. Each group is a SQL
// filter on one field the record shares with others; a record lands in the
// first group it matches only, so the groups don't repeat each other.
type RecordRow = {
  id: string; archive: string; agency: string | null;
  location: string | null; incident_date: string | null; doc_date: string | null;
};
const RELATED_PER_GROUP = 6;

// "October, 2023" / "2023" → "2023"; "9/8/21" → "2021", "12/30/47" → "1947"
// (two-digit years past this year are last century). Null when no year.
function yearOf(d: string | null): string | null {
  if (!d) return null;
  const y4 = /\b(19|20)\d{2}\b/.exec(d);
  if (y4) return y4[0];
  const yy = /^\d{1,2}\/\d{1,2}\/(\d{2})$/.exec(d.trim());
  if (!yy) return null;
  return (Number(yy[1]) > new Date().getFullYear() % 100 ? "19" : "20") + yy[1];
}

function decadeOf(d: string | null): number | null {
  const y = yearOf(d);
  return y ? Math.floor(Number(y) / 10) * 10 : null;
}

async function relatedOf(env: Env, r: RecordRow, release: { no: number } | null) {
  const year = yearOf(r.incident_date);
  const groups: { key: string; label: string; where: string; bind: unknown[] }[] = [];
  if (r.location && r.location !== "N/A") groups.push({ key: "location", label: r.location, where: "r.location=?", bind: [r.location] });
  if (year)
    groups.push({
      key: "period", label: year,
      where: "(r.incident_date LIKE ? OR r.incident_date LIKE ?)", bind: [`%${year}%`, `%/%/${year.slice(2)}`],
    });
  if (release)
    groups.push({
      key: "release", label: `Release ${String(release.no).padStart(2, "0")}`,
      where: "r.archive='wargov' AND r.doc_date=?", bind: [r.doc_date],
    });
  if (r.agency) groups.push({ key: "agency", label: r.agency, where: "r.agency=?", bind: [r.agency] });

  const rows = await Promise.all(
    groups.map((g) =>
      env.DB.prepare(
        `SELECT r.id,r.archive,r.agency,r.title,r.summary,r.kind,r.redacted,r.location,r.incident_date,r.doc_date,
          ${thumbSql("r.id")} thumb
        FROM records r WHERE ${g.where} AND r.id<>? ORDER BY r.featured DESC, r.created_at DESC LIMIT ?`
      )
        .bind(...g.bind, r.id, RELATED_PER_GROUP * 4)
        .all<{ id: string }>()
    )
  );
  const seen = new Set<string>();
  return groups
    .map((g, i) => ({
      key: g.key,
      label: g.label,
      records: rows[i].results.filter((x) => !seen.has(x.id) && seen.add(x.id)).slice(0, RELATED_PER_GROUP),
    }))
    .filter((g) => g.records.length);
}

// Archive filter options with global counts (not narrowed by other filters).
export async function recordFacets(_req: Request, env: Env) {
  const groupBy = (col: string) =>
    env.DB.prepare(
      `SELECT ${col} name, count(*) count FROM records WHERE ${col} IS NOT NULL AND trim(${col}) NOT IN ('','N/A')
       GROUP BY ${col} ORDER BY count DESC, name`
    ).all<{ name: string; count: number }>();
  const [releases, agencies, locations, dates] = await Promise.all([
    wargovReleases(env),
    groupBy("agency"),
    groupBy("location"),
    env.DB.prepare("SELECT incident_date d, count(*) n FROM records GROUP BY incident_date").all<{ d: string | null; n: number }>(),
  ]);
  const decades = new Map<number, number>();
  for (const r of dates.results) {
    const dec = decadeOf(r.d);
    if (dec) decades.set(dec, (decades.get(dec) ?? 0) + r.n);
  }
  return json({
    releases: releases.map(({ no, date, count }) => ({ no, date, count })),
    agencies: agencies.results,
    decades: [...decades].sort(([a], [b]) => a - b).map(([decade, count]) => ({ decade, count })),
    locations: locations.results,
  });
}

export async function getRecord(_req: Request, env: Env, p: Record<string, string>) {
  const record = await env.DB.prepare("SELECT * FROM records WHERE id=?")
    .bind(p.id)
    .first<RecordRow>();
  if (!record) return error(404, "record not found");
  const releaseP = releaseOf(env, record);
  const [assets, promoted, series, release, related] = await Promise.all([
    env.DB.prepare("SELECT role,cdn_url,mime,width,height FROM assets WHERE record_id=?").bind(p.id).all(),
    env.DB.prepare(
      `SELECT t.id,t.no,t.title,t.stance,t.votes,t.source_record_id,b.slug boardSlug,b.accent accent
                    FROM threads t JOIN boards b ON b.id=t.board_id WHERE t.source_record_id=?`
    )
      .bind(p.id)
      .all(),
    seriesNav(env, p.id),
    releaseP,
    releaseP.then((rel) => relatedOf(env, record, rel)),
  ]);
  return json({ record, assets: assets.results, promotedThreads: promoted.results, series, release, related });
}
