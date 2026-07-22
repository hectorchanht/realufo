import type { Env } from "../env";

const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");

/**
 * Sliding-window limiter. Returns true if the action is allowed (and records it),
 * false if the actor has hit the limit for this action in the window.
 * Limits come from env (RATE_MAX / RATE_WINDOW_SEC) with safe defaults.
 */
export async function allowWrite(env: Env, actorId: string, action: string): Promise<boolean> {
  const max = Number(env.RATE_MAX) || 20;
  const windowSec = Number(env.RATE_WINDOW_SEC) || 60;
  const since = fmt(Date.now() - windowSec * 1000);
  const row = await env.DB
    .prepare("SELECT count(*) c FROM rate_events WHERE actor_id=? AND action=? AND created_at>=?")
    .bind(actorId, action, since)
    .first<{ c: number }>();
  if ((row?.c ?? 0) >= max) return false;
  await env.DB
    .prepare("INSERT INTO rate_events(actor_id, action, created_at) VALUES(?,?,?)")
    .bind(actorId, action, fmt(Date.now()))
    .run();
  return true;
}
