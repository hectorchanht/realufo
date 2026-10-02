import type { Env } from "../env";
import { json, error } from "../lib/json";
import { relAgo, stanceOK } from "../lib/db";
import { newId, newNo } from "../lib/anon";
import { allowWrite } from "../lib/ratelimit";
import { readBody, putImage, uploadUrl } from "../lib/upload";

// A comment targets either a record (record_id) or a cold case (case_slug);
// both surfaces share one shape. Column names are fixed literals, never input.
type Target = { col: "record_id" | "case_slug"; id: string; exists: string; missing: string };
const recordT = (id: string): Target => ({ col: "record_id", id, exists: "SELECT 1 FROM records WHERE id=?", missing: "record not found" });
const caseT = (id: string): Target => ({ col: "case_slug", id, exists: "SELECT 1 FROM cases WHERE slug=?", missing: "case not found" });

const view = (env: Env, c: any) => {
  const { image_r2_key, ...rest } = c;
  return { ...rest, ago: relAgo(c.created_at), handleShow: c.handle ? "!" + c.handle : null, image_url: uploadUrl(env, image_r2_key) };
};

async function list(env: Env, t: Target) {
  const r = await env.DB.prepare(
    `SELECT id,no,body,handle,stance,votes,image_r2_key,created_at FROM comments WHERE ${t.col}=? ORDER BY created_at DESC`
  )
    .bind(t.id)
    .all<any>();
  return json({ comments: r.results.map((c) => view(env, c)) });
}

async function create(req: Request, env: Env, t: Target) {
  const { b, image } = await readBody(req);
  const body = typeof b.body === "string" ? b.body.trim() : "";
  if (!body) return error(400, "empty body");
  if (!(await allowWrite(env, req, "comment"))) return error(429, "slow down — too many posts");
  if (!(await env.DB.prepare(t.exists).bind(t.id).first())) return error(404, t.missing);
  let image_r2_key: string | null = null;
  if (image) {
    const r = await putImage(env, image);
    if (r instanceof Response) return r;
    image_r2_key = r;
  }
  const id = newId();
  const no = newNo();
  const stance = stanceOK(b.stance);
  const handle = String(b.handle ?? "").trim() || null;
  const created_at = new Date().toISOString().slice(0, 19).replace("T", " ");
  await env.DB.prepare(`INSERT INTO comments(id,no,${t.col},body,handle,stance,votes,image_r2_key,created_at) VALUES(?,?,?,?,?,?,0,?,?)`)
    .bind(id, no, t.id, body, handle, stance, image_r2_key, created_at)
    .run();
  return json({ comment: view(env, { id, no, body, handle, stance, votes: 0, image_r2_key, created_at }) }, { status: 201 });
}

export const listComments = (_req: Request, env: Env, p: Record<string, string>) => list(env, recordT(p.id));
export const addComment = (req: Request, env: Env, p: Record<string, string>) => create(req, env, recordT(p.id));
export const listCaseComments = (_req: Request, env: Env, p: Record<string, string>) => list(env, caseT(p.slug));
export const addCaseComment = (req: Request, env: Env, p: Record<string, string>) => create(req, env, caseT(p.slug));
