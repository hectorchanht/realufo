// Release tracker data (spec 2026-10-03-realufo-release-tracker-design). One
// grouped query + wargovReleases(), memoized like the hub list.
import type { Env } from "../env";
import { json } from "../lib/json";
import { cachedJson } from "../lib/cache";
import { wargovReleases } from "../lib/facets";
import { AGENCY_HUBS } from "../lib/hubs";
import {
  kindsText, nextWindow, releaseFaq, releaseSeries, sizeLine, statusText, todayIso, trackerFaq, upcomingText,
  type CountRow, type ReleaseBlock, type ReleaseInfo, type TrackerData,
} from "../lib/releases";

// ponytail: 1h per colo like listHubsCached; a new drop shows up within the hour.
export const loadSeries = async (env: Env, origin: string): Promise<ReleaseInfo[]> =>
  (await cachedJson(`${origin}/__releases`, async () => {
    // Both entries are promises before Promise.all sees them: a synchronous
    // prepare() throw must not orphan the other (unhandled) rejection.
    const counts = async () =>
      (await env.DB.prepare(
        "SELECT doc_date, agency, kind, count(*) n FROM records WHERE archive='wargov' AND status='live' AND doc_date IS NOT NULL GROUP BY 1,2,3"
      ).all<CountRow>()).results;
    const [releases, rows] = await Promise.all([wargovReleases(env), counts()]);
    return releaseSeries(releases, rows, AGENCY_HUBS);
  })) ?? [];

export async function trackerData(env: Env, origin: string, today = todayIso()): Promise<TrackerData> {
  const series = await loadSeries(env, origin);
  const window = nextWindow(series, today);
  return { series, window, status: statusText(window), faq: trackerFaq(series, window) };
}

export async function releaseBlock(
  env: Env, origin: string, no: number, picks: { id: string; title: string }[], today = todayIso()
): Promise<ReleaseBlock | null> {
  const series = await loadSeries(env, origin);
  const i = series.findIndex((r) => r.no === no);
  if (i < 0) return null;
  const info = series[i];
  const prev = series[i - 1] ?? null;
  const next = series[i + 1] ?? null;
  const window = nextWindow(series, today);
  return {
    info, size: sizeLine(info, prev), kinds: kindsText(info.kinds),
    prev: prev && { no: prev.no, date: prev.date }, next: next && { no: next.no, date: next.date },
    upcoming: !next && window ? upcomingText(window) : null,
    faq: releaseFaq(info, series, window, picks),
  };
}

export async function releasesApi(req: Request, env: Env) {
  return json(await trackerData(env, new URL(req.url).origin), { headers: { "cache-control": "public, max-age=300" } });
}
