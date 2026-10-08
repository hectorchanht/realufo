import type { Env } from "../env";
import { hubHref } from "../lib/ssr";
import { MIN_HUB_FILES, hubTitle, type HubKind } from "../lib/hubs";
import { listHubsCached } from "./hubs";
import { DATASET_URL } from "../lib/profiles";
import { docTitle, isoDate } from "../lib/pages";

const KINDS: [HubKind, string][] = [["topic", "Topics"], ["release", "Releases"], ["agency", "Agencies"], ["location", "Locations"], ["decade", "Decades"]];

const kindCounts = (env: Env) =>
  env.DB.prepare("SELECT kind, count(*) n FROM records WHERE status='live' GROUP BY kind").all<{ kind: string; n: number }>();

// Shared opening of llms.txt and llms-full.txt (llmstxt.org: H1 + blockquote summary).
async function intro(env: Env) {
  const { results } = await kindCounts(env);
  const n = (k: string) => results.find((c) => c.kind === k)?.n ?? 0;
  const total = results.reduce((s, c) => s + c.n, 0);
  return [
    "# RealUFO",
    "",
    `> Searchable archive of ${total} declassified UAP/UFO records (${n("pdf")} PDFs, ${n("video")} videos, ${n("image")} images) from the Pentagon (Department of War PURSUE releases), AARO, CIA, FBI, NASA and the National Archives, with full text, case files, a sighting map and anonymous discussion boards.`,
    "",
    "All files are public-domain U.S. government records mirrored verbatim. Each file has a page at `/doc/<file id>` (e.g. `/doc/DOW-UAP-D084`) with the official title, agency, incident date, location, release, official summary, an AI summary and the extracted full text. `/api/file/<file id>` serves the original PDF, video or image. For PDFs, `/doc/<file id>/text` serves its full text page by page as Markdown, each page linked as `/doc/<file id>?p=N` (`?format=json` for JSON).",
    "",
  ];
}

const MD = { "content-type": "text/markdown; charset=utf-8", "cache-control": "public, max-age=3600" };

// llmstxt.org: a Markdown map of the site for LLMs. Built from the same cached
// hub list as the sitemap, so a new release shows up without a deploy.
export async function llms(req: Request, env: Env) {
  const origin = new URL(req.url).origin;
  const [hubs, head] = await Promise.all([listHubsCached(env, origin), intro(env)]);
  const link = (title: string, path: string, note?: string) => `- [${title}](${origin}${path})${note ? `: ${note}` : ""}`;
  const md = [
    ...head,
    "## Main pages",
    "",
    link("Archive", "/archive", "search and filter every file"),
    link("Browse", "/browse", "files grouped by release, agency, location and decade"),
    link("Release tracker", "/releases", "every Pentagon UFO file release, the gaps between them and the next-release estimate"),
    link("Sighting map", "/map"),
    link("Cold cases", "/cases", "famous cases and their records"),
    link("Boards", "/boards", "anonymous discussion; user posts, not official records"),
    link("About", "/about", "what RealUFO is and isn't"),
    link("FAQ", "/faq", "frequently asked questions about the archive"),
    link("Contact", "/contact", "email, issue tracker and social accounts"),
    link("Glossary", "/glossary", "UAP terms, agencies and file references"),
    link("FOIA", "/foia", "how to file freedom-of-information requests"),
    link("UFO Field Guide", "/sites", "the places behind the files: Roswell, Area 51, Marfa, Socorro, Rendlesham and more"),
    link("WTF Leaderboard", "/leaderboard", "the files the crowd finds hardest to explain, ranked by unexplained votes"),
    link("Sitemap", "/sitemap.xml", "every file page"),
    link("Full text of every file", "/llms-full.txt", "llms-full.txt, about 6 MB of Markdown"),
    `- [Open dataset](${DATASET_URL}): record metadata and page text as JSONL on Hugging Face`,
    link("Public API v1", "/api/v1/openapi.json", "read-only JSON API for developers; docs at /developers"),
    "",
    ...KINDS.flatMap(([k, heading]) => {
      const hs = hubs.filter((h) => h.kind === k);
      // Agency/location hubs need MIN_HUB_FILES files, so these lists don't sum to the total: say so.
      const partial = k === "agency" || k === "location" ? [`Only ${heading.toLowerCase()} with ${MIN_HUB_FILES}+ files have a page; filter the [Archive](${origin}/archive) for the rest.`, ""] : [];
      return hs.length ? [`## ${heading}`, "", ...partial, ...hs.map((h) => link(hubTitle(h), hubHref(h.kind, h.slug), `${h.count} files`)), ""] : [];
    }),
    "## Optional",
    "",
    link("Ask the Archive", "/ask", "AI answers with citations; can be wrong, check the cited files"),
    "",
  ].join("\n");
  return new Response(md, { headers: MD });
}

