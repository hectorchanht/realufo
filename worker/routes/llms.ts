import type { Env } from "../env";
import { hubHref } from "../lib/ssr";
import { hubTitle, type HubKind } from "../lib/hubs";
import { listHubsCached } from "./hubs";

const KINDS: [HubKind, string][] = [["release", "Releases"], ["agency", "Agencies"], ["location", "Locations"], ["decade", "Decades"]];

// llmstxt.org: a Markdown map of the site for LLMs. Built from the same cached
// hub list as the sitemap, so a new release shows up without a deploy.
export async function llms(req: Request, env: Env) {
  const origin = new URL(req.url).origin;
  const [hubs, counts] = await Promise.all([
    listHubsCached(env, origin),
    env.DB.prepare("SELECT kind, count(*) n FROM records WHERE status='live' GROUP BY kind").all<{ kind: string; n: number }>(),
  ]);
  const n = (k: string) => counts.results.find((c) => c.kind === k)?.n ?? 0;
  const total = counts.results.reduce((s, c) => s + c.n, 0);
  const link = (title: string, path: string, note?: string) => `- [${title}](${origin}${path})${note ? `: ${note}` : ""}`;
  const md = [
    "# RealUFO",
    "",
    `> Searchable archive of ${total} declassified UAP/UFO records (${n("pdf")} PDFs, ${n("video")} videos, ${n("image")} images) from the Pentagon (Department of War PURSUE releases), AARO, CIA, FBI, NASA and the National Archives, with full text, case files, a sighting map and anonymous discussion boards.`,
    "",
    "All files are public-domain U.S. government records mirrored verbatim. Each file has a page at `/doc/<file id>` (e.g. `/doc/DOW-UAP-D084`) with the official title, agency, incident date, location, release, official summary, an AI summary and the extracted full text. `/api/file/<file id>` serves the original PDF, video or image.",
    "",
    "## Main pages",
    "",
    link("Archive", "/archive", "search and filter every file"),
    link("Browse", "/browse", "files grouped by release, agency, location and decade"),
    link("Sighting map", "/map"),
    link("Boards", "/boards", "anonymous discussion; user posts, not official records"),
    link("Sitemap", "/sitemap.xml", "every file page"),
    "",
    ...KINDS.flatMap(([k, heading]) => {
      const hs = hubs.filter((h) => h.kind === k);
      return hs.length ? [`## ${heading}`, "", ...hs.map((h) => link(hubTitle(h), hubHref(h.kind, h.slug), `${h.count} files`)), ""] : [];
    }),
    "## Optional",
    "",
    link("Ask the Archive", "/ask", "AI answers with citations; can be wrong, check the cited files"),
    "",
  ].join("\n");
  return new Response(md, { headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
