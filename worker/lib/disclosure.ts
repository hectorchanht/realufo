// /disclosure text: one trusted source shared by the crawler body
// (worker/lib/pages.ts, which also emits FAQPage JSON-LD from
// DISCLOSURE_FAQ) and the SPA screen (web/src/screens/Disclosure.tsx).
//
// This page exists for the "UAP disclosure" / "ufo disclosure" /
// "disclosure act" query family: the year-by-year timeline of how the
// official story changed. Every milestone below traces to a
// fact-checked page already on this site — the GIMBAL and Tic Tac case
// stories (the December 2017 New York Times AATIP report, the July 2023
// Oversight hearing), the AARO agency background (UAP Task Force 2020,
// AARO stood up 15 July 2022, Historical Record Report March 2024), the
// Congress topic background (the 2022 hearing, the 9 September 2025
// task-force hearing and its transcript, the March 2026 House request),
// /real-ufo (ODNI's 2021 assessment, AARO's November 2024 Senate
// testimony, the February 2026 directive and PURSUE) — or to the
// legislative record for the Disclosure Act section. No invented
// dates, no invented quotes.

export const DISCLOSURE_FAQ: { q: string; aText: string }[] = [
  {
    q: "What is UAP disclosure?",
    aText: "The ongoing process by which the U.S. government has acknowledged, investigated and released what it holds on unidentified anomalous phenomena: a secret study programme revealed in 2017, Navy videos officially confirmed in 2020, a first intelligence assessment in 2021, a permanent Pentagon office (AARO) in 2022, sworn congressional testimony in 2023, and rolling releases of previously classified files under the PURSUE programme since May 2026. It is a paper trail, not a single announcement — and so far it has produced files and verdicts, not confirmation of alien visitation.",
  },
  {
    q: "What is the UAP Disclosure Act?",
    aText: "A bill proposed by Senators Chuck Schumer and Mike Rounds in 2023 and reintroduced in 2024 as an amendment to the annual defense authorization act. It would have created an independent review board to declassify UAP records on a deadline, with power to take custody of recovered materials. It was not enacted in full. What passed instead was narrower: the FY2024 defense act ordered agencies to review their UAP records and transfer them to a dedicated UAP Records Collection at the National Archives.",
  },
  {
    q: "Has the U.S. government confirmed UFOs are alien?",
    aText: "No. AARO, the Pentagon office that investigates UAP, told the Senate in November 2024 that it has discovered no verifiable evidence of extraterrestrial beings, activity or technology. Its 2024 Historical Record Report found no evidence that any U.S. government investigation confirmed a sighting as extraterrestrial technology, and no empirical evidence for the secret reverse-engineering programmes described in 2023 testimony.",
  },
  {
    q: "What did the 2021 ODNI report say?",
    aText: "The Office of the Director of National Intelligence's June 2021 preliminary assessment covered 144 reports from U.S. government sources between 2004 and 2021. It identified only one with high confidence — a large deflating balloon — and said the rest lacked enough data to explain. In 18 incidents, observers reported objects that appeared to stay stationary in winds aloft or move against the wind.",
  },
  {
    q: "What is PURSUE?",
    aText: "PURSUE — the Presidential Unsealing and Reporting System for UAP Encounters — is the Department of War's release programme at war.gov/UFO, ordered by a presidential directive of 19 February 2026. Since 8 May 2026 it has published previously classified UAP records in tranches. Every case in the tranches is officially unresolved: the government states it cannot make a definitive determination about what was observed. RealUFO mirrors each tranche in full and tracks the releases as they land.",
  },
  {
    q: "Where can I read the actual disclosure files?",
    aText: "Right here. RealUFO mirrors the released records — the PURSUE tranches, AARO reports and case resolutions, CIA, FBI, NASA and National Archives files — with full text, free, no account. Start with the release tracker for the newest Pentagon UFO files, the case files for the famous incidents retold from the official record, or the full archive to search everything.",
  },
];