type FullRow = {
  id: string; title: string; agency: string | null; agency_full: string | null; kind: string; incident_date: string | null;
  location: string | null; doc_date: string | null; summary: string | null;
  ai_summary: string | null; ai_sections: string | null;
  one_liner: string | null; bullets: string | null;
};

const BATCH = 40; // summaries + outlines only (page text is linked), so a batch stays small

function fileMd(r: FullRow, origin: string): string {
  const facts = [
    ["Agency", r.agency_full || r.agency], ["Incident date", r.incident_date],
    ["Location", r.location && r.location !== "N/A" ? r.location : null],
    ["Released", isoDate(r.doc_date) ?? r.doc_date], ["Type", r.kind.toUpperCase()],
  ].filter(([, v]) => v).map(([k, v]) => `- ${k}: ${v}`);
  const secs = (() => {
    try {
      return JSON.parse(r.ai_sections ?? "null") as { from: number; to: number; text: string }[] | null;
    } catch {
      return null;
    }
  })();
  const label = (a: number, b: number) => (a === b ? `p. ${a}` : `pp. ${a}–${b}`);
  return [
    `## ${docTitle(r.title, r.id, r.kind)}`, "",
    `- Page: ${origin}/doc/${encodeURIComponent(r.id)}`, `- Original file: ${origin}/api/file/${encodeURIComponent(r.id)}`, ...facts, "",
    ...(r.one_liner && r.bullets ? ["### TL;DR", "", r.one_liner, "", ...(JSON.parse(r.bullets) as string[]).map((b) => `- ${b}`), ""] : []),
    ...(r.summary ? ["### Official summary", "", r.summary.trim(), ""] : []),
    ...(r.ai_summary ? [r.kind === "image" ? "### AI visual description" : "### AI summary", "", r.ai_summary.trim(), ""] : []),
    ...(secs?.length ? ["### In this file", "", ...secs.map((x) => `- ${label(x.from, x.to)}: ${x.text}`), ""] : []),
    ...(r.kind === "pdf" ? [`Full text: ${origin}/doc/${encodeURIComponent(r.id)}/text`, ""] : []),
    "",
  ].join("\n");
}

// Every file's facts, summaries and section outline in one Markdown document (page text linked),
// streamed in id-ordered batches so ~6 MB never sits in memory at once.
// ponytail: rebuilt from D1 on every request (~15 queries); put it behind the
// Cache API if crawlers hammer it.
export async function llmsFull(req: Request, env: Env) {
  const origin = new URL(req.url).origin;
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const w = writable.getWriter();
  const enc = new TextEncoder();
  (async () => {
    await w.write(enc.encode([...(await intro(env)), "This file holds every record's facts and summaries; each PDF's full text is linked. The index is at " + origin + "/llms.txt.", "", ""].join("\n")));
    for (let after = ""; ; ) {
      const { results } = await env.DB.prepare(
        `SELECT r.id,r.title,r.agency,r.agency_full,r.kind,r.incident_date,r.location,r.doc_date,r.summary,
           t.ai_summary,t.ai_sections,x.one_liner,x.bullets
         FROM records r LEFT JOIN record_text t ON t.record_id=r.id
           LEFT JOIN record_tldr x ON x.record_id=r.id AND x.lang='en'
         WHERE r.status='live' AND r.id > ? ORDER BY r.id LIMIT ${BATCH}`
      ).bind(after).all<FullRow>();
      if (!results.length) break;
      await w.write(enc.encode(results.map((r) => fileMd(r, origin)).join("")));
      after = results[results.length - 1].id;
    }
    await w.close();
  })().catch((e) => w.abort(e));
  return new Response(readable, { headers: MD });
}
