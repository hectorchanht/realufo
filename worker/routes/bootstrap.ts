import type { Env } from "../env";
import { json } from "../lib/json";
import { actorId } from "../lib/anon";
import { mapPlaces } from "../lib/places";
import { listHubsCached } from "./hubs";
import { snippet } from "../lib/ssr";
import { CASE_TITLE_ZH } from "../lib/caseStoryZh";

// App shell data. archives + stats are computed from ACTUAL records (no fake
// fillups): archives are filtered to those that really have records, with real
// counts; stats totals are counted live. `onlineNow` is a REAL presence count
// (distinct anon actors that loaded the app in the last 5 minutes) — this route
// is hit on every app load, so it doubles as the presence heartbeat.
export async function bootstrap(req: Request, env: Env) {
  // Presence heartbeat: bump this viewer's last_seen (best-effort; never blocks
  // the response on failure, e.g. table missing on an un-migrated dev DB).
  try {
    const actor = await actorId(req, env.ANON_SALT);
    await env.DB.prepare(
      "INSERT INTO presence(actor_id,last_seen) VALUES(?, datetime('now')) ON CONFLICT(actor_id) DO UPDATE SET last_seen=datetime('now')",
    )
      .bind(actor)
      .run();
  } catch {
    /* presence is non-critical */
  }
  const [archives, boards, statsRow, ticker, sightings, cases, totals, locRows, dateRows, online, hubs] = await Promise.all([
    env.DB.prepare(
      `SELECT a.id, a.label, a.flag, a.accent, a.coord,
              (SELECT count(*) FROM records r WHERE r.archive = a.id) AS count
       FROM archives a`,
    ).all<{ id: string; label: string; flag: string; accent: string; coord: string; count: number }>(),
    // Real per-board thread counts (no fake fillups). `online` is dropped from
    // the UI (there's no real per-board presence), returned as 0 for shape.
    env.DB
      .prepare(
        `SELECT b.id, b.slug, b.name, b.desc, b.accent, b.icon, 0 AS online,
                (SELECT count(*) FROM threads t WHERE t.board_id = b.id) AS thread_count
         FROM boards b`,
      )
      .all(),
    env.DB.prepare("SELECT json FROM stats WHERE id=1").first<{ json: string }>(),
    env.DB.prepare("SELECT kind,board,text,ago FROM ticker ORDER BY sort").all(),
    // Curated case pins only; the prototype's per-pin counts were fake, so they're dropped.
    env.DB.prepare("SELECT id,name,lat,lng,accent,case_slug FROM sightings WHERE case_slug IS NOT NULL").all(),
    env.DB.prepare("SELECT slug,name,accent,coord,coalesce(lede,'') lede FROM cases ORDER BY name").all<{ slug: string; name: string; lede: string }>(),
    env.DB
      .prepare(
        `SELECT (SELECT count(*) FROM records) records,
                (SELECT count(DISTINCT archive) FROM records) archives,
                (SELECT count(*) FROM records WHERE kind='video') videos,
                (SELECT count(*) FROM threads) threads,
                (SELECT count(*) FROM posts WHERE created_at >= date('now')) postsToday`,
      )
      .first<{ records: number; archives: number; videos: number; threads: number; postsToday: number }>(),
    env.DB
      .prepare(
        `SELECT location, count(*) n FROM records
         WHERE location IS NOT NULL AND trim(location) NOT IN ('','N/A')
         GROUP BY location ORDER BY n DESC`,
      )
      .all<{ location: string; n: number }>(),
    env.DB.prepare("SELECT incident_date FROM records WHERE incident_date IS NOT NULL AND incident_date != ''").all<{
      incident_date: string;
    }>(),
    // Real "online now": distinct actors seen in the last 5 min (.catch so an
    // un-migrated dev DB without the presence table still returns the app).
    env.DB
      .prepare("SELECT count(*) c FROM presence WHERE last_seen > datetime('now','-5 minutes')")
      .first<{ c: number }>()
      .catch(() => null),
    listHubsCached(env, new URL(req.url).origin),
  ]);

  const curated = statsRow ? (JSON.parse(statsRow.json) as Record<string, unknown>) : {};

  // Real "records by decade" from whatever 4-digit year we can read off the
  // incident date (messy free-text) — only decades that actually have data.
  const decadeCounts = new Map<number, number>();
  for (const r of dateRows.results) {
    const m = /(19|20)\d{2}/.exec(r.incident_date);
    if (!m) continue;
    const decade = Math.floor(Number(m[0]) / 10) * 10;
    decadeCounts.set(decade, (decadeCounts.get(decade) ?? 0) + 1);
  }
  const byDecade = [...decadeCounts.entries()].sort((a, b) => a[0] - b[0]).map(([d, n]) => [`${d}s`, n]);
  const topLocations = locRows.results.slice(0, 6).map((l) => [l.location, l.n]);
  const map = mapPlaces(locRows.results, new Set(hubs.filter((h) => h.kind === "location").map((h) => h.slug)));
  const years = [...decadeCounts.keys()];
  const yearsCovered = years.length ? `${Math.min(...years)}s–${Math.max(...years)}s` : curated.yearsCovered ?? "";

  const stats = {
    records: totals?.records ?? 0,
    archives: totals?.archives ?? 0,
    videos: totals?.videos ?? 0,
    threads: totals?.threads ?? 0,
    postsToday: totals?.postsToday ?? 0,
    onlineNow: online?.c ?? (curated.onlineNow as number) ?? 0,
    countries: byDecade.length ? topLocations.length : (curated.countries ?? 0),
    yearsCovered,
    byDecade,
    topLocations,
  };

  return json({
    archives: archives.results.filter((a) => a.count > 0).sort((a, b) => b.count - a.count),
    boards: boards.results,
    stats,
    ticker: ticker.results,
    sightings: sightings.results,
    places: map.places,
    unmappedFiles: map.unmapped,
    cases: cases.results.map((c) => ({ ...c, lede: snippet(c.lede), name_zh: CASE_TITLE_ZH[c.slug] ?? null })),
    features: { ask: env.FEATURE_ASK === "on", push: env.FEATURE_PUSH === "on" },
  });
}
