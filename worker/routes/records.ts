import type { Env } from "../env";
import { json, error } from "../lib/json";
import { CARD_COLS } from "../lib/db";
import { hubsFor, MIN_HUB_FILES } from "../lib/hubs";
import { listHubsCached, topicMembers } from "./hubs";
import { TOPIC_RULES } from "../lib/topics";
import { CASE_STORY_TEXT } from "../lib/caseStoryText";
import { isoDate, yearOf, decadeOf, wargovReleases, facetCounts } from "../lib/facets";
import { verdictState } from "./verdicts";
import { queryShorts } from "./shorts";
import { uploadUrl } from "../lib/upload";
// Re-exported for callers that predate lib/facets (lib/xpick.ts).
export { wargovReleases };

// `has=` flags (comma list, all must hold); unknown names are ignored.
// Section summaries of the map-reduce AI summary (crawler ingest.summaries); null when absent or bad.
type Section = { from: number; to: number; text: string };
function parseSections(raw: string | null): Section[] | null {
  try {
    const v = JSON.parse(raw ?? "null");
    return Array.isArray(v) ? (v as Section[]) : null;
  } catch {
    return null;
  }
}

const HAS: Record<string, string> = {
  text: "EXISTS (SELECT 1 FROM record_text t WHERE t.record_id=r.id)",
  ai: "EXISTS (SELECT 1 FROM record_text t WHERE t.record_id=r.id AND t.ai_summary IS NOT NULL)",
  moments: "r.ai_moments IS NOT NULL",
  featured: "r.featured=1",
};

/** Free text → a safe FTS5 query: each word quoted (no operators get through),
 * all words required, one-letter words dropped, and a last word of 3+ letters
 * also matched as a prefix so typing "kecksbu" hits. */
export function ftsQuery(q: string): string | null {
  const words = (q.match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => w.length > 1).slice(0, 8);
  if (!words.length) return null;
  return words.map((w) => `"${w}"`).join(" ") + (words[words.length - 1].length >= 3 ? "*" : "");
}

/** Search ranking tiers, best first: the words as one phrase, every word whole
 * (FTS5 queries for record_fts), and the same two as " word " needles for the metadata,
 * so "AFFA" ranks a whole-word hit above "Affairs" and "men in black" ranks the
 * phrase above pages that merely hold all three words. */
export function searchTiers(q: string) {
  // One-letter words stay in the phrase ("men in a black suit"); ftsQuery drops them.
  const all = (q.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).slice(0, 8);
  const words = all.filter((w) => w.length > 1);
  if (!words.length) return null;
  // Words are letters/digits only, so they carry no FTS syntax.
  return {
    phrase: `"${all.join(" ")}"`,
    exact: words.map((w) => `"${w}"`).join(" "),
    metaPhrase: ` ${all.join(" ")} `,
    metaWords: words.map((w) => ` ${w} `),
  };
}

// META_HAY with separators turned into spaces, padded, so a " word " needle
// finds whole words. Matched with instr(), not GLOB: D1 rejects LIKE/GLOB
// patterns over 50 bytes, which a 4-word phrase pattern passes.
const META_SEPS = ["-", "_", ".", ",", ":", ";", "/", "(", ")", "''", '"', "“", "”", "‘", "’"];

