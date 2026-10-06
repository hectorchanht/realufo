// Case stories (spec 2026-10-03-realufo-case-stories-design): types and the
// citation helpers shared by the Worker and the SPA. Import-free on purpose;
// the researched text lives in caseStoryText.ts (Worker-only, never bundled).

export interface StorySource { id?: string; url?: string; page?: number; note: string }
export interface StorySection { heading: string; paras: string[]; quote?: { text: string; who: string; src: number } }
export interface CaseStory {
  title: string;
  sections: StorySection[];
  timeline: { date: string; event: string; src?: number }[];
  sources: StorySource[]; // 1-based; text cites [n]
  updated: string; // ISO date of the fact-check
}
// What the page renders: sources resolved to links (null href = record gone).
export interface StoryView extends Omit<CaseStory, "sources"> {
  sources: { n: number; href: string | null; label: string; note: string; external: boolean }[];
  /** Traditional Chinese title (lib/caseStoryZh.ts); null when untranslated. */
  titleZh: string | null;
}

export const CASE_SLUGS = [
  "roswell", "kaikoura", "jal-1628", "tehran", "socorro", "travis-walton",
  "shag-harbour", "ohare-2006", "stephenville", "trans-en-provence", "manises", "falcon-lake",
  // batch 2 (spec 2026-10-03-realufo-case-stories-batch2-design)
  "belgian-wave", "cash-landrum", "coyne", "gimbal", "phoenix-lights", "tic-tac", "operacao-prato",
  "trindade", "varginha", "el-bosque", "valensole", "chiles-whitted", "condon-committee", "levelland",
  "lubbock-lights", "mantell", "mcminnville", "robertson-panel", "cosford", "rendlesham",
];

// "[n]" with 1 ≤ n ≤ max becomes a citation; any other bracket ("[sic]", "[9]") stays text.
export function citeParts(text: string, max: number): (string | { n: number })[] {
  const out: (string | { n: number })[] = [];
  let buf = "";
  for (const part of text.split(/(\[\d+\])/)) {
    const m = /^\[(\d+)\]$/.exec(part);
    const n = m ? Number(m[1]) : 0;
    if (m && n >= 1 && n <= max) {
      if (buf) out.push(buf);
      buf = "";
      out.push({ n });
    } else buf += part;
  }
  if (buf) out.push(buf);
  return out;
}

const markers = (t: string) => [...t.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));

export function citedSources(s: CaseStory): Set<number> {
  const set = new Set<number>();
  for (const sec of s.sections) {
    for (const p of sec.paras) markers(p).forEach((n) => set.add(n));
    if (sec.quote) set.add(sec.quote.src);
  }
  for (const t of s.timeline) if (t.src) set.add(t.src);
  return set;
}

export const storyWords = (s: CaseStory) =>
  s.sections.flatMap((x) => [...x.paras, x.quote?.text ?? ""]).join(" ").split(/\s+/).filter(Boolean).length;

export function storyProblems(slug: string, s: CaseStory): string[] {
  const p: string[] = [];
  const max = s.sources.length;
  if (!CASE_SLUGS.includes(slug)) p.push(`${slug} is not a batch case slug`);
  for (const n of citedSources(s)) if (n < 1 || n > max) p.push(`[${n}] has no source`);
  const cited = citedSources(s);
  s.sources.forEach((src, i) => {
    const n = i + 1;
    if (!cited.has(n)) p.push(`source ${n} is never cited`);
    if (!!src.id === !!src.url) p.push(`source ${n} needs exactly one of id/url`);
    if (src.page !== undefined && !(Number.isInteger(src.page) && src.page > 0)) p.push(`source ${n} page must be a positive integer`);
  });
  const w = storyWords(s);
  if (w < 600 || w > 1600) p.push(`${w} words (want 600–1600)`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.updated)) p.push(`updated "${s.updated}" is not an ISO date`);
  return p;
}
