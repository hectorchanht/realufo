import type { Env } from "../env";
import { actorId, saltedHash } from "./anon";

const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");

/**
 * Sliding-window limiter. Returns true if the action is allowed (and records it),
 * false if the caller has hit the limit for this action in the window.
 * Counted per browser (X-Anon-Id) AND per client IP: the anon id is client-chosen,
 * so rotating it would otherwise bypass the limit. CF-Connecting-IP is set by
 * Cloudflare (absent only in local dev/tests) and stored salted-hashed, never raw.
 * Limits come from env (RATE_MAX / RATE_WINDOW_SEC) with safe defaults.
 */
export async function allowWrite(env: Env, req: Request, action: string): Promise<boolean> {
  const max = Number(env.RATE_MAX) || 20;
  const windowSec = Number(env.RATE_WINDOW_SEC) || 60;
  const since = fmt(Date.now() - windowSec * 1000);
  const keys: Array<[string, number]> = [[await actorId(req, env.ANON_SALT), max]];
  const ip = req.headers.get("CF-Connecting-IP");
  // ponytail: IP cap is 3x the per-browser cap so households/CGNAT sharing an IP
  // aren't starved; switch to the Workers rate-limit binding if abuse outgrows D1.
  if (ip) keys.push(["ip:" + (await saltedHash(ip, env.ANON_SALT)), max * 3]);
  for (const [actor, cap] of keys) {
    const row = await env.DB
      .prepare("SELECT count(*) c FROM rate_events WHERE actor_id=? AND action=? AND created_at>=?")
      .bind(actor, action, since)
      .first<{ c: number }>();
    if ((row?.c ?? 0) >= cap) return false;
  }
  const now = fmt(Date.now());
  await env.DB.batch(
    keys.map(([actor]) => env.DB.prepare("INSERT INTO rate_events(actor_id, action, created_at) VALUES(?,?,?)").bind(actor, action, now))
  );
  return true;
}
