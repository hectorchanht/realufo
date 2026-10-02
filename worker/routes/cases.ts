import type { Env } from "../env";
import { json, error } from "../lib/json";
import { relAgo } from "../lib/db";

export async function getCase(_req: Request, env: Env, p: Record<string, string>) {
  const c = await env.DB.prepare("SELECT * FROM cases WHERE slug=?").bind(p.slug).first();
  if (!c) return error(404, "case not found");
  const { results } = await env.DB.prepare(
    `SELECT t.id,t.title,b.slug boardSlug,b.accent accent,t.reply_count replies,t.created_at
     FROM threads t JOIN boards b ON b.id=t.board_id WHERE t.case_slug=? ORDER BY t.created_at DESC LIMIT 20`
  )
    .bind(p.slug)
    .all<any>();
  const threads = results.map((t) => ({ ...t, ago: relAgo(t.created_at) }));
  return json({ case: c, threads, relatedThread: threads[0] ?? null });
}
