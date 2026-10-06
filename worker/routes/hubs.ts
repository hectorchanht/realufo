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
import { TOPIC_RULES, topicWhere, type TopicBlock, type TopicText } from "../lib/topics";
import { AGENCY_TEXT, TOPIC_TEXT } from "../lib/topicText";
import { CASE_STORY_TEXT } from "../lib/caseStoryText";

export type CardRow = { id: string; title: string; kind: string; incident_date: string | null } & Record<string, unknown>;
export type HighlightPick = { id: string; why: string; title: string; thumb: string | null; kind: string };
export type Highlights = { lede: string; picks: HighlightPick[] };
export interface Hub {
  kind: HubKind; slug: string; title: string; intro: string; stats: HubStats;
  records: CardRow[]; siblings: HubSummary[]; prev?: string | null; next?: string | null;
  highlights: Highlights | null;
  release?: ReleaseBlock | null;
  topic?: TopicBlock;
  /** Pagination: records is the current page's slice. */
  total: number; page: number; pageSize: number; totalPages: number;
}

// Files per hub page (agency/location/topic/release/decade). The v1 API
// passes pageSize 0 to keep returning the whole list for SDK consumers.
export const HUB_PAGE_SIZE = 48;

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
export async function listHubs(env: Env, origin: string): Promise<HubSummary[]> {
  const [f, members] = await Promise.all([
    facetCounts(env),
    // A failing topic query drops topics, not every hub (bootstrap, browse, sitemap use this list).
    topicMembers(env, origin).catch((e) => {
      console.error("topic members failed", e);
      return {} as Record<string, string[]>;
    }),
  ]);
  const sum = (values: string[], rows: { name: string; count: number }[]) =>
    rows.filter((r) => values.includes(r.name)).reduce((n, r) => n + r.count, 0);
  return [
    ...f.releases.map((r) => ({ kind: "release" as const, slug: String(r.no), label: releaseLabel(r.no, r.date), count: r.count })),
    ...TOPIC_RULES.map((t) => ({ kind: "topic" as const, slug: t.slug, label: t.label, count: (members[t.slug] ?? []).length })),
    ...AGENCY_HUBS.map((h) => ({ kind: "agency" as const, slug: h.slug, label: h.label, count: sum(h.values, f.agencies), values: h.values })),
    ...LOCATION_HUBS.map((h) => ({ kind: "location" as const, slug: h.slug, label: h.label, count: sum(h.values, f.locations), values: h.values })),
    ...f.decades.map((d) => ({ kind: "decade" as const, slug: `${d.decade}s`, label: `${d.decade}s`, count: d.count })),
  ].filter((h) => h.count >= MIN_HUB_FILES);
}

// ponytail: 1h per colo; a new release/hub shows up within the hour.
export const listHubsCached = async (env: Env, origin: string) =>
  (await cachedJson(`${origin}/__hubs`, () => listHubs(env, origin))) ?? [];

// One source of truth for topic membership: each rule runs once, include/exclude
// applied, memoized like the hub list (1h per colo).
export const topicMembers = async (env: Env, origin: string): Promise<Record<string, string[]>> =>
  (await cachedJson(`${origin}/__topics`, async () => {
    const out: Record<string, string[]> = {};
    for (const t of TOPIC_RULES) {
      const w = topicWhere(t.rule);
      const ids = new Set(
        (await env.DB.prepare(`SELECT r.id FROM records r WHERE r.status='live' AND ${w.sql}`).bind(...w.binds).all<{ id: string }>()).results.map((r) => r.id)
      );
      if (t.include?.length) {
        const inc = await env.DB.prepare("SELECT id FROM records WHERE status='live' AND id IN (SELECT value FROM json_each(?))")
          .bind(JSON.stringify(t.include))
          .all<{ id: string }>();
        for (const r of inc.results) ids.add(r.id);
      }
      for (const x of t.exclude ?? []) ids.delete(x);
      out[t.slug] = [...ids].sort();
    }
    return out;
  })) ?? {};

async function topicBlock(env: Env, text: TopicText | undefined, members: string[]): Promise<TopicBlock> {
  const srcIds = (text?.sources ?? []).map((s) => s.id);
  const [recs, stories] = await Promise.all([
    env.DB.prepare("SELECT id,title,kind FROM records WHERE status='live' AND id IN (SELECT value FROM json_each(?))")
      .bind(JSON.stringify(srcIds))
      .all<{ id: string; title: string; kind: string }>(),
    (async () =>
      env.DB.prepare(
        `SELECT a.slug, a.title, a.thread_id threadId, max(a.created_at) c FROM articles a JOIN article_records ar ON ar.slug=a.slug
          WHERE ar.record_id IN (SELECT value FROM json_each(?)) GROUP BY a.slug ORDER BY c DESC`
      )
        .bind(JSON.stringify(members))
        .all<{ slug: string; title: string; threadId: string | null }>())()
      .catch((e) => {
        // Stories are garnish: the topic page still renders without them.
        console.error("topic stories failed", e);
        return { results: [] as { slug: string; title: string; threadId: string | null }[] };
      }),
  ]);
  const byId = new Map(recs.results.map((r) => [r.id, r]));
  return {
    background: text?.background ?? "", lore: text?.lore ?? null,
    sources: (text?.sources ?? []).flatMap((s) => {
      const r = byId.get(s.id);
      return r ? [{ id: s.id, page: s.page ?? null, note: s.note, title: docTitle(r.title, r.id, r.kind) }] : [];
    }),
    stories: [
      ...stories.results.filter((s) => s.threadId).map((s) => ({ slug: s.slug, title: s.title, threadId: s.threadId, href: `/thread/${s.threadId}` })),
      // Fact-checked case stories that cite this topic's files.
      ...Object.entries(CASE_STORY_TEXT)
        .filter(([, cs]) => cs.sources.some((x) => x.id && members.includes(x.id)))
        .map(([slug, cs]) => ({ slug, title: cs.title, threadId: null, href: `/case/${slug}` })),
    ],
  };
}

