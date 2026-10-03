import type { Env } from "../env";
import { json, error } from "../lib/json";
import { relAgo, THREAD_THUMB_COLS } from "../lib/db";
import { withThreadThumb } from "../lib/upload";

export async function boardThreads(_req: Request, env: Env, p: Record<string, string>) {
  const board = await env.DB.prepare("SELECT * FROM boards WHERE id=?").bind(p.id).first();
  if (!board) return error(404, "board not found");
  const t = await env.DB.prepare(
    `SELECT t.*, b.slug boardSlug, b.accent accent, ${THREAD_THUMB_COLS} FROM threads t JOIN boards b ON b.id=t.board_id WHERE t.board_id=? ORDER BY t.created_at DESC`
  )
    .bind(p.id)
    .all<any>();
  return json({
    board,
    threads: t.results.map((x) => ({ ...withThreadThumb(env, x), ago: relAgo(x.created_at), tags: JSON.parse(x.tags || "[]") })),
  });
}
