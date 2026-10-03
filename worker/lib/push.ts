// Push fan-out (spec 2026-10-03-realufo-pwa-push-design §2d). Every sender no-ops
// unless FEATURE_PUSH=on and the VAPID keys are set.
import type { Env } from "../env";
import { send, type PushSub } from "./webpush";
import { followUrl } from "./follows";

export interface PushMsg {
  title: string;
  body: string;
  url: string;
  tag: string;
}

const BATCH = 20;
// ponytail: Workers allow ~1000 subrequests per invocation, so one send reaches at most
// ~900 subscribers; move fan-out to Cloudflare Queues before the audience gets there.
const MAX_RECIPIENTS = 900;
const THROTTLE_MIN = 10;

export const pushOn = (env: Env) => env.FEATURE_PUSH === "on" && !!env.VAPID_PUBLIC_KEY && !!env.VAPID_PRIVATE_KEY;
export const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

export const getState = async (env: Env, k: string) =>
  (await env.DB.prepare("SELECT v FROM push_state WHERE k=?").bind(k).first<{ v: string }>())?.v ?? null;
export const setState = async (env: Env, k: string, v: string) => {
  await env.DB.prepare("INSERT INTO push_state(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(k, v).run();
};

export async function notify(env: Env, subs: PushSub[], msg: PushMsg): Promise<number> {
  const uniq = [...new Map(subs.map((s) => [s.endpoint, s])).values()].slice(0, MAX_RECIPIENTS);
  const m = { ...msg, title: clip(msg.title, 80), body: clip(msg.body, 100) };
  let ok = 0;
  for (let i = 0; i < uniq.length; i += BATCH) {
    const res = await Promise.all(uniq.slice(i, i + BATCH).map(async (s) => [s, await send(env, s, m)] as const));
    const stmts = res.map(([s, r]) =>
      r === "ok"
        ? env.DB.prepare("UPDATE push_subs SET fail_count=0 WHERE endpoint=? AND fail_count>0").bind(s.endpoint)
        : r === "gone"
          ? env.DB.prepare("DELETE FROM push_subs WHERE endpoint=?").bind(s.endpoint)
          : env.DB.prepare("UPDATE push_subs SET fail_count=fail_count+1 WHERE endpoint=?").bind(s.endpoint),
    );
    stmts.push(env.DB.prepare("DELETE FROM push_subs WHERE fail_count>=5"));
    await env.DB.batch(stmts);
    ok += res.filter(([, r]) => r === "ok").length;
  }
  return ok;
}

const TITLE_SQL = {
  thread: "SELECT title t FROM threads WHERE id=?",
  record: "SELECT id t FROM records WHERE id=?",
  case: "SELECT name t FROM cases WHERE slug=?",
};

// Someone posted on a followed thread/record/case.
export async function pushActivity(env: Env, kind: "thread" | "record" | "case", key: string, author: string | null, snippet: string) {
  if (!pushOn(env)) return;
  const { results: all } = await env.DB.prepare(
    `SELECT s.endpoint, s.p256dh, s.auth, s.actor_id FROM follows f JOIN push_subs s ON s.actor_id=f.actor_id
     WHERE f.kind=? AND f.key=? AND f.actor_id IS NOT ? AND (f.src='bell' OR s.replies=1)`,
  )
    .bind(kind, key, author)
    .all<PushSub & { actor_id: string }>();
  if (!all.length) return;
  // ≤1 push per target per recipient per 10 min: no phone buzzes more than once per
  // thread/record/case per 10 min, but nobody misses the first reply. Slots are claimed
  // only for real recipients, so an author-only or unfollowed target burns nothing.
  // ponytail: act:* rows accumulate in push_state; prune old ones if the table grows.
  const prefix = `act:${kind}:${key}:`;
  const { results: won } = await env.DB.prepare(
    `INSERT INTO push_state(k,v) SELECT ? || value, datetime('now') FROM json_each(?) WHERE true
     ON CONFLICT(k) DO UPDATE SET v=excluded.v WHERE push_state.v <= datetime('now', '-${THROTTLE_MIN} minutes')
     RETURNING k`,
  )
    .bind(prefix, JSON.stringify([...new Set(all.map((s) => s.actor_id))]))
    .all<{ k: string }>();
  const ok = new Set(won.map((r) => r.k.slice(prefix.length)));
  const subs = all.filter((s) => ok.has(s.actor_id)).map(({ endpoint, p256dh, auth }) => ({ endpoint, p256dh, auth }));
  if (!subs.length) return;
  const name = (await env.DB.prepare(TITLE_SQL[kind]).bind(key).first<{ t: string }>())?.t ?? key;
  await notify(env, subs, {
    title: kind === "thread" ? `New reply in ${name}` : `New comment on ${name}`,
    body: snippet,
    url: followUrl(kind, key),
    tag: `${kind}:${key}`,
  });
}
