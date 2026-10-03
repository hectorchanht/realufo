// Links back to the official source (crawler/source-links.py fills
// records.source_url). Shared by the doc page and the crawler HTML (worker/lib/ssr.ts).
export function sourceLinks(r: { archive?: string; source_url?: string | null }): { label: string; href: string }[] {
  const src = r.source_url || "";
  return [
    src.startsWith("https://www.dvidshub.net/") && { label: "DVIDS", href: src },
    // war.gov has no per-video page: its videos fall back to the release landing page
    r.archive === "wargov" && { label: "WAR.GOV", href: src.startsWith("https://www.war.gov/") ? src : "https://www.war.gov/UFO/" },
  ].filter((l): l is { label: string; href: string } => !!l);
}
