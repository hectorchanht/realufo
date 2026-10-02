import type { Env } from "../env";
import { boardHref, hubHref } from "../lib/ssr";
import { listHubsCached } from "./hubs";

// Every crawlable SPA route. Pages render client-side from /api/*, which is why
// robots.txt must not disallow /api/. ponytail: single file, split into a
// sitemap index once records approach the 50k-URL limit.
export async function sitemap(req: Request, env: Env) {
  const origin = new URL(req.url).origin;
  const [records, threads, boards, cases, hubs] = await Promise.all([
    env.DB.prepare("SELECT id, date(created_at) d FROM records WHERE status='live'").all<{ id: string; d: string }>(),
    env.DB.prepare(
      "SELECT t.id, date(COALESCE((SELECT max(created_at) FROM posts p WHERE p.thread_id=t.id), t.created_at)) d FROM threads t",
    ).all<{ id: string; d: string }>(),
    env.DB.prepare("SELECT slug id FROM boards").all<{ id: string }>(),
    env.DB.prepare("SELECT slug id FROM cases").all<{ id: string }>(),
    // Same cached list hub pages use, so no hub is listed before its page exists.
    listHubsCached(env, origin),
  ]);
  const loc = (path: string, d?: string) =>
    `<url><loc>${origin}${path}</loc>${d ? `<lastmod>${d}</lastmod>` : ""}</url>`;
  const e = encodeURIComponent; // also encodes & < > so no XML escaping needed
  const urls = [
    ...["/", "/archive", "/boards", "/map", "/browse"].map((p) => loc(p)),
    ...records.results.map((r) => loc(`/doc/${e(r.id)}`, r.d)),
    ...threads.results.map((t) => loc(`/thread/${e(t.id)}`, t.d)),
    ...boards.results.map((b) => loc(boardHref(b.id))), // slug is "/uap/"; the URL is /board/uap
    ...cases.results.map((c) => loc(`/case/${e(c.id)}`)),
    ...hubs.map((h) => loc(hubHref(h.kind, h.slug))),
  ];
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}</urlset>`,
    { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } },
  );
}
