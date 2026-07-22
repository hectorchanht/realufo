import type { Env } from "../env";
import { json } from "../lib/json";

export async function bootstrap(_req: Request, env: Env) {
  const [archives, boards, statsRow, ticker, sightings, cases] = await Promise.all([
    env.DB.prepare("SELECT * FROM archives ORDER BY count DESC").all(),
    env.DB.prepare("SELECT * FROM boards").all(),
    env.DB.prepare("SELECT json FROM stats WHERE id=1").first<{ json: string }>(),
    env.DB.prepare("SELECT kind,board,text,ago FROM ticker ORDER BY sort").all(),
    env.DB.prepare("SELECT id,name,lat,lng,count,accent,case_slug FROM sightings").all(),
    env.DB.prepare("SELECT slug,name,accent,coord FROM cases").all(),
  ]);
  return json({
    archives: archives.results,
    boards: boards.results,
    stats: statsRow ? JSON.parse(statsRow.json) : {},
    ticker: ticker.results,
    sightings: sightings.results,
    cases: cases.results,
  });
}
