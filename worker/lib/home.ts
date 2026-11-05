// Homepage text: one trusted source shared by the crawler body
// (worker/lib/pages.ts + ssr.ts homeBody) and the SPA feed
// (web/src/screens/Feed.tsx) — same pattern as lib/about.ts and
// lib/realUfo.ts. The intro's figures are NOT baked in: the {{STATS}}
// slot is replaced by each renderer with live counts from its own data
// path (SSR: the /about-style D1 queries in pages.ts homeStats; SPA:
// the bootstrap stats + hub counts the feed already loads), so the
// numbers on the page are always the site's real ones.
//
// Case blurbs are condensed from the cases' own ledes (the fact-checked
// case stories) and the strongest-cases list on /real-ufo — no claim
// here goes past what those pages say.

export type Seg = string | { a: string; t: string };

export const HOME_STATS_SLOT = "{{STATS}}";
export const HOME_STATS_FALLBACK =
  "hundreds of records from government archives, with new release tranches still landing";

export const HOME_INTRO: Seg[][] = [
  [
    "RealUFO is a searchable archive of real UFO files: the declassified UAP records governments have released, mirrored verbatim from their official sources — the Pentagon and the Department of War, AARO, the CIA, the FBI, NASA, the National Archives and other agencies. The archive currently holds {{STATS}}. Every record keeps the original document, its source and the government's own assessment beside it, so any claim can be checked against the file it came from.",
  ],
  [
    "The newest files arrive through ",
    { a: "/pursue", t: "PURSUE" },
    ", the Department of War's 2026 programme publishing previously classified UAP records in tranches, and the ",
    { a: "/releases", t: "release tracker" },
    " follows each one as it lands. Search the full text of every file, browse by agency or topic, work through the ",
    { a: "/cases", t: "case files" },
    " retold from the official record, or follow sightings on the ",
    { a: "/map", t: "map" },
    " — everything is free to read, and no account is needed.",
  ],
];

// The homepage's short answer; the full evidence-led version lives on
// /real-ufo and this deliberately stays a summary so the two pages do
// not compete for the same query.
export const HOME_ARE_REAL: Seg[] = [
  "Yes — as sightings. For more than 75 years, pilots, radar operators and sensors have recorded things investigators could not identify, and governments have filed the reports: Project Blue Book logged 12,618 sightings and left 701 unidentified. But no declassified file proves extraterrestrial visitation, and AARO, the Pentagon's current UAP office, told the Senate it has found no verifiable evidence of extraterrestrial beings, activity or technology. ",
  { a: "/real-ufo", t: "The strongest cases, the official verdicts, and how to judge a UFO claim →" },
];

export const HOME_CASES: { slug: string; name: string; blurb: string }[] = [
  {
    slug: "tic-tac",
    name: "Tic Tac, 2004",
    blurb:
      "Off Baja California in November 2004, F/A-18 crews from USS Nimitz were vectored to a radar contact and found a white, wingless 'Tic Tac' object; a second jet filmed it, and the Pentagon later confirmed the video is authentic.",
  },
  {
    slug: "gimbal",
    name: "GIMBAL, 2015",
    blurb:
      "A 34-second F/A-18 infrared video from January 2015 shows a glowing object rotating against the wind, the aircrew audible on the tape. Leaked in 2017, it was officially released by the Pentagon in 2020.",
  },
  {
    slug: "phoenix-lights",
    name: "Phoenix Lights, 1997",
    blurb:
      "On 13 March 1997 a V of five lights crossed Arizona in the early evening; hours later, a row of lights hovered over Phoenix. Thousands watched, and the record treats the two events as separate.",
  },
  {
    slug: "belgian-wave",
    name: "Belgian Wave, 1989–90",
    blurb:
      "In March 1990, after police and two ground radars reported lights south-east of Brussels, Belgian F-16s scrambled and locked radar onto something that out-accelerated them. It was never identified.",
  },
  {
    slug: "rendlesham",
    name: "Rendlesham Forest, 1980",
    blurb:
      "In December 1980, USAF patrolmen reported a glowing object in the forest outside RAF Woodbridge. The deputy base commander's memo — and the audio tape he recorded that night — are both in the file.",
  },
  {
    slug: "roswell",
    name: "Roswell, 1947",
    blurb:
      "On 8 July 1947, Roswell Army Air Field announced its men had recovered a 'flying disc', then retracted the claim within hours. The declassified files say both more and less than the legend that followed.",
  },
];

export const HOME_AGENCY_LEAD =
  "Every file grouped by the agency that produced it — the CIA's released holdings, the FBI's Vault records, NASA's files, the National Archives and more.";

export const HOME_TOPIC_LEAD =
  "The archive organised by subject: the secret programmes, congressional hearings and incident clusters the files keep returning to.";
