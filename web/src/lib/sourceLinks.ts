// Links back to the official source (crawler/source-links.py fills
// records.source_url). Shared by the doc page and the crawler HTML (worker/lib/ssr.ts).
// `page`: the PDF page being read; a direct .pdf source opens there too.
export function sourceLinks(r: { archive?: string; source_url?: string | null }, page?: number): { label: string; href: string }[] {
  const src = r.source_url || "";
  const at = (u: string) => (page && /\.pdf$/i.test(u.split(/[?#]/)[0]) ? `${u}#page=${page}` : u);
  if (r.archive === "wargov" || src.startsWith("https://www.dvidshub.net/")) {
    return [
      src.startsWith("https://www.dvidshub.net/") && { label: "DVIDS", href: src },
      // war.gov has no per-video page: its videos fall back to the release landing page
      r.archive === "wargov" && { label: "WAR.GOV", href: src.startsWith("https://www.war.gov/") ? at(src) : "https://www.war.gov/UFO/" },
    ].filter((l): l is { label: string; href: string } => !!l);
  }
  // any other official site, labelled by its host; our own mirror is not a source
  if (!src.startsWith("https://") || src.startsWith("https://assets.realufo.org/")) return [];
  return [{ label: new URL(src).hostname.replace(/^www\./, "").toUpperCase(), href: at(src) }];
}
