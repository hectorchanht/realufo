// Topic hubs (spec 2026-10-03-realufo-topic-hubs-design): cross-release groups
// defined by rules over title / summary / agency, plus hand-fixed include /
// exclude ids from the membership audit. Pure, no imports (the SPA imports the
// types). Background text lives in topicText.ts.

export interface TopicRule { title?: string[]; summary?: string[]; agencies?: string[]; notTitle?: string[] }
export interface TopicDef { slug: string; label: string; title: string; rule: TopicRule; include?: string[]; exclude?: string[] }
export interface TopicSource { id: string; page?: number; note: string }
export interface TopicText { background: string; lore?: string; sources: TopicSource[] }
export interface TopicBlock {
  background: string; lore: string | null;
  sources: { id: string; page: number | null; note: string; title: string }[];
  stories: { slug: string; title: string; threadId: string | null }[];
}

// Registry order = display order (Browse, footer). Audit: spec appendix.
export const TOPIC_RULES: TopicDef[] = [
  { slug: "aawsap", label: "AAWSAP & DIRDs", title: "AAWSAP & the DIRD Reports", rule: { title: ["DIRD", "AAWSAP"], summary: ["AAWSAP"] } },
  { slug: "mission-reports", label: "Mission reports (MISREPs)", title: "Military Mission Reports (MISREPs)", rule: { title: ["Mission Report"], summary: ["Mission Report (MISREP)"] } },
  { slug: "flying-discs", label: "Flying discs, 1947–1950s", title: "Flying Disc Files, 1947–1950s", rule: { title: ["Flying Disc", "Flying Saucer"], summary: ["flying disc", "flying saucer"], notTitle: ["62-HQ-83894"] } },
  { slug: "apollo-nasa", label: "Apollo & NASA crews", title: "Apollo, Gemini & Skylab Crew Reports", rule: { title: ["Apollo", "Gemini", "Mercury", "Skylab"] } },
  { slug: "fbi-62-hq-83894", label: "FBI file 62-HQ-83894", title: "FBI Flying Disc File 62-HQ-83894", rule: { title: ["62-HQ-83894"] } },
  { slug: "project-blue-book", label: "Project Blue Book", title: "Project Blue Book Files", rule: { title: ["Blue Book"], summary: ["Project Blue Book"] } },
  { slug: "police", label: "Police & law enforcement", title: "Police & Law Enforcement UFO Reports", rule: { agencies: ["Local Law Enforcement"], title: ["police", "sheriff"] } },
  {
    slug: "nuclear-sites", label: "Nuclear sites & Los Alamos", title: "UFOs, Nuclear Sites & Los Alamos",
    rule: { summary: ["Los Alamos", "atomic", "nuclear"] },
    include: ["DOW-UAP-D094", "DOW-UAP-D017"],
    // D126: AAWSAP propulsion DIRD. CIA-UAP-D022: only its summary says "nuclear"
    // (an office description); the memo is about a missile range.
    exclude: ["DOW-UAP-D126", "CIA-UAP-D022"],
  },
  { slug: "aaro-case-resolutions", label: "AARO case resolutions", title: "AARO Case Resolutions", rule: { title: ["Case Resolution"] } },
  {
    slug: "congress", label: "Congress & hearings", title: "Congress, Hearings & the House Request",
    rule: { summary: ["eight members of the U.S. House", "open hearing"] },
    include: ["CONGRESS-CHRG-119hhrg61718", "USG-UAP-D001"],
    exclude: ["059uap00013"], // Mexican Congress cable
  },
];

export function topicWhere(rule: TopicRule): { sql: string; binds: string[] } {
  const any: string[] = [];
  const binds: string[] = [];
  for (const w of rule.title ?? []) {
    any.push("r.title LIKE ?");
    binds.push(`%${w}%`);
  }
  for (const w of rule.summary ?? []) {
    any.push("r.summary LIKE ?");
    binds.push(`%${w}%`);
  }
  if (rule.agencies?.length) {
    any.push("r.agency IN (SELECT value FROM json_each(?))");
    binds.push(JSON.stringify(rule.agencies));
  }
  if (!any.length) return { sql: "0", binds: [] };
  const parts = [`(${any.join(" OR ")})`];
  for (const w of rule.notTitle ?? []) {
    parts.push("coalesce(r.title,'') NOT LIKE ?");
    binds.push(`%${w}%`);
  }
  return { sql: parts.join(" AND "), binds };
}

export const validTopic = (t: TopicDef) =>
  !!(t.rule.title?.length || t.rule.summary?.length || t.rule.agencies?.length || t.include?.length);

// First sentence of a background, for meta descriptions. A sentence ends at
// ". " + capital — but not after an initialism or abbreviation ("U.S.", "No.").
export function firstSentence(text: string): string {
  const m = /^.*?[^A-Z.](?<!\bNo)\.(?=\s+[A-Z])/s.exec(text);
  return (m ? m[0] : text).trim();
}
