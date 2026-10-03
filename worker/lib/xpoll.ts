import type { Env } from "../env";
import { createPost, getPoll, XError, type XSecrets } from "./x";
import { withinBudget, sqlTime } from "./xpick";
import { secretsOf } from "./xbot";
import { parsePoll } from "../routes/polls";

// Spec 9: a story's question as a native X poll, posted as a reply under the story's X
// thread (polls can't carry media, so not on the head tweet). One path for new stories and
// the backfill: any story with a poll + a posted showcase head tweet + no X poll yet.
// X_POLLS gates it so nothing goes out before the operator OKs the questions.
export const POLL_MINUTES = 4320; // 3 days
export const POLL_COST = 0.015; // no link in the text: 0.2 with one (xpick costOf)
const REFRESH_MS = 20 * 3600_000;
const log = (o: Record<string, unknown>) => console.log(JSON.stringify({ xpoll: true, ...o }));

async function postNext(env: Env, s: XSecrets, now: Date) {
  const c = await env.DB.prepare(
    `SELECT a.slug, a.poll, x.tweet_id FROM articles a
     JOIN threads t ON t.id = a.thread_id
     JOIN x_posts x ON x.stream='showcase' AND x.ref=t.source_record_id AND x.status='posted' AND x.tweet_id IS NOT NULL
     LEFT JOIN poll_social p ON p.slug=a.slug AND p.platform='x'
     WHERE a.poll IS NOT NULL AND p.slug IS NULL
     ORDER BY a.created_at LIMIT 1`
  ).first<{ slug: string; poll: string; tweet_id: string }>();
  const poll = c && parsePoll(c.poll);
  if (!c || !poll) return;
  if (!(await withinBudget(env, POLL_COST, now, true))) return log({ budget: c.slug });
  // row first: a retry after an ambiguous failure can never post a second poll
  const ins = await env.DB.prepare(
    "INSERT INTO poll_social(slug,platform,status,created_at) VALUES (?,'x','pending',?) ON CONFLICT DO NOTHING RETURNING slug"
  ).bind(c.slug, sqlTime(now)).first();
  if (!ins) return;
  try {
    const id = await createPost(s, `${poll.q} 👇`, [], c.tweet_id, { options: poll.opts, duration_minutes: POLL_MINUTES });
    log({ posted: c.slug, tweet: id });
    await env.DB.prepare(
      "UPDATE poll_social SET status='posted', remote_id=?, closes_at=?, fetched_at=?, cost_usd=?, error=NULL WHERE slug=? AND platform='x'"
    ).bind(id, sqlTime(new Date(now.getTime() + POLL_MINUTES * 60_000)), sqlTime(now), POLL_COST, c.slug).run();
  } catch (e) {
    if (!(e instanceof XError)) {
      // network error after send: X may have created it → stays pending, fixed by hand, never re-posted
      await env.DB.prepare("UPDATE poll_social SET error=? WHERE slug=? AND platform='x'").bind(String(e).slice(0, 500), c.slug).run();
      return log({ ambiguous: c.slug, error: String(e).slice(0, 200) });
    }
    if (e.status === 401 || e.status === 402 || (e.status === 403 && !/duplicate/i.test(e.body))) {
      await env.DB.prepare("DELETE FROM poll_social WHERE slug=? AND platform='x'").bind(c.slug).run(); // nothing posted; retry later
      return log({ halted: c.slug, status: e.status });
    }
    await env.DB.prepare("UPDATE poll_social SET status='failed', error=? WHERE slug=? AND platform='x'").bind(String(e).slice(0, 500), c.slug).run();
    log({ failed: c.slug, status: e.status });
  }
}

// Open polls: re-read at most every 20 h. Past closes_at: read until X says closed (final).
async function refreshNext(env: Env, s: XSecrets, now: Date) {
  const r = await env.DB.prepare(
    `SELECT slug, remote_id FROM poll_social WHERE platform='x' AND status='posted' AND remote_id IS NOT NULL
     AND (fetched_at IS NULL OR fetched_at <= ?1 OR closes_at <= ?2) ORDER BY fetched_at LIMIT 1`
  ).bind(sqlTime(new Date(now.getTime() - REFRESH_MS)), sqlTime(now)).first<{ slug: string; remote_id: string }>();
  if (!r) return;
  try {
    const p = await getPoll(s, r.remote_id);
    if (!p) {
      await env.DB.prepare("UPDATE poll_social SET status='failed', error='no poll in response', fetched_at=? WHERE slug=? AND platform='x'")
        .bind(sqlTime(now), r.slug).run();
      return log({ noPoll: r.slug });
    }
    await env.DB.prepare("UPDATE poll_social SET counts=?, total=?, fetched_at=?, status=? WHERE slug=? AND platform='x'")
      .bind(JSON.stringify(p.counts), p.total, sqlTime(now), p.closed ? "closed" : "posted", r.slug).run();
  } catch (e) {
    // transient: bump fetched_at so one bad poll can't hog every tick's single read
    // ponytail: past closes_at a failing read retries every tick (one cheap read per 3 h)
    await env.DB.prepare("UPDATE poll_social SET fetched_at=?, error=? WHERE slug=? AND platform='x'").bind(sqlTime(now), String(e).slice(0, 500), r.slug).run();
    log({ readFailed: r.slug, error: String(e).slice(0, 200) });
  }
}

export async function pollTick(env: Env, now = new Date()) {
  if (env.FEATURE_X !== "on" || env.X_POLLS !== "on") return;
  const s = secretsOf(env);
  if (!s) return;
  await postNext(env, s, now);
  await refreshNext(env, s, now);
}