// SQL filter selecting one hub's records (table alias r).
async function hubFilter(env: Env, h: HubSummary, origin: string) {
  if (h.kind === "topic") {
    const members = (await topicMembers(env, origin))[h.slug] ?? [];
    return { where: "r.id IN (SELECT value FROM json_each(?))", bind: [JSON.stringify(members)], release: null, members };
  }
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

// Pick ids referenced by a highlights row, so page 1 can resolve them even
// when they fall outside the first page's record slice.
function highlightPickIds(row: { picks: string } | null): string[] {
  if (!row) return [];
  try {
    const raw: unknown = JSON.parse(row.picks);
    return (Array.isArray(raw) ? raw : []).map((p: any) => p?.id).filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

export async function loadHub(
  env: Env, kind: string, slug: string, origin: string, page = 1, pageSize = HUB_PAGE_SIZE
): Promise<Hub | null> {
  const hubs = await listHubsCached(env, origin);
  const me = hubs.find((h) => h.kind === kind && h.slug === slug);
  if (!me) return null;
  const sel = await hubFilter(env, me, origin);
  if (!sel) return null;
  const p = Math.max(1, Math.floor(page) || 1);
  const total = (await env.DB.prepare(`SELECT COUNT(*) c FROM records r WHERE ${sel.where} AND r.status='live'`)
    .bind(...sel.bind)
    .first<{ c: number }>())?.c ?? 0;
  if (total < MIN_HUB_FILES) return null;
  // pageSize <= 0 (the v1 API) means "the whole list as one page".
  const size = pageSize > 0 ? pageSize : total;
  const totalPages = Math.max(1, Math.ceil(total / size));
  if (p > totalPages) return null;
  const { results: records } = await env.DB.prepare(
    `SELECT ${CARD_COLS} FROM records r WHERE ${sel.where} AND r.status='live'
     ORDER BY r.featured DESC, r.created_at DESC, r.id LIMIT ? OFFSET ?`
  )
    .bind(...sel.bind, size, (p - 1) * size)
    .all<CardRow>();
  // Stats describe the whole hub, not just this page's slice.
  const { results: statRows } = await env.DB.prepare(
    `SELECT r.kind, r.incident_date FROM records r WHERE ${sel.where} AND r.status='live'`
  )
    .bind(...sel.bind)
    .all<{ kind: string; incident_date: string | null }>();
  const stats = hubStats(statRows);
  const firstPage = p === 1;
  const hlRow = firstPage
    ? await env.DB.prepare("SELECT lede,picks FROM hub_highlights WHERE kind=? AND slug=?")
        .bind(me.kind, me.slug)
        .first<{ lede: string; picks: string }>()
        .catch((e) => {
          console.error("hub highlights failed", e);
          return null;
        })
    : null;
  // Highlights are re-checked against the pick records themselves, so a pick
  // past the first page's slice still resolves on page 1.
  const pickIds = firstPage ? highlightPickIds(hlRow) : [];
  const pickRows = pickIds.length
    ? (await env.DB.prepare(`SELECT ${CARD_COLS} FROM records r WHERE r.id IN (SELECT value FROM json_each(?)) AND r.status='live'`)
        .bind(JSON.stringify(pickIds))
        .all<CardRow>()).results
    : [];
  const same = hubs.filter((h) => h.kind === me.kind);
  const i = same.indexOf(me);
  const highlights = firstPage ? highlightsOf(hlRow, [...pickRows, ...records]) : null;
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
  // Editorial garnish (topic background, sources, related stories) lives on
  // page 1; deeper pages are pure file listings.
  const topic =
    firstPage && me.kind === "topic"
      ? await topicBlock(env, TOPIC_TEXT[me.slug], (sel as { members: string[] }).members)
      : firstPage && me.kind === "agency" && Object.hasOwn(AGENCY_TEXT, me.slug)
        ? await topicBlock(
            env,
            AGENCY_TEXT[me.slug],
            (await env.DB.prepare(`SELECT r.id id FROM records r WHERE ${sel.where} AND r.status='live'`)
              .bind(...sel.bind)
              .all<{ id: string }>()).results.map((r) => r.id)
          )
        : undefined;
  return {
    kind: me.kind, slug: me.slug, title: hubTitle(me), intro: hubIntro(me, sel.release, stats), stats, records, highlights,
    total, page: p, pageSize: size, totalPages,
    siblings: same.filter((h) => h !== me),
    ...(me.kind === "release" ? { prev: same[i - 1]?.slug ?? null, next: same[i + 1]?.slug ?? null, release } : {}),
    ...(topic ? { topic } : {}),
  };
}

const PUBLIC = { headers: { "cache-control": "public, max-age=300" } };

export async function hubsIndex(req: Request, env: Env) {
  return json({ hubs: await listHubsCached(env, new URL(req.url).origin) }, PUBLIC);
}

export async function getHub(req: Request, env: Env, p: Record<string, string>) {
  const url = new URL(req.url);
  const h = await loadHub(env, p.kind, p.slug, url.origin, pageOf(url));
  return h ? json(h, PUBLIC) : error(404, "hub not found");
}

// ?page=N → 1-based page number, clamped to ≥ 1. Shared by the JSON API, the
// pre-render loader and the page-HTML cache key.
export function pageOf(url: URL): number {
  const n = parseInt(url.searchParams.get("page") || "1", 10);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}
