import type { Env } from "../env";
import { json } from "../lib/json";
import { relAgo } from "../lib/db";

// Feed = live activity, not static flags:
//  - "Hot right now" records are ordered by their most recent comment (the
//    files people are actively discussing), falling back to featured/newest.
//  - "Trending threads" are ordered by their most recent post/reply (the
//    threads with real-time activity), falling back to thread creation time.
export async function feed(_req: Request, env: Env) {
  const featured = await env.DB.prepare(
    `SELECT r.id,r.archive,r.agency,r.title,r.summary,r.kind,r.redacted,
      (SELECT cdn_url FROM assets a WHERE a.record_id=r.id AND a.role='thumb' LIMIT 1) thumb,
      (SELECT count(*) FROM comments c WHERE c.record_id=r.id) commentN,
      (SELECT max(created_at) FROM comments c WHERE c.record_id=r.id) lastComment
    FROM records r
    ORDER BY (lastComment IS NULL), lastComment DESC, r.featured DESC, r.created_at DESC
    LIMIT 6`
  ).all<any>();

  const hot = await env.DB.prepare(
    `SELECT t.*, b.slug boardSlug, b.accent accent,
      (SELECT max(created_at) FROM posts p WHERE p.thread_id=t.id) lastPost
    FROM threads t JOIN boards b ON b.id=t.board_id
    ORDER BY COALESCE((SELECT max(created_at) FROM posts p WHERE p.thread_id=t.id), t.created_at) DESC,
             t.votes DESC
    LIMIT 4`
  ).all<any>();

  return json({
    featured: featured.results.map((r: any) => ({ ...r, credible: 120 + (r.id.length * 7) % 380 })),
    hot: hot.results.map((t: any) => ({ ...t, ago: relAgo(t.lastPost || t.created_at) })),
  });
}
