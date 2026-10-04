import type { Env } from "../env";
import { esc } from "../lib/ssr";
import { docTitle } from "../lib/pages";

// RSS 2.0 of the newest live files. Feed readers probe /rss.xml, /feed, … and
// index.html advertises it via <link rel="alternate">.
export async function rss(req: Request, env: Env) {
  const origin = new URL(req.url).origin;
  const { results } = await env.DB.prepare(
    "SELECT id, kind, title, summary, created_at FROM records WHERE status='live' ORDER BY created_at DESC, id LIMIT 50",
  ).all<{ id: string; kind: string; title: string | null; summary: string | null; created_at: string }>();
  const date = (d: string) => new Date(d.replace(" ", "T") + "Z").toUTCString();
  const items = results.map((r) => {
    const link = `${origin}/doc/${encodeURIComponent(r.id)}`;
    return (
      `<item><title>${esc(docTitle(r.title ?? "", r.id, r.kind))}</title><link>${link}</link>` +
      `<guid isPermaLink="true">${link}</guid><pubDate>${date(r.created_at)}</pubDate>` +
      (r.summary ? `<description>${esc(r.summary)}</description>` : "") +
      `</item>`
    );
  });
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>` +
    `<title>RealUFO — Declassified UAP Archive</title><link>${origin}/</link>` +
    `<atom:link href="${origin}/rss.xml" rel="self" type="application/rss+xml"/>` +
    `<description>Newest declassified UAP/UFO files from war.gov, AARO, the National Archives and NASA.</description>` +
    `<language>en</language>${results[0] ? `<lastBuildDate>${date(results[0].created_at)}</lastBuildDate>` : ""}` +
    items.join("") +
    `</channel></rss>`;
  // application/xml, not rss+xml: Chrome downloads rss+xml (footer click "did nothing");
  // feed readers go by the body, and <link rel="alternate"> still says rss+xml.
  return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
