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
// robots.txt must not disallow /api/. /sitemap.xml stays the full urlset (the
// URL submitted to GSC in 2026-10); the same data is also served as per-type
// child sitemaps under a /sitemap-index.xml so Search Console can report
// indexation per page family (2026-11-05 SEO pass: 809 of 877 unindexed URLs
// were stuck in "Discovered – currently not indexed", and a single undiffer-
// entiated dump gives Google no priority signal and us no per-type view).
// Order inside the full set is deliberate: core pages, hubs and cases first
// (the pages that must be crawled first), then docs, then UGC/AI last.
const CORE_PAGES = ["/", "/real-ufo", "/disclosure", "/archive", "/boards", "/cases", "/map", "/timeline", "/browse", "/releases", "/shelf", "/newsletter", "/podcast", "/ask", "/privacy", "/terms", "/about", "/contact", "/faq", "/glossary", "/pursue", "/foia", "/sites", "/leaderboard", "/developers"];
// Pages whose content changed in the 2026-11-05 SEO pass; honest lastmod so
// Google re-crawls them first. Bump when their content next changes.
const CORE_LASTMOD: Record<string, string> = { "/": "2026-11-05", "/real-ufo": "2026-11-05", "/disclosure": "2026-11-05" };
export type SitemapSection = "pages" | "hubs" | "docs" | "cases" | "threads";
export const SITEMAP_SECTIONS: SitemapSection[] = ["pages", "hubs", "docs", "cases", "threads"];

async function sitemapSections(req: Request, env: Env): Promise<Record<SitemapSection, string[]>> {
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
  return {
    pages: CORE_PAGES.map((p) => loc(p, CORE_LASTMOD[p])),
    hubs: [
      ...hubs.map((h) => loc(hubHref(h.kind, h.slug))),
      ...boards.results.map((b) => loc(boardHref(b.id))), // slug is "/uap/"; the URL is /board/uap
      ...years.map((y) => loc(`/timeline/${y.year}`)),
      ...places.map((p) => loc(`/map/${placeSlug(p.name)}`)),
    ],
    docs: records.results.map((r) => loc(`/doc/${e(r.id)}`, r.d, media(r))),
    cases: cases.results.map((c) => loc(`/case/${e(c.id)}`, CASE_STORY_TEXT[c.id]?.updated)),
    threads: [
      ...threads.results.map((t) => loc(`/thread/${e(t.id)}`, t.d)),
      ...asks.results.map((x) => loc(askHref(x.id, x.question), x.d)), // slug is [a-z0-9-] only
    ],
  };
}

const urlset = (urls: string[]) =>
  new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${urls.join("")}</urlset>`,
    { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } },
  );

export async function sitemap(req: Request, env: Env) {
  const s = await sitemapSections(req, env);
  return urlset([...s.pages, ...s.hubs, ...s.cases, ...s.docs, ...s.threads]);
}

export async function sitemapSection(req: Request, env: Env, section: SitemapSection) {
  const s = await sitemapSections(req, env);
  return urlset(s[section]);
}

export async function sitemapIndex(req: Request, env: Env) {
  const origin = new URL(req.url).origin;
  const items = SITEMAP_SECTIONS.map((s) => `<sitemap><loc>${origin}/sitemap-${s}.xml</loc></sitemap>`).join("");
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${items}</sitemapindex>`,
    { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } },
  );
}
