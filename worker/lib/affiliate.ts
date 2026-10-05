// "Go deeper" affiliate picks: highly relevant books per topic AND per record.
// Picks carry `match` keywords mined from the archive's AI summaries —
// doc pages show the picks whose keywords hit the record's title/summary.
// Links are Amazon searches; set AMAZON_TAG to your Associates tag to earn
// commission (then the FTC disclosure in GoDeeper.tsx activates).
export const AMAZON_TAG = "realufo-20";

export interface AffiliatePick {
  title: string;
  creator: string;
  blurb: string; // why this book matters HERE — the click driver
  query: string; // Amazon search query
  match?: string[]; // keywords (lowercase) matched against record title+summary
}

function amz(query: string): string {
  const base = `https://www.amazon.com/s?k=${encodeURIComponent(query)}`;
  return AMAZON_TAG ? `${base}&tag=${encodeURIComponent(AMAZON_TAG)}` : base;
}

export function affiliateUrl(pick: AffiliatePick): string {
  return amz(pick.query);
}

const PICKS: AffiliatePick[] = [
  {
    title: "The UFO Experience",
    creator: "J. Allen Hynek",
    blurb: "Written by Blue Book's own chief scientist — the astronomer who classified the very cases in this archive, and who went from skeptic to believer.",
    query: "The UFO Experience J Allen Hynek",
    match: ["blue book", "hynek"],
  },
  {
    title: "The Hynek UFO Report",
    creator: "J. Allen Hynek",
    blurb: "A case-by-case walkthrough of hundreds of Blue Book files — the same incidents you're browsing, analyzed by the insider who read them all.",
    query: "Hynek UFO Report",
    match: ["blue book"],
  },
  {
    title: "Project Blue Book Declassified",
    creator: "U.S. Air Force (official files)",
    blurb: "The complete official Blue Book files in book form — every status report 1952–1969, unfiltered, for the shelf.",
    query: "Project Blue Book Declassified book",
    match: ["blue book", "project sign", "grudge"],
  },
  {
    title: "The Coming of the Saucers",
    creator: "Kenneth Arnold",
    blurb: "By the pilot whose 1947 sighting coined 'flying saucer' — the origin story of every disc report in this collection.",
    query: "Coming of the Saucers Kenneth Arnold",
    match: ["flying disc", "flying saucer", "kenneth arnold", "1947"],
  },
  {
    title: "Flying Saucers Are Real",
    creator: "Donald Keyhoe",
    blurb: "The 1950 bestseller by a Marine Corps major that forced the Air Force to answer for the saucer wave, using the same era's official files.",
    query: "Flying Saucers Are Real Donald Keyhoe",
    match: ["flying disc", "flying saucer", "keyhoe"],
  },
  {
    title: "UFOs and Nukes",
    creator: "Robert Hastings",
    blurb: "40 years, 160+ military witnesses: the definitive investigation of UFOs over nuclear weapons sites — the incidents in this archive are its source material.",
    query: "UFOs and Nukes Robert Hastings",
    match: ["nuclear", "oak ridge", "los alamos", "missile", "silo", "warhead"],
  },
  {
    title: "Skinwalkers at the Pentagon",
    creator: "Lacatski, Kelleher & Knapp",
    blurb: "By the creator of the Pentagon's secret AAWSAP program itself — the insider account of the program behind these documents.",
    query: "Skinwalkers at the Pentagon Lacatski",
    match: ["aawsap", "dird", "aatip", "bigelow", "skinwalker"],
  },
  {
    title: "Imminent",
    creator: "Luis Elizondo",
    blurb: "By the former Pentagon UAP official whose testimony drove the congressional hearings — the insider story behind the push for disclosure.",
    query: "Imminent Luis Elizondo",
    match: ["elizondo", "congress", "hearing", "uaptf", "aaro", "grusch"],
  },
  {
    title: "The FBI-CIA-UFO Connection",
    creator: "Bruce Maccabee",
    blurb: "A Navy physicist documents — from declassified files — how deeply the FBI and CIA tracked UFOs through the Cold War. The files you're reading are his evidence.",
    query: "FBI CIA UFO Connection Maccabee",
    match: ["fbi", "62-hq-83894", "cia", "hoover"],
  },
  {
    title: "UFOs and the National Security State",
    creator: "Richard Dolan",
    blurb: "The definitive history of the intelligence community's 50-year entanglement with UFOs — CIA, NSA, and the cover apparatus behind the documents.",
    query: "UFOs and the National Security State Dolan",
    match: ["cia", "nsa", "intelligence community", "national security"],
  },
  {
    title: "Inside The Black Vault",
    creator: "John Greenewald",
    blurb: "By the man behind the world's largest FOIA UFO archive — how he pried these very documents out of the government, and what he learned.",
    query: "Inside The Black Vault Greenewald",
    match: ["foia", "black vault"],
  },
  {
    title: "UFO: The Inside Story",
    creator: "Garrett Graff",
    blurb: "A Pulitzer finalist traces the government's 80-year search — from Roswell to the UAP hearings — through declassified documents like these.",
    query: "UFO Inside Story Garrett Graff",
    match: ["roswell", "congress", "disclosure"],
  },
];

// Topic hub pages: which picks show on each topic.
const TOPIC_PICKS: Record<string, string[]> = {
  "project-blue-book": ["The UFO Experience", "The Hynek UFO Report", "Project Blue Book Declassified"],
  "flying-discs": ["The Coming of the Saucers", "Flying Saucers Are Real"],
  "nuclear-sites": ["UFOs and Nukes"],
  "aawsap": ["Skinwalkers at the Pentagon"],
  "congress": ["Imminent", "UFO: The Inside Story"],
  "fbi-62-hq-83894": ["The FBI-CIA-UFO Connection"],
};

export function picksForTopic(slug: string): AffiliatePick[] {
  const titles = TOPIC_PICKS[slug] ?? [];
  return titles.map((t) => PICKS.find((p) => p.title === t)!).filter(Boolean);
}

// Doc pages: match record title+summary against pick keywords (max 2).
export function picksForRecord(title: string, summary: string): AffiliatePick[] {
  const hay = `${title} ${summary}`.toLowerCase();
  const scored = PICKS.map((p) => ({
    p,
    hits: (p.match ?? []).filter((k) => hay.includes(k)).length,
  })).filter((s) => s.hits > 0).sort((a, b) => b.hits - a.hits);
  return scored.slice(0, 2).map((s) => s.p);
}
