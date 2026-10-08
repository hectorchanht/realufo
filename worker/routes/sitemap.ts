import type { Env } from "../env";
import { CASE_STORY_TEXT } from "../lib/caseStoryText";
import { boardHref, hubHref, esc } from "../lib/ssr";
import { thumbSql, durationSql } from "../lib/db";
import { docTitle, isoDate } from "../lib/pages";
import { listHubsCached } from "./hubs";
import { askHref } from "../lib/ask";
import { timelineYears } from "./timeline";
import { PLACES, placeSlug, mapPlaces } from "../lib/places";

type Rec = {
  id: string; d: string; kind: string; title: string; summary: string | null; doc_date: string | null;
  thumb: string | null; dur: number | null; file: string | null;
};

// Video/image sitemap extensions: without them Search Console reports 0 discovered videos.
function media(r: Rec): string {
  if (!r.file) return "";
  if (r.kind === "image") return `<image:image><image:loc>${esc(r.file)}</image:loc></image:image>`;
  if (r.kind !== "video" || !r.thumb) return "";
  const title = docTitle(r.title, r.id, r.kind);
  return (
    `<video:video><video:thumbnail_loc>${esc(r.thumb)}</video:thumbnail_loc><video:title>${esc(title)}</video:title>` +
    `<video:description>${esc((r.summary || title).slice(0, 2048))}</video:description><video:content_loc>${esc(r.file)}</video:content_loc>` +
    (r.dur ? `<video:duration>${Math.round(r.dur)}</video:duration>` : "") +
    `<video:publication_date>${isoDate(r.doc_date) || r.d}</video:publication_date></video:video>`
  );
}

// Every crawlable SPA route. Pages render client-side from /api/*, which is why
// robots.txt must not disallow /api/. ponytail: single file, split into a
// sitemap index once records approach the 50k-URL limit.
export async function sitemap(req: Request, env: Env) {
  const origin = new URL(req.url).origin;
  const [records, threads, boards, cases, hubs, asks, years, locRows] = await Promise.all([
    env.DB.prepare(
      `SELECT r.id, date(r.created_at) d, r.kind, r.title, r.summary, r.doc_date, ${thumbSql("r.id")} thumb, ${durationSql("r.id")} dur,
         (SELECT cdn_url FROM assets a WHERE a.record_id=r.id AND a.role='full' LIMIT 1) file
       FROM records r WHERE r.status='live'`,
    ).all<Rec>(),
    env.DB.prepare(
      "SELECT t.id, date(COALESCE((SELECT max(created_at) FROM posts p WHERE p.thread_id=t.id), t.created_at)) d FROM threads t",
    ).all<{ id: string; d: string }>(),
    env.DB.prepare("SELECT slug id FROM boards").all<{ id: string }>(),
    env.DB.prepare("SELECT slug id FROM cases").all<{ id: string }>(),
    // Same cached list hub pages use, so no hub is listed before its page exists.
    listHubsCached(env, origin),
    // Shared Ask answers: one URL per question, its earliest public copy (same rule as the page's canonical).
    env.DB.prepare(
      "SELECT min(id) id, question, date(min(created_at)) d FROM ask_log WHERE public=1 AND answer IS NOT NULL GROUP BY lower(question)",
    ).all<{ id: number; question: string; d: string }>(),
    // Timeline years: exactly the years the /timeline chart shows.
    timelineYears(env),
    // Map places with live files, for /map/:place deep links.
    env.DB.prepare(
      "SELECT location, count(*) n FROM records WHERE status='live' AND location IS NOT NULL AND trim(location)<>'' GROUP BY location",
    ).all<{ location: string; n: number }>(),
  ]);
  // mapPlaces filters to count > 0 and needs no live-hub set for the sitemap.
  const { places } = mapPlaces(locRows.results ?? [], new Set());
  const loc = (path: string, d?: string, extra = "") =>
    `<url><loc>${origin}${path}</loc>${d ? `<lastmod>${d}</lastmod>` : ""}${extra}</url>`;
  const e = encodeURIComponent; // also encodes & < > so no XML escaping needed
  const urls = [
    ...["/", "/archive", "/boards", "/cases", "/map", "/timeline", "/browse", "/releases", "/shelf", "/newsletter", "/podcast", "/ask", "/privacy", "/terms", "/about", "/contact", "/faq"].map((p) => loc(p)),
    ...years.map((y) => loc(`/timeline/${y.year}`)),
    ...places.map((p) => loc(`/map/${placeSlug(p.name)}`)),
    ...records.results.map((r) => loc(`/doc/${e(r.id)}`, r.d, media(r))),
    ...threads.results.map((t) => loc(`/thread/${e(t.id)}`, t.d)),
    ...boards.results.map((b) => loc(boardHref(b.id))), // slug is "/uap/"; the URL is /board/uap
    ...cases.results.map((c) => loc(`/case/${e(c.id)}`, CASE_STORY_TEXT[c.id]?.updated)),
    ...hubs.map((h) => loc(hubHref(h.kind, h.slug))),
    ...asks.results.map((x) => loc(askHref(x.id, x.question), x.d)), // slug is [a-z0-9-] only
  ];
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${urls.join("")}</urlset>`,
    { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } },
  );
}
