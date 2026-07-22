import type { Env } from "../env";
import { json, error } from "../lib/json";
import { actorId } from "../lib/anon";

// Fixed whitelist: target_type -> table name. Never build this map from
// request input — it's the only thing standing between `UPDATE ${table}`
// below and a SQL-injection-via-table-name bug.
const TBL: Record<string, string> = { thread: "threads", post: "posts", comment: "comments" };

export async function toggleVote(req: Request, env: Env) {
  const b = await req.json<any>().catch(() => ({}));
  const table = TBL[b.target_type];
  const targetId = b.target_id;
  // `TBL[...]` on a plain object literal resolves inherited Object.prototype
  // keys too — target_type:"constructor"/"toString"/"valueOf"/"__proto__"
  // returns a truthy function/object, which a bare `!table` check would let
  // through. Every legitimate TBL value is a string; every prototype leak is
  // not, so require `typeof table === "string"` to close that off.
  if (typeof table !== "string" || typeof targetId !== "string" || !targetId.trim()) return error(400, "bad target");

  const actor = await actorId(req, env.ANON_SALT);
  const existing = await env.DB.prepare("SELECT id FROM votes WHERE actor_id=? AND target_type=? AND target_id=?")
    .bind(actor, b.target_type, targetId)
    .first<{ id: number }>();

  let voted: boolean;
  if (existing) {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM votes WHERE id=?").bind(existing.id),
      env.DB.prepare(`UPDATE ${table} SET votes=votes-1 WHERE id=?`).bind(targetId),
    ]);
    voted = false;
  } else {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO votes(actor_id,target_type,target_id) VALUES(?,?,?)").bind(actor, b.target_type, targetId),
      env.DB.prepare(`UPDATE ${table} SET votes=votes+1 WHERE id=?`).bind(targetId),
    ]);
    voted = true;
  }

  const row = await env.DB.prepare(`SELECT votes FROM ${table} WHERE id=?`).bind(targetId).first<{ votes: number }>();
  return json({ voted, votes: row?.votes ?? 0 });
}