export const DISCLOSURE_HTML = `
<p><b>Disclosure is not an event. It is a paper trail.</b> Since 2017 the U.S. government has, step by step, acknowledged a secret study programme, confirmed its own pilots' videos, published a first official assessment, created a permanent UFO office, taken sworn testimony in Congress — and in 2026 begun releasing previously classified files in tranches. None of it confirms alien visitation; all of it is on the record. This page walks the timeline, and every milestone links to the file, hearing or report itself in this archive, so each step can be checked against its source.</p>
<h2>The disclosure timeline</h2>
<h3>16 December 2017 — the secret programme is revealed</h3>
<p>The New York Times reports on the Pentagon's Advanced Aerospace Threat Identification Program (AATIP), a UAP study effort that ran from 2007 to 2012, and publishes Navy cockpit footage of an unidentified object — the video now known as <a href="/case/gimbal">GIMBAL</a>. The story moves UFOs from the fringe press to the front page, and pilots begin describing their encounters on the record. The footage and the programme are both in the archive: start with the <a href="/case/gimbal">GIMBAL case file</a> and the <a href="/glossary">glossary entries for AATIP and AARO</a>.</p>
<h3>April 2020 — the Pentagon confirms the Navy videos</h3>
<p>The Department of Defense formally releases the three Navy videos — FLIR1, GOFAST and GIMBAL — and confirms they depict unidentified aerial phenomena. The <a href="/case/tic-tac">Tic Tac</a> footage, filmed by F/A-18 crews from USS Nimitz in November 2004, is no longer a leak: it is an official record of something the Navy could not identify.</p>
<h3>August 2020 — a UAP Task Force</h3>
<p>The Deputy Secretary of Defense approves a Navy-led UAP Task Force to standardise how sightings are reported and investigated — the first standing UAP body of the disclosure era, and the direct ancestor of today's AARO. Its lineage is traced in the <a href="/agency/aaro">AARO files and background</a>.</p>
<h3>25 June 2021 — the intelligence community's first assessment</h3>
<p>The Office of the Director of National Intelligence publishes a preliminary assessment of 144 UAP reports from government sources. Only one is identified with high confidence — a large deflating balloon; the report says the data on the rest is too thin to decide, and notes 18 incidents in which objects appeared to move against the wind or hold station in it. The assessment is the spine of <a href="/real-ufo">our page on what the files actually prove</a>.</p>
<h3>May 2022 — Congress holds an open hearing</h3>
<p>A House subcommittee hears defense officials in open session — the first public congressional hearing of the modern disclosure era — and officials screen Navy UAP videos for the committee. Those videos, and the later hearings' material, are collected on the <a href="/topic/congress">Congress &amp; hearings topic page</a>.</p>
<h3>15 July 2022 — AARO stands up</h3>
<p>Under the FY2022 National Defense Authorization Act, the Pentagon's interim synchronisation group is renamed the All-domain Anomaly Resolution Office — <a href="/agency/aaro">AARO</a> — with a wider mission across air, sea and space domains and a duty to report to Congress. For the first time since Project Blue Book closed in 1969, the U.S. government has a permanent, public UFO office.</p>
<h3>26 July 2023 — witnesses testify under oath</h3>
<p>A House Oversight subcommittee takes sworn testimony from Navy pilot David Fravor — whose written statement describes the 2004 Tic Tac encounter and is reproduced in the <a href="/case/tic-tac">Tic Tac case file</a> — and from former intelligence officer David Grusch, who alleges the U.S. has run secret crash-retrieval and reverse-engineering programmes for decades. The Pentagon denies the claims; the hearing makes "disclosure" a legislative fight, carried on the <a href="/topic/congress">Congress topic page</a>.</p>
<h3>March 2024 — AARO's Historical Record Report</h3>
<p>AARO publishes Volume I of its Historical Record Report, a review of the entire U.S. government archive since 1945. Its verdict: no evidence that any government investigation confirmed a sighting as extraterrestrial technology, and no empirical evidence for secret reverse-engineering programmes — claims it traces largely to circular reporting. The report and AARO's case resolutions are in the <a href="/agency/aaro">AARO files</a>.</p>
<h3>November 2024 — AARO's verdict to the Senate</h3>
<p>Testifying to the Senate, AARO states it has discovered no verifiable evidence of extraterrestrial beings, activity or technology. Disclosure's paper trail, at this point, runs in both directions: more files than ever released, and an official verdict that they do not show aliens. Both halves are documented on <a href="/real-ufo">Real UFO: are UFOs real?</a></p>
<h3>9 September 2025 — the House task force hearing</h3>
<p>The House Oversight task force holds its hearing "Restoring Public Trust Through UAP Transparency and Whistleblower Protection", screening new military UAP video and pressing officials on classification. The full transcript is a file in this archive: <a href="/doc/CONGRESS-CHRG-119hhrg61718">read the hearing transcript</a>, and see the other material Congress has seen or demanded on the <a href="/topic/congress">Congress &amp; hearings page</a>.</p>
<h3>19 February 2026 — a presidential directive orders the files opened</h3>
<p>A presidential directive orders the release of the government's UAP holdings, creating <a href="/pursue">PURSUE</a> — the Presidential Unsealing and Reporting System for UAP Encounters — at the Department of War. Disclosure stops being a drip of leaks and hearings and becomes a scheduled publication programme.</p>
<h3>6 March 2026 — Congress asks; 49 videos surface</h3>
<p>Eight House members request 51 UAP records; AARO locates and posts 49 videos found on a classified network. The request, and what it produced, is tracked on the <a href="/topic/congress">Congress &amp; hearings page</a>.</p>
<h3>8 May 2026 — the PURSUE tranches begin</h3>
<p>The Department of War publishes the first tranche of previously classified UAP records at war.gov/UFO, and the tranches keep coming — each one made entirely of cases the government officially lists as <b>unresolved</b>. The <a href="/releases">release tracker</a> follows every tranche as it lands, with the gaps between them and an estimate of the next; every file is mirrored in the <a href="/archive">archive</a> with its full text.</p>
<h2>The UAP Disclosure Act</h2>
<p>The legislative centrepiece of the disclosure fight is the UAP Disclosure Act, proposed by Senators Chuck Schumer and Mike Rounds in 2023 and reintroduced in 2024 as an amendment to the annual defense authorization act. Modelled on the JFK assassination records law, it would have created an independent review board to declassify UAP records on a deadline, with authority to take custody of recovered materials held by the government or its contractors. It was not enacted in full — the board and its powers were stripped in negotiations. What passed instead was narrower but real: the FY2024 defense act ordered federal agencies to review their UAP records and transfer them to a dedicated UAP Records Collection at the National Archives, whose holdings are part of what this archive mirrors — <a href="/doc/NARA-2024-NDAA-Public-Law-118-31">read the act itself in the archive</a>. The fight over the full act is why "disclosure" now runs on two tracks: legislation in Congress, and scheduled releases under <a href="/pursue">PURSUE</a>.</p>
<h2>What disclosure has — and hasn't — produced</h2>
<p><b>Produced:</b> an acknowledged programme history (AATIP, the UAP Task Force, AARO), officially confirmed videos, a first intelligence assessment, sworn testimony on the record, a standing archive at the National Archives, and — since May 2026 — hundreds of previously classified files released in the open, every one checkable in <a href="/archive">this archive</a>.</p>
<p><b>Not produced:</b> confirmation. AARO's historical review and its Senate testimony state plainly that no released evidence shows extraterrestrial technology, and its <a href="/topic/aaro-case-resolutions">published case resolutions</a> keep closing individual mysteries with ordinary answers — balloons, drones, fishing nets, parallax. The honest summary is the one the files support: sightings are real, some remain unexplained, and the disclosure process is now the best source there is for telling the difference. For the evidence itself, read <a href="/real-ufo">what the declassified files actually show</a>.</p>
<h2>What happens next</h2>
<p>The PURSUE tranches are still landing on a rough rhythm, and the <a href="/releases">release tracker</a> estimates the next window from the gaps so far. New files appear in this archive automatically as each tranche is published — no announcement needed, and no account. If a future milestone changes the story — an enacted Disclosure Act, a new AARO report, a release that resolves the famous cases either way — it will be added to this timeline with its source attached.</p>
`;
