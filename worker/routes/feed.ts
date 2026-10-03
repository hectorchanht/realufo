import type { Env } from "../env";
import { json } from "../lib/json";
import { durationSql, oneLinerSql, relAgo, thumbSql, THREAD_THUMB_COLS } from "../lib/db";
import { withThreadThumb } from "../lib/upload";

// Feed = live activity, not static flags:
//  - "Hot right now" records are ordered by their most recent comment or
//    verdict (the files people are actively weighing in on), falling back to
//    featured/newest.
//  - "Trending threads" are ordered by their most recent post/reply (the
//    threads with real-time activity), falling back to thread creation time.
export async function feed(_req: Request, env: Env) {
  // Activity = latest comment or verdict ('' sorts last in DESC; both are
  // "YYYY-MM-DD HH:MM:SS" strings).
  const featured = await env.DB.prepare(
    `SELECT r.id,r.archive,r.agency,r.title,r.summary,r.kind,r.redacted,
      ${thumbSql("r.id")} thumb, ${durationSql("r.id")} duration, ${oneLinerSql("r.id")} oneLiner,
      (SELECT count(*) FROM comments c WHERE c.record_id=r.id) commentN,
      (SELECT count(*) FROM record_verdicts v WHERE v.record_id=r.id) verdictN,
      max(COALESCE((SELECT max(created_at) FROM comments c WHERE c.record_id=r.id),''),
          COALESCE((SELECT max(updated_at) FROM record_verdicts v WHERE v.record_id=r.id),'')) lastActive
    FROM records r
    ORDER BY lastActive DESC, r.featured DESC, r.created_at DESC
    LIMIT 6`
  ).all<any>();

  const hot = await env.DB.prepare(
    `SELECT t.*, b.slug boardSlug, b.accent accent, ${THREAD_THUMB_COLS},
      (SELECT max(created_at) FROM posts p WHERE p.thread_id=t.id) lastPost
    FROM threads t JOIN boards b ON b.id=t.board_id
    ORDER BY COALESCE((SELECT max(created_at) FROM posts p WHERE p.thread_id=t.id), t.created_at) DESC,
             t.votes DESC
    LIMIT 4`
  ).all<any>();

  return json({
    featured: featured.results,
    hot: hot.results.map((t: any) => ({ ...withThreadThumb(env, t), ago: relAgo(t.lastPost || t.created_at) })),
  });
}
