// /pursue text: one trusted source shared by the crawler body
// (worker/lib/pages.ts), the SPA screen (web/src/screens/Pursue.tsx) and
// Ask grounding (lib/ask.ts explainerMatches over PURSUE_SECTIONS).
//
// The explainer is RealUFO's own write-up of what war.gov/UFO is and where
// this archive's headline files come from — the facts are the Department of
// War's (U.S. government work, public domain), quoted sparingly and
// attributed; the words are ours. It exists because "PURSUE", "where do
// these files come from" and friends are answered nowhere in the records
// themselves: a record is just one file *of* the programme.
export const PURSUE_SOURCE = "war.gov/UFO — U.S. Department of War";

export const PURSUE_HTML = `
<p>Most of the files at the top of this archive were published in one place: <a href="https://www.war.gov/UFO/">war.gov/UFO</a>, the U.S. Department of War's home for the <b>PURSUE</b> releases. This page explains what that programme is, what it publishes, and where RealUFO fits — so the provenance of the records is never a guessing game.</p>
<h2>What PURSUE is</h2>
<p><b>PURSUE</b> stands for the <b>Presidential Unsealing and Reporting System for UAP Encounters</b>. It began with President Trump's directive of February 19, 2026, ordering federal departments and agencies to identify and release government files on UAP. Under that directive, the Department of War (DOW), with support from the Office of the Director of National Intelligence (ODNI), oversees a government-wide effort to find, review, identify, declassify and publicly release unresolved UAP records held across the federal government. The department describes the scale plainly: coordination between dozens of agencies, and tens of millions of records — many existing only on paper — spanning many decades.</p>
<p>Secretary of War Pete Hegseth, in the statement published with the releases: “The Department of War is in lockstep with President Trump to bring unprecedented transparency regarding our government's understanding of Unidentified Anomalous Phenomena.”</p>
<h2>Released in tranches</h2>
<p>Because the review is still running, records come out on a rolling basis — a new tranche every few weeks as files are discovered and declassified. The first tranche was released on May 8, 2026; the seventh (Release 07) followed on October 23, 2026. RealUFO's <a href="/releases">release tracker</a> follows every tranche, with per-release file counts and agency breakdowns.</p>
<h2>“Unresolved” is the point</h2>
<p>The materials published under PURSUE are <b>unresolved</b> cases: ones where the government cannot make a definitive determination about what was observed — for example, because the data is insufficient. Publishing them is an invitation, not a verdict: the Department of War explicitly welcomes private-sector analysis of the files. Cases the government has resolved are reported separately, as mandated by statute, and are not part of these tranches. A file appearing here means “we could not determine this one” — nothing more, and nothing less.</p>
<h2>Where RealUFO fits</h2>
<p>RealUFO mirrors the PURSUE files verbatim from <a href="https://www.war.gov/UFO/">war.gov/UFO</a>, alongside holdings from NARA, NASA, the FBI, the CIA, the DOE and other official sources, and adds what the source sites don't: full text of every file, AI summaries, video clips, a unified search across all of it, and an <a href="/ask">ask layer</a> whose answers cite the records. RealUFO is an independent, open-source archive — not a government website, and not affiliated with or endorsed by the Department of War or any agency. The files are the government's; the presentation layer is ours.</p>
<p>Primary source: <a href="https://www.war.gov/UFO/">war.gov/UFO</a> (U.S. Department of War). U.S. federal records are public domain (17 U.S.C. § 105).</p>
`;

// Ask grounding sections: the same facts, condensed to plain text, each with
// the question-words that should pull it in. lib/ask.ts matches a section
// when one of its keys is among the question's keywords, strongest first.
export interface PursueSection {
  id: string;
  keys: string[];
  text: string;
}

export const PURSUE_SECTIONS: PursueSection[] = [
  {
    id: "program",
    keys: ["pursue", "program", "programme", "unsealing", "reporting", "system", "encounters"],
    text: "PURSUE is the Presidential Unsealing and Reporting System for UAP Encounters, the U.S. Department of War's release programme at war.gov/UFO. After President Trump's February 19, 2026 directive on UAP transparency, the Department of War, with support from the Office of the Director of National Intelligence (ODNI), oversees a government-wide effort to find, review, identify, declassify and publicly release unresolved UAP records held across the federal government — dozens of agencies, and tens of millions of records, many of them paper-only, spanning decades.",
  },
  {
    id: "tranches",
    keys: ["tranche", "tranches", "first", "released", "release", "releases", "rolling", "latest", "seventh"],
    text: "PURSUE records are released in rolling tranches every few weeks, as files are discovered and declassified. The first tranche was released on May 8, 2026; the seventh tranche (Release 07) came out on October 23, 2026.",
  },
  {
    id: "unresolved",
    keys: ["cases", "case", "resolved", "unresolved", "explained", "determination", "determinations", "definitive"],
    text: "The files published under PURSUE are unresolved cases: ones where the government cannot make a definitive determination about what was observed, for example because the data is insufficient. The Department of War publishes them so the private sector can analyse them; cases the government has resolved are reported separately, as mandated by statute.",
  },
  {
    id: "provenance",
    keys: ["data", "files", "records", "come", "comes", "source", "sources", "origin", "provenance", "realufo", "mirror", "mirrored", "war", "gov", "get", "got"],
    text: "RealUFO's files come from official government sources: the PURSUE releases published by the U.S. Department of War at war.gov/UFO, plus holdings from NARA, NASA, the FBI, the CIA, the DOE and other agencies. RealUFO mirrors every file verbatim and adds full text, AI summaries, clips and search. RealUFO is an independent archive, not a government website.",
  },
];
