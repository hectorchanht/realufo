import type { Env } from "../env";
import { json, error } from "../lib/json";
import { relAgo } from "../lib/db";

export async function boardThreads(_req: Request, env: Env, p: Record<string, string>) {
  const board = await env.DB.prepare("SELECT * FROM boards WHERE id=?").bind(p.id).first();
  if (!board) return error(404, "board not found");
  const t = await env.DB.prepare(
    `SELECT t.*, b.slug boardSlug, b.accent accent FROM threads t JOIN boards b ON b.id=t.board_id WHERE t.board_id=? ORDER BY t.created_at DESC`
  )
    .bind(p.id)
    .all<any>();
  return json({
    board,
    threads: t.results.map((x) => ({ ...x, ago: relAgo(x.created_at), tags: JSON.parse(x.tags || "[]") })),
  });
}
