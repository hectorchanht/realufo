import type { Env } from "../env";
import { json, error } from "../lib/json";
import { CARD_COLS } from "../lib/db";
import { hubsFor } from "../lib/hubs";
import { listHubsCached } from "./hubs";
import { isoDate, yearOf, decadeOf, wargovReleases, facetCounts } from "../lib/facets";
// Re-exported for callers that predate lib/facets (lib/xpick.ts).
export { wargovReleases };

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
    SELECT ${CARD_COLS}
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
        `SELECT ${CARD_COLS}
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
  const f = await facetCounts(env);
  return json({
    releases: f.releases.map(({ no, date, count }) => ({ no, date, count })),
    agencies: f.agencies,
    decades: f.decades,
    locations: f.locations,
  });
}

// The doc detail object, shared by GET /api/records/:id and the Worker's
// pre-render of /doc/:id (lib/pages.ts). Null when the record doesn't exist.
export async function loadRecord(env: Env, id: string, origin: string) {
  const record = await env.DB.prepare("SELECT * FROM records WHERE id=?")
    .bind(id)
    .first<RecordRow>();
  if (!record) return null;
  const releaseP = releaseOf(env, record);
  const [assets, promoted, series, release, related, text, hubList] = await Promise.all([
    env.DB.prepare("SELECT role,cdn_url,mime,width,height,duration FROM assets WHERE record_id=?").bind(id).all(),
    env.DB.prepare(
      `SELECT t.id,t.no,t.title,t.stance,t.votes,t.source_record_id,b.slug boardSlug,b.accent accent
                    FROM threads t JOIN boards b ON b.id=t.board_id WHERE t.source_record_id=?`
    )
      .bind(id)
      .all(),
    seriesNav(env, id),
    releaseP,
    releaseP.then((rel) => relatedOf(env, record, rel)),
    env.DB.prepare("SELECT pages,truncated,total_pages FROM record_text WHERE record_id=?")
      .bind(id)
      .first<{ pages: string; truncated: number; total_pages: number }>(),
    // Hub links are optional garnish: a failing facet query must not break the doc.
    listHubsCached(env, origin).catch((e) => {
      console.error("hub list failed", e);
      return [];
    }),
  ]);
  // Quality-filtered PDF text (crawler ingest.fulltext); null until extracted.
  const fullText = text
    ? { pages: JSON.parse(text.pages) as { n: number; text: string }[], truncated: !!text.truncated, total_pages: text.total_pages }
    : null;
  const live = new Set(hubList.map((h) => `${h.kind}/${h.slug}`));
  return {
    record, assets: assets.results, promotedThreads: promoted.results, series, release, related, fullText,
    hubs: hubsFor(record, release?.no ?? null, live),
  };
}

export async function getRecord(req: Request, env: Env, p: Record<string, string>) {
  const data = await loadRecord(env, p.id, new URL(req.url).origin);
  return data ? json(data) : error(404, "record not found");
}
