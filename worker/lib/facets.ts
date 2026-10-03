import type { Env } from "../env";

// war.gov doc_date is the release date ("7/10/26"); release N = rank of that
// date among all distinct war.gov release dates. Other archives have no
// numbered releases.
export function isoDate(mdy: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/.exec(mdy.trim());
  return m ? `20${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : null;
}

// All war.gov releases, oldest first: no, ISO date, the raw doc_date strings
// that map to it, and how many files it holds.
export async function wargovReleases(env: Env) {
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

// "October, 2023" / "2023" → "2023"; "9/8/21" → "2021", "12/30/47" → "1947"
// (two-digit years past this year are last century). Null when no year.
export function yearOf(d: string | null): string | null {
  if (!d) return null;
  const y4 = /\b(19|20)\d{2}\b/.exec(d);
  if (y4) return y4[0];
  const yy = /^\d{1,2}\/\d{1,2}\/(\d{2})$/.exec(d.trim());
  if (!yy) return null;
  return (Number(yy[1]) > new Date().getFullYear() % 100 ? "19" : "20") + yy[1];
}

export function decadeOf(d: string | null): number | null {
  const y = yearOf(d);
  return y ? Math.floor(Number(y) / 10) * 10 : null;
}

// Grouped counts behind the Archive filters (GET /api/records/facets) and the
// hub registry (routes/hubs.ts listHubs).
export async function facetCounts(env: Env) {
  const groupBy = (col: string) =>
    env.DB.prepare(
      `SELECT ${col} name, count(*) count FROM records WHERE ${col} IS NOT NULL AND trim(${col}) NOT IN ('','N/A')
       GROUP BY ${col} ORDER BY count DESC, name`
    ).all<{ name: string; count: number }>();
  const [releases, kinds, agencies, locations, dates, flags] = await Promise.all([
    wargovReleases(env),
    groupBy("kind"),
    groupBy("agency"),
    groupBy("location"),
    env.DB.prepare("SELECT incident_date d, count(*) n FROM records GROUP BY incident_date").all<{ d: string | null; n: number }>(),
    env.DB.prepare(
      `SELECT sum(redacted=1) redacted, sum(redacted=0) unredacted, sum(ai_moments IS NOT NULL) moments, sum(featured=1) featured,
         (SELECT count(*) FROM record_text) text, (SELECT count(*) FROM record_text WHERE ai_summary IS NOT NULL) ai
       FROM records`
    ).first<Record<"redacted" | "unredacted" | "moments" | "featured" | "text" | "ai", number>>(),
  ]);
  const decades = new Map<number, number>();
  for (const r of dates.results) {
    const dec = decadeOf(r.d);
    if (dec) decades.set(dec, (decades.get(dec) ?? 0) + r.n);
  }
  return {
    releases,
    kinds: kinds.results,
    agencies: agencies.results,
    locations: locations.results,
    decades: [...decades].sort(([a], [b]) => a - b).map(([decade, count]) => ({ decade, count })),
    flags: flags ?? { redacted: 0, unredacted: 0, moments: 0, featured: 0, text: 0, ai: 0 },
  };
}
