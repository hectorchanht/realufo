import type { Env } from "../env";
import { createPost, getPoll, XError, type XSecrets } from "./x";
import { withinBudget, sqlTime, SITE } from "./xpick";
import { boxFlow, graph, threadsBox, THREADS_API } from "./social/meta";
import { SocialError, type Sleep } from "./social/common";
import { secretsOf } from "./xbot";
import { parsePoll } from "../routes/polls";
import { createJob, NO_JOB } from "./jobs";
import { gateOn, preview } from "./gate";

// Spec 9: a story's question as a native X poll, posted as a reply under the story's X
// thread (polls can't carry media, so not on the head tweet). One path for new stories and
// the backfill: any story with a poll + a posted showcase head tweet + no X poll yet.
// X_POLLS gates it so nothing goes out before the operator OKs the questions.
export const POLL_MINUTES = 4320; // 3 days
export const POLL_COST = 0.015; // no link in the text: 0.2 with one (xpick costOf)
const REFRESH_MS = 20 * 3600_000;
// One poll per platform per cron slot, also when publish.sh fires /__tick every 30 s.
// 2.5 h, not 3: the next 3-hourly cron must still pass if it fires a little early.
const GAP_MS = 2.5 * 3600_000;
const spaced = async (env: Env, platform: "x" | "threads", now: Date) =>
  !(await env.DB.prepare("SELECT 1 FROM poll_social WHERE platform=? AND status!='failed' AND created_at > ? LIMIT 1")
    .bind(platform, sqlTime(new Date(now.getTime() - GAP_MS))).first());
const log = (o: Record<string, unknown>) => console.log(JSON.stringify({ xpoll: true, ...o }));

// With the gate on, a story's poll posts only after the owner approved the story or the poll.
const approvedPoll = (env: Env) => gateOn(env)
  ? `AND EXISTS (SELECT 1 FROM bot_jobs j WHERE j.ref=a.slug AND j.kind IN ('article','poll') AND j.status IN ('approved','posted') AND j.deleted_at IS NULL)`
  : "";

