import type { Env } from "../env";
import { json, error } from "../lib/json";
import { relAgo, stanceOK, thumbSql, THREAD_THUMB_COLS } from "../lib/db";
import { newId, newNo } from "../lib/anon";
import { allowWrite } from "../lib/ratelimit";
import { readBody, putImage, uploadUrl, UPLOAD_NAME_RE, withThreadThumb } from "../lib/upload";

export async function getThread(_req: Request, env: Env, p: Record<string, string>) {
  const thread = await env.DB.prepare(
    `SELECT t.*, b.slug boardSlug, b.accent accent FROM threads t JOIN boards b ON b.id=t.board_id WHERE t.id=?`
  )
    .bind(p.id)
    .first<any>();
  if (!thread) return error(404, "thread not found");
  thread.tags = JSON.parse(thread.tags || "[]");
  thread.ago = relAgo(thread.created_at);
  const sourceRecord = thread.source_record_id
    ? await env.DB.prepare(
        `SELECT id,agency,title,kind,${thumbSql("records.id")} thumb FROM records WHERE id=?`
      )
        .bind(thread.source_record_id)
        .first()
    : null;
  const sourceCase = thread.case_slug
    ? await env.DB.prepare("SELECT slug,name,accent FROM cases WHERE slug=?").bind(thread.case_slug).first()
    : null;
  const rows = await env.DB.prepare("SELECT * FROM posts WHERE thread_id=? ORDER BY is_op DESC, created_at ASC")
    .bind(p.id)
    .all<any>();
  const posts = rows.results.map((x) => ({
    ...x,
    isOp: !!x.is_op,
    ago: relAgo(x.created_at),
    handleShow: x.handle ? "!" + x.handle : null,
    image_url: uploadUrl(env, x.image_r2_key),
    reply_to: JSON.parse(x.reply_to || "[]"),
  }));
  return json({ thread, sourceRecord, sourceCase, posts });
}

// Global search: title/OP or any reply contains q (case-insensitive, LIKE
// wildcards escaped). ponytail: full LIKE scan, fine at board scale; move to
// FTS5 if threads/posts grow into the 100k range.
export async function searchThreads(req: Request, env: Env) {
  const q = (new URL(req.url).searchParams.get("q") || "").trim().toLowerCase();
  if (q.length < 2) return json({ threads: [] });
  const like = "%" + q.replace(/[\\%_]/g, "\\$&") + "%";
  const t = await env.DB.prepare(
    `SELECT t.*, b.slug boardSlug, b.accent accent, ${THREAD_THUMB_COLS} FROM threads t JOIN boards b ON b.id=t.board_id
     WHERE lower(coalesce(t.title,'')||' '||coalesce(t.op_body,'')) LIKE ?1 ESCAPE '\\'
        OR EXISTS (SELECT 1 FROM posts p WHERE p.thread_id=t.id AND lower(p.body) LIKE ?1 ESCAPE '\\')
     ORDER BY t.created_at DESC LIMIT 50`
  )
    .bind(like)
    .all<any>();
  return json({ threads: t.results.map((x) => ({ ...withThreadThumb(env, x), ago: relAgo(x.created_at), tags: JSON.parse(x.tags || "[]") })) });
}

export async function createThread(req: Request, env: Env) {
  const { b, image } = await readBody(req);
  const op_body = typeof b.op_body === "string" ? b.op_body.trim() : "";
  if (!op_body) return error(400, "empty body");
  if (!(await allowWrite(env, req, "thread"))) return error(429, "slow down — too many posts");
  const board = b.board || "uap";
  const boardRow = await env.DB.prepare("SELECT slug, accent FROM boards WHERE id=?").bind(board).first<any>();
  if (!boardRow) return error(400, "unknown board");
  let imageKey: string | null = null;
  if (image) {
    const r = await putImage(env, image);
    if (r instanceof Response) return r;
    imageKey = r;
  } else if (typeof b.image_ref === "string" && UPLOAD_NAME_RE.test(b.image_ref)) {
    // Promoting a comment: reuse its already-uploaded image instead of re-uploading.
    const key = "uploads/" + b.image_ref;
    if (await env.MEDIA.head(key)) imageKey = key;
  }
  const imgCount = imageKey ? 1 : 0;
  const src = b.source_record_id || null;
  const caseSlug = b.case_slug || null;
  const title = (String(b.title ?? "").trim() || op_body.split("\n")[0].slice(0, 70) || "Untitled thread").slice(0, 120);
  const id = "ut_" + newId();
  const no = newNo();
  const stance = stanceOK(b.stance);
  const handle = String(b.handle ?? "").trim() || null;
  const opId = newId();
  const created_at = new Date().toISOString().slice(0, 19).replace("T", " ");
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO threads(id,no,board_id,title,stance,op_body,op_handle,op_id,tags,votes,reply_count,img_count,source_record_id,case_slug,hot,created_at) VALUES(?,?,?,?,?,?,?,?,'[]',0,0,?,?,?,0,?)`
    ).bind(id, no, board, title, stance, op_body, handle, opId, imgCount, src, caseSlug, created_at),
    env.DB.prepare(
      `INSERT INTO posts(id,no,thread_id,body,handle,stance,votes,source_record_id,image_r2_key,image_kind,is_op,created_at) VALUES(?,?,?,?,?,?,0,?,?,?,1,?)`
    ).bind(opId, no, id, op_body, handle, stance, src, imageKey, imageKey && "upload", created_at),
  ]);
  return json(
    {
      thread: {
        id,
        no,
        board_id: board,
        boardSlug: boardRow.slug,
        accent: boardRow.accent,
        title,
        stance,
        op_body,
        op_handle: handle,
        op_id: opId,
        tags: [],
        votes: 0,
        reply_count: 0,
        img_count: imgCount,
        source_record_id: src,
        created_at,
        ago: "now",
      },
    },
    { status: 201 }
  );
}
