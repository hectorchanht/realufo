import type { Env } from "../env";
import { json } from "../lib/json";
import { relAgo } from "../lib/db";

export async function feed(_req: Request, env: Env) {
  const featured = await env.DB.prepare(
    `SELECT r.id,r.archive,r.agency,r.title,r.summary,r.kind,r.redacted,
      (SELECT cdn_url FROM assets a WHERE a.record_id=r.id AND a.role='thumb' LIMIT 1) thumb,
      (SELECT count(*) FROM comments c WHERE c.record_id=r.id) commentN
    FROM records r WHERE r.featured=1 LIMIT 6`
  ).all();

  const hot = await env.DB.prepare(
    `SELECT t.*, b.slug boardSlug, b.accent accent FROM threads t JOIN boards b ON b.id=t.board_id
    WHERE t.hot=1 ORDER BY t.votes DESC LIMIT 4`
  ).all<any>();

  return json({
    featured: featured.results.map((r: any) => ({ ...r, credible: 120 + (r.id.length * 7) % 380 })),
    hot: hot.results.map((t: any) => ({ ...t, ago: relAgo(t.created_at) })),
  });
}