async function postNext(env: Env, s: XSecrets, now: Date) {
  if (!(await spaced(env, "x", now))) return;
  const { results } = await env.DB.prepare(
    `SELECT a.slug, a.poll, x.tweet_id FROM articles a
     JOIN threads t ON t.id = a.thread_id
     JOIN x_posts x ON x.stream='showcase' AND x.ref=t.source_record_id AND x.status='posted' AND x.tweet_id IS NOT NULL
     LEFT JOIN poll_social p ON p.slug=a.slug AND p.platform='x'
     WHERE a.poll IS NOT NULL AND p.slug IS NULL ${approvedPoll(env)}
     ORDER BY a.created_at`
  ).all<{ slug: string; poll: string; tweet_id: string }>();
  // an unparsable poll (hand-edited D1) is skipped, never allowed to block the stories after it
  const c = results.find((r) => parsePoll(r.poll));
  for (const r of results.slice(0, c ? results.indexOf(c) : results.length)) log({ badPoll: r.slug });
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
    // auth / credits / rate limit: nothing was posted → drop the row, a later tick retries (5xx may have posted: failed)
    if (e.status === 401 || e.status === 402 || e.status === 429 || (e.status === 403 && !/duplicate/i.test(e.body))) {
      await env.DB.prepare("DELETE FROM poll_social WHERE slug=? AND platform='x'").bind(c.slug).run();
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

// Threads: the app's token can't reply (no threads_manage_replies; probe 2026-10-03), so the
// poll is its own TEXT post with the story link, once the story itself is on Threads.
const LETTERS = ["a", "b", "c", "d"];
const errText = (e: unknown) => String(e).slice(0, 500);

async function threadsPostNext(env: Env, now: Date, sleep: Sleep) {
  if (!(await spaced(env, "threads", now))) return;
  const { results } = await env.DB.prepare(
    `SELECT a.slug, a.poll FROM articles a
     JOIN threads t ON t.id = a.thread_id
     JOIN x_posts x ON x.stream='showcase' AND x.ref=t.source_record_id
     JOIN social_posts sp ON sp.x_post_id=x.id AND sp.platform='threads' AND sp.status='posted' AND sp.deleted_at IS NULL
     LEFT JOIN poll_social p ON p.slug=a.slug AND p.platform='threads'
     WHERE a.poll IS NOT NULL AND p.slug IS NULL ${approvedPoll(env)}
     ORDER BY a.created_at`
  ).all<{ slug: string; poll: string }>();
  const c = results.find((r) => parsePoll(r.poll));
  const poll = c && parsePoll(c.poll);
  if (!c || !poll) return;
  const ins = await env.DB.prepare(
    "INSERT INTO poll_social(slug,platform,status,created_at) VALUES (?,'threads','pending',?) ON CONFLICT DO NOTHING RETURNING slug"
  ).bind(c.slug, sqlTime(now)).first();
  if (!ins) return;
  const done = (sql: string, ...v: unknown[]) => env.DB.prepare(sql).bind(...v, c.slug).run();
  try {
    const r = await boxFlow(await threadsBox(env, now), {
      media_type: "TEXT",
      text: `${poll.q} 👇\nFull story: ${SITE}/thread/ar_${c.slug}`,
      poll_attachment: JSON.stringify(Object.fromEntries(poll.opts.map((o, i) => [`option_${LETTERS[i]}`, o]))),
    }, { now, sleep }, "threads");
    // ponytail: a TEXT container still processing after boxFlow's ~60 s is marked failed (fix by hand); never seen for text
    if (!("remoteId" in r)) return void (await done("UPDATE poll_social SET status='failed', error=? WHERE slug=? AND platform='threads'", `container ${r.containerId} still processing`));
    log({ threads: c.slug, post: r.remoteId });
    await done("UPDATE poll_social SET status='posted', remote_id=?, fetched_at=? WHERE slug=? AND platform='threads'", r.remoteId, sqlTime(now));
  } catch (e) {
    if (!(e instanceof SocialError)) {
      await done("UPDATE poll_social SET error=? WHERE slug=? AND platform='threads'", errText(e)); // ambiguous: stays pending, never re-posted
      return log({ threadsAmbiguous: c.slug, error: errText(e) });
    }
    if (e.status === 429) return void (await done("DELETE FROM poll_social WHERE slug=? AND platform='threads'")); // nothing posted; retry later
    await done("UPDATE poll_social SET status='failed', error=? WHERE slug=? AND platform='threads'", errText(e));
    log({ threadsFailed: c.slug, error: errText(e) });
  }
}

// Same cadence as X. Threads returns 0-1 fractions per option + total_votes + expiry.
async function threadsRefreshNext(env: Env, now: Date) {
  const r = await env.DB.prepare(
    `SELECT p.slug, p.remote_id, a.poll FROM poll_social p JOIN articles a ON a.slug=p.slug
     WHERE p.platform='threads' AND p.status='posted' AND (p.fetched_at <= ?1 OR p.closes_at <= ?2) ORDER BY p.fetched_at LIMIT 1`
  ).bind(sqlTime(new Date(now.getTime() - REFRESH_MS)), sqlTime(now)).first<{ slug: string; remote_id: string; poll: string }>();
  const poll = r && parsePoll(r.poll);
  if (!r || !poll) return;
  const n = poll.opts.length;
  const fields = `poll_attachment{${LETTERS.slice(0, n).map((l) => `option_${l}_votes_percentage`).join(",")},total_votes,expiration_timestamp}`;
  try {
    const { token } = await threadsBox(env, now);
    const pa = (await graph(`${THREADS_API}/${r.remote_id}`, { fields, access_token: token }, "GET")).poll_attachment;
    if (!pa) throw new Error("no poll in response");
    const total = Number(pa.total_votes) || 0;
    const counts = LETTERS.slice(0, n).map((l) => Math.round((Number(pa[`option_${l}_votes_percentage`]) || 0) * total));
    const expires = pa.expiration_timestamp ? new Date(pa.expiration_timestamp) : null;
    await env.DB.prepare("UPDATE poll_social SET counts=?, total=?, fetched_at=?, closes_at=?, status=? WHERE slug=? AND platform='threads'")
      .bind(JSON.stringify(counts), total, sqlTime(now), expires && sqlTime(expires), expires && expires <= now ? "closed" : "posted", r.slug).run();
  } catch (e) {
    await env.DB.prepare("UPDATE poll_social SET fetched_at=?, error=? WHERE slug=? AND platform='threads'").bind(sqlTime(now), errText(e), r.slug).run();
    log({ threadsReadFailed: r.slug, error: errText(e) });
  }
}

// Gate: offer the oldest story poll that has no job yet (one open poll job at a time).
async function queuePolls(env: Env) {
  const r = await env.DB.prepare(
    `SELECT a.slug, a.poll, a.image_key FROM articles a
     LEFT JOIN poll_social p ON p.slug=a.slug AND p.platform='x'
     WHERE a.poll IS NOT NULL AND p.slug IS NULL AND ${NO_JOB("a.slug")}
     ORDER BY a.created_at LIMIT 1`
  ).first<{ slug: string; poll: string; image_key: string | null }>();
  const poll = r && parsePoll(r.poll);
  if (!r || !poll) return;
  const media = r.image_key ? { key: r.image_key, mime: "image/jpeg", size: 0 } : null;
  const caption = `${poll.q} 👇\n${poll.opts.map((o) => `• ${o}`).join("\n")}\n(posted as a reply under the story's head post; story: ${SITE}/thread/ar_${r.slug})`;
  const job = await createJob(env, { kind: "poll", stream: "poll", ref: r.slug, status: "post_wait", caption, media, payload: { slug: r.slug } });
  if (job) await preview(env, job);
}

export async function pollTick(env: Env, now = new Date(), sleep: Sleep = (ms) => new Promise((r) => setTimeout(r, ms))) {
  if (env.FEATURE_X !== "on" || env.X_POLLS !== "on") return; // X_POLLS = the story-poll switch for every platform
  if (gateOn(env)) await queuePolls(env).catch((e) => log({ queuePollsFailed: String(e).slice(0, 200) }));
  const s = secretsOf(env);
  if (s) {
    await postNext(env, s, now);
    await refreshNext(env, s, now);
  }
  if (env.FEATURE_SOCIAL_THREADS === "on" && env.THREADS_USER_ID) {
    await threadsPostNext(env, now, sleep);
    await threadsRefreshNext(env, now);
  }
}
