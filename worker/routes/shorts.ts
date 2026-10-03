import type { Env } from "../env";
import { json } from "../lib/json";
import { thumbSql } from "../lib/db";
import { clipIds } from "../lib/xpick";
import { ftsQuery, metaMatch } from "./records";

export type Short = { id: string; title: string | null; thumb: string | null; clip: string; showcase: boolean };
const MAX = 200;

// A Short = a live record with a 9:16 video in R2: an operator showcase Short
// (showcase/, scripts/publish.sh --showcase, wins) or the auto-cut twin (clips-v/).
// The object's existence is the flag — no D1 table. Order: showcase by newest
// post, showcase without a post row, then twins (portrait sources first — their
// twin is the whole picture — then newest). q = the archive search (metadata or
// page text) or, for showcase Shorts, every word in the posted text.
// Never throws: an R2/D1 error is an empty list (the feed must not fail).
export async function listShorts(env: Env, { q = "", limit = MAX }: { q?: string; limit?: number } = {}): Promise<Short[]> {
  try {
    const [showcase, twins] = await Promise.all([clipIds(env, "showcase/"), clipIds(env, "clips-v/")]);
    if (!showcase.length && !twins.length) return [];
    const where = ["r.status='live'", "(r.id IN (SELECT id FROM sc) OR r.id IN (SELECT id FROM cv))"];
    const bind: unknown[] = [JSON.stringify(showcase), JSON.stringify(twins)];
    q = q.trim();
    if (q) {
      const meta = metaMatch(q);
      const fts = ftsQuery(q);
      const text = meta.bind.length
        ? `EXISTS (SELECT 1 FROM x_posts x WHERE x.stream='showcase' AND x.ref=r.id AND ${meta.bind.map(() => "lower(x.text) LIKE ?").join(" AND ")})`
        : "0";
      where.push(`((${meta.sql})${fts ? " OR r.id IN (SELECT record_id FROM record_fts WHERE record_fts MATCH ?)" : ""} OR (r.id IN (SELECT id FROM sc) AND ${text}))`);
      bind.push(...meta.bind, ...(fts ? [fts] : []), ...meta.bind);
    }
    const { results } = await env.DB.prepare(
      `WITH sc(id) AS (SELECT value FROM json_each(?)), cv(id) AS (SELECT value FROM json_each(?))
       SELECT r.id, r.archive, r.title, ${thumbSql("r.id")} thumb,
         r.id IN (SELECT id FROM sc) showcase,
         CASE WHEN r.id IN (SELECT id FROM sc) THEN (SELECT max(x.created_at) FROM x_posts x WHERE x.stream='showcase' AND x.ref=r.id) END posted,
         (SELECT CAST(substr(a.crop, 1, instr(a.crop, ':') - 1) AS INT) < CAST(substr(a.crop, instr(a.crop, ':') + 1) AS INT)
            FROM assets a WHERE a.record_id=r.id AND a.role='full') portrait
       FROM records r WHERE ${where.join(" AND ")}
       ORDER BY showcase DESC, posted DESC, portrait DESC, r.created_at DESC, r.id DESC LIMIT ?`
    ).bind(...bind, Math.min(MAX, Math.max(1, limit || MAX)))
      .all<{ id: string; archive: string; title: string | null; thumb: string | null; showcase: number }>();
    return results.map(({ id, archive, title, thumb, showcase }) => ({
      id, title, thumb, showcase: !!showcase,
      clip: `https://assets.realufo.org/${showcase ? "showcase" : "clips-v"}/${archive}/${encodeURIComponent(id)}.mp4`,
    }));
  } catch {
    return [];
  }
}

// GET /api/shorts?q=&limit= — the Shorts player queue and the archive search strip.
export async function shorts(req: Request, env: Env) {
  const u = new URL(req.url);
  return json(await listShorts(env, { q: u.searchParams.get("q") ?? "", limit: Number(u.searchParams.get("limit")) || MAX }));
}
