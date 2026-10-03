// Push subscription + follow API (spec 2026-10-03-realufo-pwa-push-design §2b).
// Every call is scoped to the caller's salted anon id (X-Anon-Id).
import type { Env } from "../env";
import { json, error } from "../lib/json";
import { actorId } from "../lib/anon";
import { allowWrite } from "../lib/ratelimit";
import { b64u } from "../lib/webpush";
import { followUrl, hubLabel, type FollowKind } from "../lib/follows";

const pushOn = (env: Env) => env.FEATURE_PUSH === "on";
const PREFS = ["replies", "new_files", "daily"] as const;
// Charset/length, then a real decode: a P-256 point is 65 bytes starting 0x04, the auth secret 16.
const keysOk = (k: any) => {
  if (!b64(k?.p256dh, 80, 100) || !b64(k?.auth, 16, 32)) return false;
  try {
    const pub = b64u.dec(k.p256dh);
    return pub.length === 65 && pub[0] === 4 && b64u.dec(k.auth).length === 16;
  } catch {
    return false;
  }
};
const b64 = (s: unknown, min: number, max: number): s is string =>
  typeof s === "string" && s.length >= min && s.length <= max && /^[A-Za-z0-9_-]+$/.test(s);

async function body(req: Request): Promise<any> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

// Caller's actor id, or null when the request has no anon id (they'd all share "anon:none").
const caller = (req: Request, env: Env) => (req.headers.get("X-Anon-Id") ? actorId(req, env.ANON_SALT) : Promise.resolve(null));

async function owns(env: Env, actor: string | null, endpoint: unknown) {
  if (!actor || typeof endpoint !== "string") return false;
  return !!(await env.DB.prepare("SELECT 1 FROM push_subs WHERE endpoint=? AND actor_id=?").bind(endpoint, actor).first());
}

export function pushConfig(_req: Request, env: Env) {
  return pushOn(env) && env.VAPID_PUBLIC_KEY ? json({ publicKey: env.VAPID_PUBLIC_KEY }) : error(404, "push off");
}

// The endpoint is an unguessable capability URL only the subscribing browser knows,
// so whoever presents it owns it (upsert moves it to the caller; prefs are kept).
export async function subscribe(req: Request, env: Env) {
  if (!pushOn(env)) return error(404, "push off");
  const actor = await caller(req, env);
  if (!actor) return error(400, "missing anon id");
  const b = await body(req);
  const s = b.subscription ?? {};
  let url: URL | null = null;
  try {
    url = new URL(s.endpoint);
  } catch {
    // invalid
  }
  if (!url || url.protocol !== "https:" || String(s.endpoint).length > 1000) return error(400, "bad endpoint");
  if (!keysOk(s.keys)) return error(400, "bad keys");
  if (!(await allowWrite(env, req, "push"))) return error(429, "slow down");
  const p = b.prefs ?? {};
  const v = (k: string, d: number) => (typeof p[k] === "boolean" ? Number(p[k]) : d);
  await env.DB.prepare(
    `INSERT INTO push_subs(endpoint,actor_id,p256dh,auth,replies,new_files,daily) VALUES(?,?,?,?,?,?,?)
     ON CONFLICT(endpoint) DO UPDATE SET actor_id=excluded.actor_id, p256dh=excluded.p256dh, auth=excluded.auth, fail_count=0`,
  )
    .bind(s.endpoint, actor, s.keys.p256dh, s.keys.auth, v("replies", 1), v("new_files", 0), v("daily", 1))
    .run();
  return json({ ok: true });
}

export async function setPrefs(req: Request, env: Env) {
  if (!pushOn(env)) return error(404, "push off");
  const b = await body(req);
  if (!(await owns(env, await caller(req, env), b.endpoint))) return error(404, "not subscribed");
  const sets = PREFS.filter((k) => typeof b[k] === "boolean");
  if (!sets.length) return error(400, "nothing to set");
  await env.DB.prepare(`UPDATE push_subs SET ${sets.map((k) => `${k}=?`).join(",")} WHERE endpoint=?`)
    .bind(...sets.map((k) => Number(b[k])), b.endpoint)
    .run();
  return json({ ok: true });
}

// Works with push off too, so a browser can always clean up. Follows stay (cost nothing).
export async function unsubscribe(req: Request, env: Env) {
  const b = await body(req);
  if (!(await owns(env, await caller(req, env), b.endpoint))) return error(404, "not subscribed");
  await env.DB.prepare("DELETE FROM push_subs WHERE endpoint=?").bind(b.endpoint).run();
  return json({ ok: true });
}

export async function pushMe(req: Request, env: Env) {
  const actor = await caller(req, env);
  if (!actor) return json({ prefs: null, follows: [] });
  const endpoint = new URL(req.url).searchParams.get("endpoint");
  const sub = endpoint
    ? await env.DB.prepare("SELECT replies,new_files,daily FROM push_subs WHERE endpoint=? AND actor_id=?").bind(endpoint, actor).first<Record<string, number>>()
    : null;
  const { results } = await env.DB.prepare(
    `SELECT f.kind, f.key, f.src,
            CASE f.kind WHEN 'thread' THEN (SELECT title FROM threads WHERE id=f.key)
                        WHEN 'record' THEN (SELECT title FROM records WHERE id=f.key)
                        WHEN 'case' THEN (SELECT name FROM cases WHERE slug=f.key) END AS title
     FROM follows f WHERE f.actor_id=? ORDER BY f.created_at DESC LIMIT 200`,
  )
    .bind(actor)
    .all<{ kind: FollowKind; key: string; src: string; title: string | null }>();
  return json({
    prefs: sub && { replies: !!sub.replies, new_files: !!sub.new_files, daily: !!sub.daily },
    follows: results.map((r) => ({ kind: r.kind, key: r.key, src: r.src, title: r.title ?? hubLabel(r.key) ?? r.key, url: followUrl(r.kind, r.key) })),
  });
}

const EXISTS: Record<string, string> = {
  thread: "SELECT 1 FROM threads WHERE id=?",
  record: "SELECT 1 FROM records WHERE id=?",
  case: "SELECT 1 FROM cases WHERE slug=?",
};
async function targetExists(env: Env, kind: unknown, key: unknown) {
  if (typeof key !== "string" || typeof kind !== "string") return false;
  if (kind === "hub") return !!hubLabel(key);
  return !!EXISTS[kind] && !!(await env.DB.prepare(EXISTS[kind]).bind(key).first());
}

export async function getFollow(req: Request, env: Env) {
  const actor = await caller(req, env);
  const q = new URL(req.url).searchParams;
  const row = actor
    ? await env.DB.prepare("SELECT src FROM follows WHERE actor_id=? AND kind=? AND key=?").bind(actor, q.get("kind"), q.get("key")).first<{ src: string }>()
    : null;
  return json({ following: row?.src === "bell" });
}

export async function toggleFollow(req: Request, env: Env) {
  const actor = await caller(req, env);
  if (!actor) return error(400, "missing anon id");
  const b = await body(req);
  if (!(await targetExists(env, b.kind, b.key))) return error(404, "unknown target");
  if (!(await allowWrite(env, req, "follow"))) return error(429, "slow down");
  if (b.on)
    await env.DB.prepare("INSERT INTO follows(actor_id,kind,key,src) VALUES(?,?,?,'bell') ON CONFLICT(actor_id,kind,key) DO UPDATE SET src='bell'")
      .bind(actor, b.kind, b.key)
      .run();
  else await env.DB.prepare("DELETE FROM follows WHERE actor_id=? AND kind=? AND key=?").bind(actor, b.kind, b.key).run();
  return json({ following: !!b.on });
}
