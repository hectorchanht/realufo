// "Go deeper" affiliate picks: highly relevant books per topic hub.
// Shown on topic pages as a "GO DEEPER" section. Links are Amazon searches;
// set AMAZON_TAG to your Associates tag to earn commission (then the FTC
// disclosure in GoDeeper.tsx activates). Empty tag = plain helpful links.
export const AMAZON_TAG = ""; // e.g. "realufo-20"

export interface AffiliatePick {
  title: string;
  creator: string;
  blurb: string; // why this book matters for THIS topic — the click driver
  query: string; // Amazon search query
}

function amz(query: string): string {
  const base = `https://www.amazon.com/s?k=${encodeURIComponent(query)}`;
  return AMAZON_TAG ? `${base}&tag=${encodeURIComponent(AMAZON_TAG)}` : base;
}

export function affiliateUrl(pick: AffiliatePick): string {
  return amz(pick.query);
}

export const AFFILIATE_PICKS: Record<string, AffiliatePick[]> = {
  "project-blue-book": [
    {
      title: "The UFO Experience",
      creator: "J. Allen Hynek",
      blurb: "Written by Blue Book's own chief scientist — the astronomer who classified the very cases in this archive, and who went from skeptic to believer.",
      query: "The UFO Experience J Allen Hynek",
    },
    {
      title: "The Hynek UFO Report",
      creator: "J. Allen Hynek",
      blurb: "A case-by-case walkthrough of hundreds of Blue Book files — the same incidents you're browsing, analyzed by the insider who read them all.",
      query: "Hynek UFO Report",
    },
  ],
  "flying-discs": [
    {
      title: "The Coming of the Saucers",
      creator: "Kenneth Arnold",
      blurb: "By the pilot whose 1947 sighting coined 'flying saucer' — the origin story of every disc report in this collection.",
      query: "Coming of the Saucers Kenneth Arnold",
    },
    {
      title: "Flying Saucers Are Real",
      creator: "Donald Keyhoe",
      blurb: "The 1950 bestseller by a Marine Corps major that forced the Air Force to answer for the saucer wave, using the same era's official files.",
      query: "Flying Saucers Are Real Donald Keyhoe",
    },
  ],
  "nuclear-sites": [
    {
      title: "UFOs and Nukes",
      creator: "Robert Hastings",
      blurb: "40 years, 160+ military witnesses: the definitive investigation of UFOs over nuclear weapons sites — the incidents in this archive are its source material.",
      query: "UFOs and Nukes Robert Hastings",
    },
  ],
  "aawsap": [
    {
      title: "Skinwalkers at the Pentagon",
      creator: "Lacatski, Kelleher & Knapp",
      blurb: "By the creator of the Pentagon's secret AAWSAP program itself — the insider account of the program behind these documents.",
      query: "Skinwalkers at the Pentagon Lacatski",
    },
  ],
  "congress": [
    {
      title: "Imminent",
      creator: "Luis Elizondo",
      blurb: "By the former Pentagon UAP official whose testimony drove the congressional hearings documented in this archive.",
      query: "Imminent Luis Elizondo",
    },
  ],
};

export function picksForTopic(slug: string): AffiliatePick[] {
  return AFFILIATE_PICKS[slug] ?? [];
}