// Metadata match: every word of q is a substring of id/title/agency/location/
// summary/date, in any field and order ("uap pr104" finds DOW-UAP-PR104).
// Words are letters/digits only, so they carry no LIKE wildcards; each is cut to
// fit D1's 50-byte LIKE pattern cap (a longer word's prefix still narrows).
const META_HAY = "lower(r.id||' '||r.title||' '||r.agency||' '||coalesce(r.location,'')||' '||coalesce(r.summary,'')||' '||coalesce(r.incident_date,''))";
const fitLike = (w: string) => (new TextEncoder().encode(w).length <= 48 ? w : [...w].slice(0, 12).join(""));
export function metaMatch(q: string): { sql: string; bind: string[] } {
  const words = (q.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).slice(0, 8);
  return words.length ? { sql: words.map(() => `${META_HAY} LIKE ?`).join(" AND "), bind: words.map((w) => `%${fitLike(w)}%`) } : { sql: "0", bind: [] };
}

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
  const redacted = u.searchParams.get("redacted");
  if (redacted === "1" || redacted === "0") where.push(`r.redacted=${redacted}`);
  for (const f of (u.searchParams.get("has") || "").split(",")) if (HAS[f]) where.push(HAS[f]);
  const release = u.searchParams.get("release");
  if (release) {
    where.push("r.archive='wargov' AND r.doc_date IN (SELECT value FROM json_each(?))");
    bind.push(JSON.stringify((await wargovReleases(env)).find((r) => String(r.no) === release)?.raw ?? []));
  }
  const agency = u.searchParams.get("agency");
  if (agency) {
    where.push("r.agency=?");
    bind.push(agency);
  }
  // Repeatable: a map place merges alias values ("Westen United States").
  const locations = u.searchParams.getAll("location").filter(Boolean);
  if (locations.length) {
    where.push("r.location IN (SELECT value FROM json_each(?))");
    bind.push(JSON.stringify(locations));
  }
  const decade = Number(u.searchParams.get("decade"));
  if (decade) {
    // Free-text incident dates → match the distinct values whose year lands in the decade.
    const rows = await env.DB.prepare("SELECT DISTINCT incident_date d FROM records WHERE incident_date IS NOT NULL").all<{ d: string }>();
    where.push("r.incident_date IN (SELECT value FROM json_each(?))");
    bind.push(JSON.stringify(rows.results.map((r) => r.d).filter((d) => decadeOf(d) === decade)));
  }
  const q = (u.searchParams.get("q") || "").trim();
  const meta = metaMatch(q);
  const fts = q ? ftsQuery(q) : null;
  if (q) {
    // Metadata OR page text (record_fts, migration 0020).
    where.push(fts ? `((${meta.sql}) OR r.id IN (SELECT record_id FROM record_fts WHERE record_fts MATCH ?))` : `(${meta.sql})`);
    bind.push(...meta.bind, ...(fts ? [fts] : []));
  }
  const w = where.length ? "WHERE " + where.join(" AND ") : "";
  const sort = u.searchParams.get("sort");
  let order = "r.featured DESC, r.created_at DESC";
  const orderBind: unknown[] = [];
  let join = "";
  const joinBind: unknown[] = [];
  const tiers = q && !sort ? searchTiers(q) : null;
  if (tiers && fts) {
    // Best tier of either side (0 phrase, 1 all words whole, 2 prefix/substring),
    // metadata before text within a tier, then the best page's bm25.
    const hay = `(' '||${META_SEPS.reduce((h, c) => `replace(${h}, '${c}', ' ')`, `replace(${META_HAY}, char(10), ' ')`)}||' ')`;
    const metaTier = `CASE WHEN instr(${hay}, ?) THEN 0 WHEN ${tiers.metaWords.map(() => `instr(${hay}, ?)`).join(" AND ")} THEN 1 WHEN ${meta.sql} THEN 2 ELSE 3 END`;
    // vb: an every-word page holds q as typed or in capitals, so "affa" and "AFFA"
    // both find the "AFFA" page over OCR's "Bender Affa ir".
    join = `LEFT JOIN (SELECT record_id, min(rank) bm FROM record_fts WHERE record_fts MATCH ? GROUP BY record_id) h ON h.record_id = r.id
      LEFT JOIN (SELECT record_id, max(instr(body, ?) OR instr(body, ?)) vb FROM record_fts WHERE record_fts MATCH ? GROUP BY record_id) v ON v.record_id = r.id`;
    joinBind.push(fts, q, q.toUpperCase(), tiers.exact);
    const textTier = `CASE WHEN r.id IN (SELECT record_id FROM record_fts WHERE record_fts MATCH ?) THEN 0
      WHEN r.id IN (SELECT record_id FROM record_fts WHERE record_fts MATCH ?) THEN 1 WHEN h.bm IS NOT NULL THEN 2 ELSE 3 END`;
    order = `min(${metaTier}, ${textTier}), ${metaTier}, v.vb DESC, h.bm IS NULL, h.bm, ${order}`;
    const metaBind = [tiers.metaPhrase, ...tiers.metaWords, ...meta.bind];
    orderBind.push(...metaBind, tiers.phrase, tiers.exact, ...metaBind);
  } else if (q && !sort) {
    // Searching with no explicit sort: title/summary hits before text-only hits.
    order = `CASE WHEN ${meta.sql} THEN 0 ELSE 1 END, ${order}`;
    orderBind.push(...meta.bind);
  }
  if (sort === "new") order = "r.created_at DESC";
  else if (sort === "az") order = "lower(r.title), r.id";
  else if (sort === "release") {
    // Newest war.gov release first ({doc_date: release no}); other archives last.
    join = "LEFT JOIN json_each(?) rl ON r.archive = 'wargov' AND rl.key = r.doc_date";
    joinBind.push(JSON.stringify(Object.fromEntries((await wargovReleases(env)).flatMap((r) => r.raw.map((d) => [d, r.no])))));
    order = "rl.value IS NULL, rl.value DESC, r.id";
  }
  else if (sort === "old" || sort === "recent") {
    // Free-text incident dates → a {date: year} map; undated records go last.
    const rows = await env.DB.prepare("SELECT DISTINCT incident_date d FROM records WHERE incident_date IS NOT NULL").all<{ d: string }>();
    join = "LEFT JOIN json_each(?) y ON y.key = r.incident_date";
    joinBind.push(JSON.stringify(Object.fromEntries(rows.results.map((r) => [r.d, Number(yearOf(r.d))]).filter(([, y]) => y))));
    order = `y.value IS NULL, y.value ${sort === "old" ? "ASC" : "DESC"}, r.created_at DESC`;
  }
  const limit = Math.max(1, Math.min(100, Number(u.searchParams.get("limit")) || 40));
  const offset = Math.max(0, Number(u.searchParams.get("offset")) || 0);
  const total = await env.DB.prepare(`SELECT count(*) c FROM records r ${w}`).bind(...bind).first<{ c: number }>();
  // The best-matching page of each file, as {page, text} with a short excerpt:
  // a phrase page, else an every-word page, else the best prefix page.
  const pageOf = `(SELECT json_object('page', page, 'text', snippet(record_fts, 2, '', '', '…', 14)) FROM record_fts
          WHERE record_fts MATCH ? AND record_id = r.id ORDER BY rank LIMIT 1)`;
  const ftsTiers = fts ? [...(tiers ? [tiers.phrase, tiers.exact] : []), fts] : [];
  const matchCol = fts ? `, coalesce(${ftsTiers.map(() => pageOf).join(", ")}, NULL) text_match` : "";
  const rows = await env.DB.prepare(
    `
    SELECT ${CARD_COLS}${matchCol}
    FROM records r ${join} ${w} ORDER BY ${order} LIMIT ? OFFSET ?`
  )
    .bind(...ftsTiers, ...joinBind, ...bind, ...orderBind, limit, offset)
    .all<Record<string, unknown>>();
  // text_match is SQLite's own json_object() output, so JSON.parse can't fail here.
  const records = fts
    ? rows.results.map(({ text_match, ...x }) => ({ ...x, match: text_match ? JSON.parse(String(text_match)) : null }))
    : rows.results;
  return json({ count: total?.c ?? 0, records });
}

