// GET /api/timeline — sighting counts per incident year.
// Aggregates D1 `records.incident_date` (free text) through yearOf(), the same
// parser the Archive decade filter uses, so the counts match the facets.
import type { Env } from "../env";
import { json } from "../lib/json";
import { yearOf } from "../lib/facets";

export async function timeline(_req: Request, env: Env) {
  const [dates, total] = await Promise.all([
    env.DB.prepare(
      "SELECT incident_date d, count(*) n FROM records WHERE incident_date IS NOT NULL AND trim(incident_date) NOT IN ('','N/A') GROUP BY incident_date"
    ).all<{ d: string; n: number }>(),
    env.DB.prepare("SELECT count(*) c FROM records").first<{ c: number }>(),
  ]);
  const years = new Map<number, number>();
  for (const r of dates.results) {
    const y = yearOf(r.d);
    if (!y) continue;
    const yr = Number(y);
    years.set(yr, (years.get(yr) ?? 0) + r.n);
  }
  const sorted = [...years].sort(([a], [b]) => a - b).map(([year, count]) => ({ year, count }));
  const dated = sorted.reduce((s, y) => s + y.count, 0);
  const peak = sorted.reduce<{ year: number; count: number } | null>(
    (best, y) => (!best || y.count > best.count ? y : best),
    null
  );
  return json({
    years: sorted,
    dated,
    undated: Math.max(0, (total?.c ?? 0) - dated),
    peak,
    min: sorted.length ? sorted[0].year : null,
    max: sorted.length ? sorted[sorted.length - 1].year : null,
  });
}
