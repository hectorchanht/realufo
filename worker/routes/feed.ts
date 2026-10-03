import type { Env } from "../env";
import { json } from "../lib/json";
import { cropSql, durationSql, oneLinerSql, relAgo, thumbSql, THREAD_THUMB_COLS } from "../lib/db";
import { withThreadThumb } from "../lib/upload";
import { clipIds } from "../lib/xpick";

// Feed = live activity, not static flags:
//  - "Hot right now" records are ordered by their most recent comment or
//    verdict (the files people are actively weighing in on), falling back to
//    featured/newest.
//  - "Trending threads" = the 50 most recently active threads (latest
//    post/reply, else creation time), ranked by trendScore so a fresh reply
//    on a weak thread can't bury a well-voted thread with pictures.
export async function feed(_req: Request, env: Env) {
  // Activity = latest comment or verdict ('' sorts last in DESC; both are
  // "YYYY-MM-DD HH:MM:SS" strings).
  const featured = await env.DB.prepare(
    `SELECT r.id,r.archive,r.agency,r.title,r.summary,r.kind,r.redacted,
      ${thumbSql("r.id")} thumb, ${durationSql("r.id")} duration, ${cropSql("r.id")} crop, ${oneLinerSql("r.id")} oneLiner,
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
    LIMIT 50`
  ).all<any>();

  const now = Date.now();
  return json({
    featured: featured.results,
    clips: await feedClips(env),
    hot: hot.results
      .map((t: any) => withThreadThumb(env, t))
      .map((t: any) => ({ t, score: trendScore(t, now) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map(({ t }) => ({ ...t, ago: relAgo(t.lastPost || t.created_at) })),
  });
}

// "Short clips" row: every operator showcase Short (R2 showcase/, newest post first) leads,
// then the newest live videos that have a 9:16 twin in R2 (clips-v/ has no D1 row; the
// object's existence is the flag, same as the X bot's clips/). Among those, portrait
// videos (assets.crop w < h: phone clips padded to 16:9) lead — their twin is the whole picture.
// Never fails the feed: an R2/D1 error just hides the row.
export async function feedClips(env: Env) {
  try {
    const [showcase, ids] = await Promise.all([clipIds(env, "showcase/"), clipIds(env, "clips-v/")]);
    if (!showcase.length && !ids.length) return [];
    const { results } = await env.DB.prepare(
      `SELECT r.id, r.archive, r.title, ${thumbSql("r.id")} thumb, r.id IN (SELECT value FROM json_each(?1)) showcase FROM records r
       WHERE r.status='live' AND (r.id IN (SELECT value FROM json_each(?1)) OR r.id IN (SELECT value FROM json_each(?2)))
       ORDER BY (SELECT max(x.created_at) FROM x_posts x WHERE x.stream='showcase' AND x.ref=r.id AND r.id IN (SELECT value FROM json_each(?1))) DESC,
                showcase DESC,
                (SELECT CAST(substr(a.crop, 1, instr(a.crop, ':') - 1) AS INT) < CAST(substr(a.crop, instr(a.crop, ':') + 1) AS INT)
                 FROM assets a WHERE a.record_id=r.id AND a.role='full') DESC,
                r.created_at DESC, r.id DESC LIMIT ?3`
    ).bind(JSON.stringify(showcase), JSON.stringify(ids), 12 + showcase.length)
      .all<{ id: string; archive: string; title: string | null; thumb: string | null; showcase: number }>();
    return results.map(({ archive, showcase, ...r }) => ({
      ...r,
      clip: `https://assets.realufo.org/${showcase ? "showcase" : "clips-v"}/${archive}/${encodeURIComponent(r.id)}.mp4`,
    }));
  } catch {
    return [];
  }
}

// Hacker-News-style gravity: engagement over (age + 12)^1.5, age = hours since
// the thread's last activity. HN's +2h offset let a 5-minute-old reply on an
// empty thread outrank a well-voted pic thread from yesterday; +12h stops
// that while a new thread still overtakes stale ones within a few days.
// Tune the weights here.
const W_VOTE = 1, W_REPLY = 2, W_IMG = 1, PIC_BONUS = 3, AGE_OFFSET_H = 12, GRAVITY = 1.5;

export function trendScore(
  t: { votes?: number; reply_count?: number; img_count?: number; thumb?: string | null; lastPost?: string | null; created_at?: string },
  now: number
): number {
  const iso = t.lastPost || t.created_at || "";
  const at = Date.parse(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  const hours = Number.isNaN(at) ? 1e6 : Math.max(0, (now - at) / 3_600_000);
  const points = Math.max(0, t.votes ?? 0) * W_VOTE + (t.reply_count ?? 0) * W_REPLY +
    (t.img_count ?? 0) * W_IMG + (t.thumb ? PIC_BONUS : 0);
  // +1 so a brand-new thread with no engagement still beats an ancient one.
  return (points + 1) / Math.pow(hours + AGE_OFFSET_H, GRAVITY);
}