// "NASA-UAP-D030" → ["NASA-UAP-D", 30, ""]; "NASA-UAP-D003A" → [.., 3, "A"].
// Ids without a trailing number, or with no prefix (pure numbers), have no series.
function seriesKey(id: string): [string, number, string] | null {
  const m = /^(.*\D)(\d+)([A-Za-z]*)$/.exec(id);
  return m ? [m[1], Number(m[2]), m[3]] : null;
}

async function seriesNav(env: Env, id: string) {
  const key = seriesKey(id);
  if (!key) return { prev: null, next: null, prevTitle: null, nextTitle: null, prevKind: null, nextKind: null };
  const rows = await env.DB.prepare("SELECT id, title, kind FROM records WHERE substr(id,1,?)=?")
    .bind(key[0].length, key[0])
    .all<{ id: string; title: string | null; kind: string }>();
  const sorted = rows.results
    .map((r) => [r, seriesKey(r.id)] as const)
    .filter(([, k]) => k && k[0] === key[0])
    .sort(([, a], [, b]) => a![1] - b![1] || a![2].localeCompare(b![2]))
    .map(([r]) => r);
  const i = sorted.findIndex((r) => r.id === id);
  const [p, n] = [sorted[i - 1], sorted[i + 1]];
  // Titles so the prev/next links read like every other file link (docTitleParts).
  return {
    prev: p?.id ?? null, next: n?.id ?? null, prevTitle: p?.title ?? null, nextTitle: n?.title ?? null,
    prevKind: p?.kind ?? null, nextKind: n?.kind ?? null,
  };
}

async function releaseOf(env: Env, record: { archive: string; doc_date: string | null }) {
  const date = record.archive === "wargov" && record.doc_date ? isoDate(record.doc_date) : null;
  if (!date) return null;
  const rel = (await wargovReleases(env)).find((r) => r.date === date);
  return rel ? { no: rel.no, date } : null;
}

