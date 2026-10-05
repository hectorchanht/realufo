// Links back to the official source (crawler/source-links.py fills
// records.source_url). Shared by the doc page and the crawler HTML (worker/lib/ssr.ts).
// `page`: the PDF page being read; a direct .pdf source opens there too.
export function sourceLinks(r: { archive?: string; source_url?: string | null; title?: string }, page?: number): { label: string; href: string }[] {
  const src = r.source_url || "";
  const at = (u: string) => (page && /\.pdf$/i.test(u.split(/[?#]/)[0]) ? `${u}#page=${page}` : u);
  if (r.archive === "wargov" || src.startsWith("https://www.dvidshub.net/")) {
    return [
      src.startsWith("https://www.dvidshub.net/") && { label: "DVIDS", href: src },
      // war.gov's own file page: /UFO/#<title slug> opens that file's card (its titleToHash()).
      r.archive === "wargov" && { label: "WAR.GOV", href: `https://www.war.gov/UFO/${wargovHash(r.title)}` },
    ].filter((l): l is { label: string; href: string } => !!l);
  }
  // any other official site, labelled by its host; our own mirror is not a source
  if (!src.startsWith("https://") || src.startsWith("https://assets.realufo.org/")) return [];
  return [{ label: new URL(src).hostname.replace(/^www\./, "").toUpperCase(), href: at(src) }];
}

// Verbatim port of titleToHash() on www.war.gov/UFO/ (keys records by their CSV Title).
function wargovHash(title?: string): string {
  const h = String(title || "").trim().replace(/\s+/g, "-").replace(/[^A-Za-z0-9\-_]/g, "").replace(/-+/g, "-");
  return h ? `#${h}` : "";
}
