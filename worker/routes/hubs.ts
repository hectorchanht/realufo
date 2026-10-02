import type { Env } from "../env";
import { json, error } from "../lib/json";
import { CARD_COLS } from "../lib/db";
import { cachedJson } from "../lib/cache";
import { decadeOf, facetCounts, wargovReleases } from "../lib/facets";
import {
  AGENCY_HUBS, LOCATION_HUBS, MIN_HUB_FILES, hubIntro, hubStats, hubTitle, releaseLabel,
  type HubKind, type HubStats, type HubSummary,
} from "../lib/hubs";

export type CardRow = { id: string; title: string; kind: string; incident_date: string | null } & Record<string, unknown>;
export interface Hub {
  kind: HubKind; slug: string; title: string; intro: string; stats: HubStats;
  records: CardRow[]; siblings: HubSummary[]; prev?: string | null; next?: string | null;
}

// Every hub with ≥ MIN_HUB_FILES files, from the Archive's grouped counts.
export async function listHubs(env: Env): Promise<HubSummary[]> {
  const f = await facetCounts(env);
  const sum = (values: string[], rows: { name: string; count: number }[]) =>
    rows.filter((r) => values.includes(r.name)).reduce((n, r) => n + r.count, 0);
  return [
    ...f.releases.map((r) => ({ kind: "release" as const, slug: String(r.no), label: releaseLabel(r.no, r.date), count: r.count })),
    ...AGENCY_HUBS.map((h) => ({ kind: "agency" as const, slug: h.slug, label: h.label, count: sum(h.values, f.agencies) })),
    ...LOCATION_HUBS.map((h) => ({ kind: "location" as const, slug: h.slug, label: h.label, count: sum(h.values, f.locations) })),
    ...f.decades.map((d) => ({ kind: "decade" as const, slug: `${d.decade}s`, label: `${d.decade}s`, count: d.count })),
  ].filter((h) => h.count >= MIN_HUB_FILES);
}

// ponytail: 1h per colo; a new release/hub shows up within the hour.
export const listHubsCached = async (env: Env, origin: string) =>
  (await cachedJson(`${origin}/__hubs`, () => listHubs(env))) ?? [];

// SQL filter selecting one hub's records (table alias r).
async function hubFilter(env: Env, h: HubSummary) {
  if (h.kind === "release") {
    const rel = (await wargovReleases(env)).find((r) => String(r.no) === h.slug);
    if (!rel) return null;
    return { where: "r.archive='wargov' AND r.doc_date IN (SELECT value FROM json_each(?))", bind: [JSON.stringify(rel.raw)], release: { no: rel.no, date: rel.date } };
  }
  if (h.kind === "decade") {
    const dec = Number(h.slug.slice(0, 4));
    const rows = await env.DB.prepare("SELECT DISTINCT incident_date d FROM records WHERE incident_date IS NOT NULL").all<{ d: string }>();
    // ponytail: decade matched in JS over distinct dates; add a stored decade column past ~20k records.
    const dates = rows.results.map((r) => r.d).filter((d) => decadeOf(d) === dec);
    return { where: "r.incident_date IN (SELECT value FROM json_each(?))", bind: [JSON.stringify(dates)], release: null };
  }
  const reg = (h.kind === "agency" ? AGENCY_HUBS : LOCATION_HUBS).find((e) => e.slug === h.slug);
  if (!reg) return null;
  return { where: `r.${h.kind} IN (SELECT value FROM json_each(?))`, bind: [JSON.stringify(reg.values)], release: null };
}

export async function loadHub(env: Env, kind: string, slug: string, origin: string): Promise<Hub | null> {
  const hubs = await listHubsCached(env, origin);
  const me = hubs.find((h) => h.kind === kind && h.slug === slug);
  if (!me) return null;
  const sel = await hubFilter(env, me);
  if (!sel) return null;
  const { results: records } = await env.DB.prepare(
    `SELECT ${CARD_COLS} FROM records r WHERE ${sel.where} AND r.status='live'
     ORDER BY r.featured DESC, r.created_at DESC, r.id`
  )
    .bind(...sel.bind)
    .all<CardRow>();
  if (records.length < MIN_HUB_FILES) return null;
  const stats = hubStats(records);
  const same = hubs.filter((h) => h.kind === me.kind);
  const i = same.indexOf(me);
  return {
    kind: me.kind, slug: me.slug, title: hubTitle(me), intro: hubIntro(me, sel.release, stats), stats, records,
    siblings: same.filter((h) => h !== me),
    ...(me.kind === "release" ? { prev: same[i - 1]?.slug ?? null, next: same[i + 1]?.slug ?? null } : {}),
  };
}

const PUBLIC = { headers: { "cache-control": "public, max-age=300" } };

export async function hubsIndex(req: Request, env: Env) {
  return json({ hubs: await listHubsCached(env, new URL(req.url).origin) }, PUBLIC);
}

export async function getHub(req: Request, env: Env, p: Record<string, string>) {
  const h = await loadHub(env, p.kind, p.slug, new URL(req.url).origin);
  return h ? json(h, PUBLIC) : error(404, "hub not found");
}