// Related groups shown under a file, uapbrowser-style. "media" and "topic"
// come from record_links (crawler ingest.links): war.gov's own Related Media
// pairings, then files sharing rare names/terms in their title + summaries;
// the rest are a SQL filter on one field the record shares
// with others. A record lands in the first group it matches only, so the
// groups don't repeat each other.
type RecordRow = {
  id: string; archive: string; agency: string | null;
  location: string | null; incident_date: string | null; doc_date: string | null;
};
const RELATED_PER_GROUP = 6;
const RELATED_MEDIA_MAX = 48; // war.gov pairings are shown in full (largest is 43)

async function relatedOf(env: Env, r: RecordRow, release: { no: number } | null) {
  const year = yearOf(r.incident_date);
  const links = "record_links l JOIN records r ON r.id=l.related_id";
  const groups: { key: string; label: string; where: string; bind: unknown[]; from?: string; order?: string; max?: number }[] = [
    {
      key: "media", label: "war.gov pairing", from: links,
      where: "l.record_id=? AND l.source='official'", bind: [r.id], order: "r.id", max: RELATED_MEDIA_MAX,
    },
    {
      key: "topic", label: "title & summary match", from: links,
      where: "l.record_id=? AND l.source='topic'", bind: [r.id], order: "l.score DESC",
    },
  ];
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
        FROM ${g.from ?? "records r"} WHERE ${g.where} AND r.id<>?
        ORDER BY ${g.order ?? "r.featured DESC, r.created_at DESC"} LIMIT ?`
      )
        .bind(...g.bind, r.id, (g.max ?? RELATED_PER_GROUP) * 4)
        .all<{ id: string }>()
        // Related groups are optional: a failing one (e.g. code deployed before its
        // migration, 2026-10-02) drops that group instead of 500ing the whole doc.
        .catch((e) => {
          console.error("related group failed", g.key, r.id, e);
          return { results: [] as { id: string }[] };
        })
    )
  );
  const seen = new Set<string>();
  return groups
    .map((g, i) => ({
      key: g.key,
      label: g.label,
      records: rows[i].results.filter((x) => !seen.has(x.id) && seen.add(x.id)).slice(0, g.max ?? RELATED_PER_GROUP),
    }))
    .filter((g) => g.records.length);
}

// Archive filter options with global counts (not narrowed by other filters).
export async function recordFacets(_req: Request, env: Env) {
  const [f, { total: shorts }] = await Promise.all([facetCounts(env), queryShorts(env, { limit: 1 })]);
  return json({
    releases: f.releases.map(({ no, date, count }) => ({ no, date, count })),
    kinds: f.kinds,
    agencies: f.agencies,
    decades: f.decades,
    locations: f.locations,
    flags: f.flags,
    shorts,
  });
}

// Optional doc parts (newer tables, crawler JSON): a failure drops that part to its
// empty default instead of 500ing the whole doc (incident 2026-10-02).
function soft<T, E>(p: Promise<T>, what: string, id: string, empty: E): Promise<T | E> {
  return p.catch((e) => {
    console.error(`${what} failed`, id, e);
    return empty;
  });
}
function parseOr<T>(s: string, what: string, id: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch (e) {
    console.error(`${what} JSON malformed`, id, e);
    return null;
  }
}

// The doc detail object, shared by GET /api/records/:id and the Worker's
// pre-render of /doc/:id (lib/pages.ts). Null when the record doesn't exist.
export async function loadRecord(env: Env, id: string, origin: string) {
  const record = await env.DB.prepare("SELECT * FROM records WHERE id=?")
    .bind(id)
    .first<RecordRow>();
  if (!record) return null;
  const releaseP = releaseOf(env, record);
  const [assets, promoted, series, release, related, text, hubList, topicMap, tldrRow, articleRows] = await Promise.all([
    soft(env.DB.prepare("SELECT role,cdn_url,mime,width,height,duration,crop FROM assets WHERE record_id=?").bind(id).all(), "assets", id, { results: [] as Record<string, unknown>[] }),
    env.DB.prepare(
      `SELECT t.id,t.no,t.title,t.stance,t.votes,t.source_record_id,b.slug boardSlug,b.accent accent
                    FROM threads t JOIN boards b ON b.id=t.board_id WHERE t.source_record_id=?`
    )
      .bind(id)
      .all(),
    seriesNav(env, id),
    releaseP,
    releaseP.then((rel) => relatedOf(env, record, rel)),
    soft(
      env.DB.prepare("SELECT pages,truncated,total_pages,ai_summary,ai_sections FROM record_text WHERE record_id=?")
        .bind(id)
        .first<{ pages: string; truncated: number; total_pages: number; ai_summary: string | null; ai_sections: string | null }>(),
      "record_text", id, null
    ),
    // Hub links are optional garnish: a failing facet query must not break the doc.
    listHubsCached(env, origin).catch((e) => {
      console.error("hub list failed", e);
      return [];
    }),
    // Topic links are garnish too: a failing topic query must not break the doc.
    topicMembers(env, origin).catch((e) => {
      console.error("topic members failed", e);
      return {} as Record<string, string[]>;
    }),
    soft(
      env.DB.prepare("SELECT bullets,one_liner,card_url FROM record_tldr WHERE record_id=? AND lang='en'")
        .bind(id)
        .first<{ bullets: string; one_liner: string; card_url: string | null }>(),
      "record_tldr", id, null
    ),
    // Articles this record is evidence in (migration 0025), each with all its evidence rows.
    soft(
      env.DB.prepare(
        `SELECT a.slug, a.title, a.image_key, a.thread_id, e.record_id, e.t, e.page, e.label, e.image_key e_image
           FROM articles a JOIN article_records e ON e.slug=a.slug
          WHERE a.slug IN (SELECT slug FROM article_records WHERE record_id=?) ORDER BY a.created_at DESC, e.pos`
      )
        .bind(id)
        .all<ArticleRow>(),
      "articles", id, { results: [] as ArticleRow[] }
    ),
  ]);
  // Quality-filtered PDF text (crawler ingest.fulltext); null until extracted.
  // aiSummary from crawler ingest.summaries; null until generated.
  const pages = text && parseOr<{ n: number; text: string }[]>(text.pages, "record_text.pages", id);
  const fullText = text && pages
    ? { pages, truncated: !!text.truncated, total_pages: text.total_pages, aiSummary: text.ai_summary ?? null,
        aiSections: parseSections(text.ai_sections) }
    : null;
  // Funny-but-true TL;DR (crawler ingest.tldr); null until generated.
  const bullets = tldrRow && parseOr<string[]>(tldrRow.bullets, "record_tldr.bullets", id);
  const tldr = tldrRow && bullets ? { bullets, oneLiner: tldrRow.one_liner, cardUrl: tldrRow.card_url } : null;
  const live = new Set(hubList.map((h) => `${h.kind}/${h.slug}`));
  return {
    record, assets: assets.results, promotedThreads: promoted.results, series, release, related, fullText, tldr,
    articles: groupArticles(env, articleRows.results),
    hubs: hubsFor(record, release?.no ?? null, live),
    citedIn: Object.entries(CASE_STORY_TEXT)
      .filter(([, s]) => s.sources.some((x) => x.id === id))
      .map(([slug, s]) => ({ slug, title: s.title })),
    topics: TOPIC_RULES.filter((t) => {
      const m = topicMap[t.slug] ?? [];
      return m.length >= MIN_HUB_FILES && m.includes(id);
    }).map((t) => ({ slug: t.slug, label: t.label })),
  };
}

type ArticleRow = {
  slug: string; title: string; image_key: string | null; thread_id: string | null;
  record_id: string; t: number | null; page: number | null; label: string; e_image: string | null;
};

export type Article = {
  slug: string; title: string; image_url: string | null; thread_id: string | null;
  evidence: { id: string; t: number | null; page: number | null; label: string; image_url: string | null }[];
};

function groupArticles(env: Env, rows: ArticleRow[]): Article[] {
  const out = new Map<string, Article>();
  for (const r of rows) {
    const a = out.get(r.slug) ?? { slug: r.slug, title: r.title, image_url: uploadUrl(env, r.image_key), thread_id: r.thread_id, evidence: [] };
    a.evidence.push({ id: r.record_id, t: r.t, page: r.page, label: r.label, image_url: uploadUrl(env, r.e_image) });
    out.set(r.slug, a);
  }
  return [...out.values()];
}

export async function getRecord(req: Request, env: Env, p: Record<string, string>) {
  const data = await loadRecord(env, p.id, new URL(req.url).origin);
  if (!data) return error(404, "record not found");
  // Per-visitor, so it lives here and not in loadRecord (which also feeds the cached pre-render).
  const verdicts = await verdictState(req, env, p.id).catch((e) => {
    console.error("verdicts failed", e);
    return { mine: null, total: 0 };
  });
  return json({ ...data, verdicts });
}
