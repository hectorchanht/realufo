import type { Env } from "../env";
import { json, error } from "../lib/json";
import { relAgo, stanceOK } from "../lib/db";
import { newId, newNo } from "../lib/anon";

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
        `SELECT id,agency,title,kind,(SELECT cdn_url FROM assets a WHERE a.record_id=records.id AND a.role='thumb' LIMIT 1) thumb FROM records WHERE id=?`
      )
        .bind(thread.source_record_id)
        .first()
    : null;
  const rows = await env.DB.prepare("SELECT * FROM posts WHERE thread_id=? ORDER BY is_op DESC, created_at ASC")
    .bind(p.id)
    .all<any>();
  const posts = rows.results.map((x) => ({
    ...x,
    isOp: !!x.is_op,
    ago: relAgo(x.created_at),
    handleShow: x.handle ? "!" + x.handle : null,
    reply_to: JSON.parse(x.reply_to || "[]"),
  }));
  return json({ thread, sourceRecord, posts });
}

export async function createThread(req: Request, env: Env) {
  const b = await req.json<any>().catch(() => ({}));
  const op_body = typeof b.op_body === "string" ? b.op_body.trim() : "";
  if (!op_body) return error(400, "empty body");
  const board = b.board || "uap";
  const boardRow = await env.DB.prepare("SELECT slug, accent FROM boards WHERE id=?").bind(board).first<any>();
  if (!boardRow) return error(400, "unknown board");
  const src = b.source_record_id || null;
  const title = (String(b.title ?? "").trim() || op_body.split("\n")[0].slice(0, 70) || "Untitled thread").slice(0, 120);
  const id = "ut_" + newId();
  const no = newNo();
  const stance = stanceOK(b.stance);
  const handle = String(b.handle ?? "").trim() || null;
  const opId = newId();
  const created_at = new Date().toISOString().slice(0, 19).replace("T", " ");
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO threads(id,no,board_id,title,stance,op_body,op_handle,op_id,tags,votes,reply_count,img_count,source_record_id,hot,created_at) VALUES(?,?,?,?,?,?,?,?,'[]',0,0,0,?,0,?)`
    ).bind(id, no, board, title, stance, op_body, handle, opId, src, created_at),
    env.DB.prepare(
      `INSERT INTO posts(id,no,thread_id,body,handle,stance,votes,source_record_id,is_op,created_at) VALUES(?,?,?,?,?,?,0,?,1,?)`
    ).bind(opId, no, id, op_body, handle, stance, src, created_at),
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
        img_count: 0,
        source_record_id: src,
        created_at,
        ago: "now",
      },
    },
    { status: 201 }
  );
}
