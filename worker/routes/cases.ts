import type { Env } from "../env";
import { json, error } from "../lib/json";
import { relAgo } from "../lib/db";
import { CASE_STORY_TEXT } from "../lib/caseStoryText";
import type { StoryView } from "../lib/caseStories";
import { docHref, docTitle } from "../lib/ssr";

// Sources resolved for rendering: realufo records → doc link + title (plain text if
// gone); outside → url (PDFs deep-linked to the cited page) + host label.
export async function storyView(env: Env, slug: string): Promise<StoryView | null> {
  const s = CASE_STORY_TEXT[slug];
  if (!s) return null;
  const ids = s.sources.flatMap((x) => (x.id ? [x.id] : []));
  const { results } = await env.DB.prepare("SELECT id,title,kind FROM records WHERE status='live' AND id IN (SELECT value FROM json_each(?))")
    .bind(JSON.stringify(ids))
    .all<{ id: string; title: string; kind: string }>();
  const byId = new Map(results.map((r) => [r.id, r]));
  return {
    ...s,
    sources: s.sources.map((x, i) => {
      const page = x.page ? ` — p. ${x.page}` : "";
      if (x.url) {
        const pdf = x.page && /\.pdf($|[?#])/i.test(x.url);
        return { n: i + 1, href: pdf ? `${x.url}#page=${x.page}` : x.url, label: `${new URL(x.url).host}${page}`, note: x.note, external: true };
      }
      const r = byId.get(x.id!);
      return r
        ? { n: i + 1, href: `${docHref(r.id)}${x.page ? `?p=${x.page}` : ""}`, label: `${docTitle(r.title, r.id, r.kind)}${page}`, note: x.note, external: false }
        : { n: i + 1, href: null, label: `realufo file ${x.id} (no longer available)`, note: x.note, external: false };
    }),
  };
}

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
  return json({ case: c, threads, relatedThread: threads[0] ?? null, story: await storyView(env, p.slug) });
}
