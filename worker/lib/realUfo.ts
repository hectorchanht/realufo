// /real-ufo text: one trusted source shared by the crawler body
// (worker/lib/pages.ts, which also emits FAQPage JSON-LD from
// REAL_UFO_FAQ) and the SPA screen (web/src/screens/RealUfo.tsx).
//
// This page exists for the plainest question people type into Google —
// "real UFO", "are UFOs real" — and answers it the only way this site
// can: from the declassified files themselves. Every figure below is
// taken from a primary record or a fact-checked case story already on
// this site (Project Blue Book totals via the Air Force fact sheet,
// ODNI's 2021 preliminary assessment, the CIA's U-2/OXCART history,
// AARO's reports). No claim here goes past what those sources say.

export const REAL_UFO_FAQ: { q: string; aText: string }[] = [
  {
    q: "Are UFOs real?",
    aText: "Yes — as reports. Pilots, radar operators and sensors have recorded objects and lights that investigators could not identify, and governments have kept files on them since the 1940s. That is what the word means: unidentified. It does not by itself prove the objects are extraterrestrial — no declassified file does that. Project Blue Book logged 12,618 sightings and left 701 unidentified; the intelligence community's 2021 assessment covered 144 government reports and identified only one with high confidence.",
  },
  {
    q: "Has the U.S. government confirmed UFOs are alien?",
    aText: "No. AARO, the Pentagon office that investigates UAP, told the Senate in November 2024 that it has discovered no verifiable evidence of extraterrestrial beings, activity or technology, and its 2024 Historical Record Report found no evidence that any U.S. government investigation confirmed a sighting as extraterrestrial technology. The files prove sightings happen and some stay unexplained; they do not prove alien visitation.",
  },
  {
    q: "What are the strongest real UFO cases in the files?",
    aText: "The cases with trained witnesses, instruments and surviving records: the 2004 Tic Tac encounter (Navy pilots, radar and infrared video), the 2015 GIMBAL video, Roswell (1947), the Phoenix Lights (1997), the Belgian Wave (1989–90, with radar locks), Rendlesham Forest (1980) and Socorro (1964). RealUFO has a case file for each, written from the official record with citations.",
  },
  {
    q: "Where can I read the real UFO files?",
    aText: "Right here. RealUFO mirrors the declassified UAP/UFO records from the Pentagon's PURSUE releases at war.gov/UFO, AARO, the CIA, FBI, NASA and the National Archives — full text, free, no account. Start with the archive, the release tracker for the newest Pentagon UFO files, or the Project Blue Book topic page for the historical files.",
  },
  {
    q: "Why do so many UFO reports turn out to be ordinary?",
    aText: "Because most do. The CIA's own history says its secret U-2 and OXCART spy-plane flights accounted for more than half of all UFO reports in the late 1950s and most of the 1960s. Balloons, aircraft, drones, satellites, birds and sensor artefacts explain most modern reports too — AARO publishes case resolutions showing its work. The honest residue is the small share that stay unexplained, usually because the data is too thin to decide.",
  },
  {
    q: "What is the difference between a UFO and a UAP?",
    aText: "UAP — Unidentified Anomalous Phenomena — is the term the U.S. government now uses for the same thing UFO (Unidentified Flying Object) has meant since the 1950s, widened to cover objects in the sea and space as well as the air. The files use both; RealUFO keeps each record's original wording.",
  },
];

