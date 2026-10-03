import type { Env } from "../env";
import { json, error } from "../lib/json";
import { CARD_COLS } from "../lib/db";
import { cachedJson } from "../lib/cache";
import { decadeOf, facetCounts, wargovReleases } from "../lib/facets";
import {
  AGENCY_HUBS, LOCATION_HUBS, MIN_HUB_FILES, hubIntro, hubStats, hubTitle, releaseLabel,
  type HubKind, type HubStats, type HubSummary,
} from "../lib/hubs";
import { docTitle } from "../lib/ssr";
import { releaseBlock } from "./releases";
import type { ReleaseBlock } from "../lib/releases";

export type CardRow = { id: string; title: string; kind: string; incident_date: string | null } & Record<string, unknown>;
export type HighlightPick = { id: string; why: string; title: string; thumb: string | null; kind: string };
export type Highlights = { lede: string; picks: HighlightPick[] };
export interface Hub {
  kind: HubKind; slug: string; title: string; intro: string; stats: HubStats;
  records: CardRow[]; siblings: HubSummary[]; prev?: string | null; next?: string | null;
  highlights: Highlights | null;
  release?: ReleaseBlock | null;
}

// AI picks (crawler ingest.highlights) re-checked against the hub's current
// files: a pick that left the hub is dropped; < 2 left hides the section.
export function highlightsOf(row: { lede: string; picks: string } | null, records: CardRow[]): Highlights | null {
  if (!row) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(row.picks);
  } catch {
    return null;
  }
  const byId = new Map(records.map((r) => [r.id, r]));
  const picks = (Array.isArray(raw) ? raw : []).flatMap((p: any) => {
    const r = byId.get(p?.id);
    return r && typeof p.why === "string"
      ? [{ id: r.id, why: p.why, title: r.title, thumb: (r.thumb as string | null) ?? null, kind: r.kind }]
      : [];
  });
  return picks.length >= 2 ? { lede: row.lede, picks } : null;
}

// Every hub with ≥ MIN_HUB_FILES files, from the Archive's grouped counts.
export async function listHubs(env: Env): Promise<HubSummary[]> {
  const f = await facetCounts(env);
  const sum = (values: string[], rows: { name: string; count: number }[]) =>
    rows.filter((r) => values.includes(r.name)).reduce((n, r) => n + r.count, 0);
  return [
    ...f.releases.map((r) => ({ kind: "release" as const, slug: String(r.no), label: releaseLabel(r.no, r.date), count: r.count })),
    ...AGENCY_HUBS.map((h) => ({ kind: "agency" as const, slug: h.slug, label: h.label, count: sum(h.values, f.agencies), values: h.values })),
    ...LOCATION_HUBS.map((h) => ({ kind: "location" as const, slug: h.slug, label: h.label, count: sum(h.values, f.locations), values: h.values })),
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
  const hlRow = await env.DB.prepare("SELECT lede,picks FROM hub_highlights WHERE kind=? AND slug=?")
    .bind(me.kind, me.slug)
    .first<{ lede: string; picks: string }>()
    .catch((e) => {
      console.error("hub highlights failed", e);
      return null;
    });
  const same = hubs.filter((h) => h.kind === me.kind);
  const i = same.indexOf(me);
  const highlights = highlightsOf(hlRow, records);
  const release =
    me.kind === "release"
      ? await releaseBlock(env, origin, Number(me.slug), (highlights?.picks ?? []).map((p) => ({ id: p.id, title: docTitle(p.title, p.id, p.kind) }))).catch(
          (e) => {
            // Same as highlights: the hub's own files still render without it.
            console.error("release block failed", e);
            return null;
          }
        )
      : undefined;
  return {
    kind: me.kind, slug: me.slug, title: hubTitle(me), intro: hubIntro(me, sel.release, stats), stats, records, highlights,
    siblings: same.filter((h) => h !== me),
    ...(me.kind === "release" ? { prev: same[i - 1]?.slug ?? null, next: same[i + 1]?.slug ?? null, release } : {}),
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
