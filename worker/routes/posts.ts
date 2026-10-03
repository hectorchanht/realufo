import type { Env } from "../env";
import { json, error } from "../lib/json";
import { stanceOK } from "../lib/db";
import { newId, newNo, postActor } from "../lib/anon";
import { autoFollow } from "../lib/follows";
import { allowWrite } from "../lib/ratelimit";
import { readBody, putImage, uploadUrl } from "../lib/upload";

export async function createPost(req: Request, env: Env, p: Record<string, string>) {
  const { b, image } = await readBody(req);
  const body = typeof b.body === "string" ? b.body.trim() : "";
  if (!body) return error(400, "empty body");
  if (!(await allowWrite(env, req, "post"))) return error(429, "slow down — too many posts");
  const t = await env.DB.prepare("SELECT 1 FROM threads WHERE id=?").bind(p.id).first();
  if (!t) return error(404, "thread not found");
  const actor = await postActor(req, env);
  const op = await env.DB.prepare("SELECT actor_id FROM posts WHERE thread_id=? AND is_op=1").bind(p.id).first<{ actor_id: string | null }>();
  const id = newId();
  const no = newNo();
  const stance = stanceOK(b.stance);
  const handle = String(b.handle ?? "").trim() || null;
  const src = b.source_record_id || null;
  let imageKey: string | null = null;
  if (image) {
    const r = await putImage(env, image);
    if (r instanceof Response) return r;
    imageKey = r;
  }
  const imgKind = imageKey ? "upload" : null;
  const created_at = new Date().toISOString().slice(0, 19).replace("T", " ");
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO posts(id,no,thread_id,body,handle,stance,votes,source_record_id,image_r2_key,image_kind,is_op,created_at,actor_id) VALUES(?,?,?,?,?,?,0,?,?,?,0,?,?)`
    ).bind(id, no, p.id, body, handle, stance, src, imageKey, imgKind, created_at, actor),
    env.DB.prepare("UPDATE threads SET reply_count=reply_count+1, img_count=img_count+? WHERE id=?").bind(imageKey ? 1 : 0, p.id),
  ]);
  await autoFollow(env, actor, "thread", p.id);
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
        image_label: null,
        image_url: uploadUrl(env, imageKey),
        isOp: false,
        byOp: !!actor && actor === op?.actor_id,
        created_at,
        ago: "now",
      },
    },
    { status: 201 }
  );
}