export const REAL_UFO_HTML = `
<p><b>Short answer: UFOs are real — as sightings.</b> For more than 75 years, pilots, radar operators and military sensors have recorded things they could not identify, and governments have investigated and filed those reports. That is all the word has ever officially meant: <i>unidentified</i>. Whether any of it is extraterrestrial is a separate question — and on that one, the declassified files are blunt: <b>no released government record proves alien visitation.</b> This page separates the two, using only what the files on this site actually say.</p>
<h2>What the record proves</h2>
<p><b>The sightings happen, at scale.</b> Project Blue Book, the U.S. Air Force's public UFO investigation (1952–1969), collected 12,618 sightings; 701 were still unidentified when it closed. The intelligence community's <a href="/case/tic-tac">June 2021 preliminary assessment</a> covered 144 reports from U.S. government sources between 2004 and 2021 and identified only one with high confidence — a large deflating balloon. In 18 incidents, observers reported objects that appeared to stay stationary in winds aloft or move against the wind. Those numbers are the government's own.</p>
<p><b>Some cases carry instruments, not just witnesses.</b> The strongest files combine trained observers with radar, infrared video or physical traces — which is why they survive debunking attempts. Start with the ones researchers argue about most:</p>
<ul>
<li><a href="/case/tic-tac">Tic Tac, 2004</a> — Navy pilots, ship radar and an infrared video the Pentagon later confirmed authentic.</li>
<li><a href="/case/gimbal">GIMBAL, 2015</a> — a rotating object on an F/A-18's targeting pod, audio included.</li>
<li><a href="/case/phoenix-lights">Phoenix Lights, 1997</a> — thousands of witnesses across Arizona; the formation and the flares are two separate events in the record.</li>
<li><a href="/case/belgian-wave">Belgian Wave, 1989–90</a> — radar locks and F-16 intercepts, no identified craft.</li>
<li><a href="/case/rendlesham">Rendlesham Forest, 1980</a> — U.S. airmen, a deputy base commander's memo and audio tape.</li>
<li><a href="/case/roswell">Roswell, 1947</a> — the case that started it all; the files say more, and less, than the legend.</li>
</ul>
<h2>What the record does not prove</h2>
<p><b>No file here shows an alien.</b> AARO — the All-domain Anomaly Resolution Office, the Pentagon's current UAP investigators — told the Senate in November 2024 that it has discovered <i>no verifiable evidence of extraterrestrial beings, activity, or technology</i>. Its 2024 Historical Record Report reached the same conclusion about the whole U.S. government archive: no investigation has confirmed any sighting as extraterrestrial technology, and claims of secret reverse-engineering programmes rest largely on circular reporting. AARO also <a href="/topic/aaro-case-resolutions">publishes its resolved cases</a> — balloons, drones and sensor artefacts, shown with their working.</p>
<p><b>Most reports have ordinary answers.</b> The CIA's official history of its U-2 and OXCART spy planes (<a href="/doc/CIA-UAP-003">CIA-UAP-003</a>, page 86) concludes those secret flights accounted for <i>more than half of all UFO reports</i> in the late 1950s and most of the 1960s. The pattern still holds: secrecy and new technology manufacture UFO reports as a by-product. What remains genuinely open is the residue — cases where the data is too thin to decide either way, which is exactly the category the newest releases are built from.</p>
<h2>The 2026 files: disclosure in tranches</h2>
<p>Since May 8, 2026, the Department of War has been publishing previously classified UAP records under <a href="/pursue">PURSUE</a>, the release programme ordered by President Trump's directive of February 19, 2026. Every case in those tranches is officially <b>unresolved</b> — the government states it cannot make a definitive determination about what was observed. The <a href="/releases">release tracker</a> follows each tranche as it lands; the <a href="/topic/project-blue-book">Project Blue Book topic</a> holds the historical files; and the full <a href="/archive">archive</a> — Pentagon, AARO, CIA, FBI, NASA and National Archives records, mirrored verbatim and searchable — is where every claim on this page can be checked against its source.</p>
<h2>How to judge a UFO claim</h2>
<p>Ask three questions, in order. <b>Who saw it</b> — a trained observer with a name and a report on file, or an anonymous clip? <b>What else recorded it</b> — radar, infrared, a second sensor, a second witness who didn't know the first? <b>What does the file itself conclude</b> — read the assessment, not the headline: this archive keeps the government's verdict next to every record, including the ones that say "balloon". A real UFO survives those questions. Most viral clips don't — and the difference between the two is the entire subject.</p>
`;
