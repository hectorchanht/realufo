// GET /api/timeline — sighting counts per incident year.
// Aggregates D1 `records.incident_date` (free text) through yearOf(), the same
// parser the Archive decade filter uses, so the counts match the facets.
import type { Env } from "../env";
import { json } from "../lib/json";
import { yearOf } from "../lib/facets";

export async function timeline(_req: Request, env: Env) {
  const [years, total] = await Promise.all([
    timelineYears(env),
    env.DB.prepare("SELECT count(*) c FROM records").first<{ c: number }>(),
  ]);
  const dated = years.reduce((s, y) => s + y.count, 0);
  const peak = years.reduce<{ year: number; count: number } | null>(
    (best, y) => (!best || y.count > best.count ? y : best),
    null
  );
  return json({
    years,
    dated,
    undated: Math.max(0, (total?.c ?? 0) - dated),
    peak,
    min: years.length ? years[0].year : null,
    max: years.length ? years[years.length - 1].year : null,
  });
}

/** Per-year sighting counts, oldest first — shared by the API route and the
 *  sitemap so both list exactly the years the timeline page charts. */
export async function timelineYears(env: Env): Promise<{ year: number; count: number }[]> {
  const dates = await env.DB.prepare(
    "SELECT incident_date d, count(*) n FROM records WHERE incident_date IS NOT NULL AND trim(incident_date) NOT IN ('','N/A') GROUP BY incident_date"
  ).all<{ d: string; n: number }>();
  const years = new Map<number, number>();
  for (const r of dates.results ?? []) {
    const y = yearOf(r.d);
    if (!y) continue;
    const yr = Number(y);
    years.set(yr, (years.get(yr) ?? 0) + r.n);
  }
  return [...years].sort(([a], [b]) => a - b).map(([year, count]) => ({ year, count }));
}
