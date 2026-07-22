import type { Env } from "../env";
import { json, error } from "../lib/json";
import { stanceOK } from "../lib/db";
import { newId, newNo, actorId } from "../lib/anon";
import { allowWrite } from "../lib/ratelimit";

export async function createPost(req: Request, env: Env, p: Record<string, string>) {
  const b = await req.json<any>().catch(() => ({}));
  const body = typeof b.body === "string" ? b.body.trim() : "";
  if (!body) return error(400, "empty body");
  const actor = await actorId(req, env.ANON_SALT);
  if (!(await allowWrite(env, actor, "post"))) return error(429, "slow down — too many posts");
  const t = await env.DB.prepare("SELECT 1 FROM threads WHERE id=?").bind(p.id).first();
  if (!t) return error(404, "thread not found");
  const id = newId();
  const no = newNo();
  const stance = stanceOK(b.stance);
  const handle = String(b.handle ?? "").trim() || null;
  const src = b.source_record_id || null;
  const imgLabel = b.image_label || null;
  const imgKind = imgLabel ? "placeholder" : null;
  const created_at = new Date().toISOString().slice(0, 19).replace("T", " ");
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO posts(id,no,thread_id,body,handle,stance,votes,source_record_id,image_kind,image_label,is_op,created_at) VALUES(?,?,?,?,?,?,0,?,?,?,0,?)`
    ).bind(id, no, p.id, body, handle, stance, src, imgKind, imgLabel, created_at),
    env.DB.prepare("UPDATE threads SET reply_count=reply_count+1 WHERE id=?").bind(p.id),
  ]);
  return json(
    {
      post: {
        id,
        no,
        thread_id: p.id,
        body,
        handle,
        stance,
        votes: 0,
        source_record_id: src,
        image_kind: imgKind,
        image_label: imgLabel,
        isOp: false,
        created_at,
        ago: "now",
      },
    },
    { status: 201 }
  );
}
