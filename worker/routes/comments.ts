import type { Env } from "../env";
import { json, error } from "../lib/json";
import { relAgo, stanceOK } from "../lib/db";
import { newId, newNo } from "../lib/anon";

export async function listComments(_req: Request, env: Env, p: Record<string, string>) {
  const r = await env.DB.prepare(
    "SELECT id,no,body,handle,stance,votes,created_at FROM comments WHERE record_id=? ORDER BY created_at DESC"
  )
    .bind(p.id)
    .all<any>();
  return json({
    comments: r.results.map((c) => ({ ...c, ago: relAgo(c.created_at), handleShow: c.handle ? "!" + c.handle : null })),
  });
}

export async function addComment(req: Request, env: Env, p: Record<string, string>) {
  const exists = await env.DB.prepare("SELECT 1 FROM records WHERE id=?").bind(p.id).first();
  if (!exists) return error(404, "record not found");
  const b = await req.json<any>().catch(() => ({}));
  const body = typeof b.body === "string" ? b.body.trim() : "";
  if (!body) return error(400, "empty body");
  const id = newId();
  const no = newNo();
  const stance = stanceOK(b.stance);
  const handle = String(b.handle ?? "").trim() || null;
  const created_at = new Date().toISOString().slice(0, 19).replace("T", " ");
  await env.DB.prepare("INSERT INTO comments(id,no,record_id,body,handle,stance,votes,created_at) VALUES(?,?,?,?,?,?,0,?)")
    .bind(id, no, p.id, body, handle, stance, created_at)
    .run();
  return json(
    { comment: { id, no, body, handle, stance, votes: 0, created_at, ago: "now", handleShow: handle ? "!" + handle : null } },
    { status: 201 }
  );
}
