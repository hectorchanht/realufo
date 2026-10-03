// Hand-written topic backgrounds (spec 2026-10-03-realufo-topic-hubs-design),
// researched against the archive files; every claim is backed by `sources`
// (PDF page = the ?p= deep link). Reviewed by the user before deploy.
import type { TopicText } from "./topics";

export const TOPIC_TEXT: Record<string, TopicText> = {
  aawsap: {
    background:
      "In July 2008 the Defense Intelligence Agency set out to study foreign breakthrough aerospace technology \"through the year 2050,\" in areas from lift and propulsion to signature reduction. In September 2008 it awarded contract HHM402-08-C-0072, worth $21,948,810, to Bigelow Aerospace Advanced Space Studies of Las Vegas. Five modifications followed through September 2010. The work produced 37 Defense Intelligence Reference Documents (DIRDs), starting in December 2009, on subjects from metallic glasses to warp drive.",
    sources: [
      { id: "DOW-UAP-D110", page: 1, note: "Objectives: foreign threat through 2050" },
      { id: "DOW-UAP-D111", page: 1, note: "Contract award to Bigelow, $21,948,810" },
      { id: "DOW-UAP-D116", page: 1, note: "Modification P00005, September 2010" },
      { id: "DOW-UAP-D117", page: 1, note: "First DIRD, 14 December 2009" },
      { id: "DOW-UAP-D138", page: 1, note: "DIRD on warp drive" },
    ],
  },
  "mission-reports": {
    background:
      "Mission Reports (MISREPs) are the forms U.S. military aircrews file after a mission. Each one here logs a UAP observation alongside routine mission details. The 34 reports run from 2016 to 2025, mostly from U.S. Central Command operations over Iraq, Syria, the Arabian Gulf and the eastern Mediterranean. The USCENTCOM chief of staff declassified them in 2025–2026, and they were approved for release to AARO.",
    sources: [
      { id: "DOW-UAP-D055", page: 1, note: "2016 P-8A sighting off Latakia, Syria" },
      { id: "DOW-UAP-D019", page: 2, note: "MISREP form, Operation Inherent Resolve" },
      { id: "DOW-UAP-D062", page: 1, note: "UAP during Strait of Hormuz mission" },
      { id: "DOW-UAP-D107", page: 1, note: "October 2025 UAP, declassified 2026" },
    ],
  },
  "flying-discs": {
    background:
      "After a December 1947 Air Force order on \"flying discs,\" Air Materiel Command opened Project Sign in January 1948; its first report tallied witness descriptions of oval, disc or saucer shapes. In late 1948 the command found no conclusive proof that unidentified objects, other than balloons, were real aircraft. A 1949 Army study asked whether the reports came from natural phenomena or a foreign power, and a 1950 CIA report from Chile relayed a German scientist's theory of the discs.",
    lore: "Popular accounts say Project Sign concluded the discs were craft from another planet; the Air Materiel Command file says tangible evidence for that was \"completely lacking.\"",
    sources: [
      { id: "DOW-UAP-D097", page: 1, note: "Project Sign's first report, 1948" },
      { id: "DOW-UAP-D100", page: 9, note: "No conclusive proof of real aircraft" },
      { id: "DOW-UAP-D100", page: 8, note: "Another-planet idea: evidence lacking" },
      { id: "DOW-UAP-D084", page: 8, note: "Army study: nature or foreign power?" },
      { id: "CIA-UAP-005", page: 1, note: "German scientist's disc theory, Chile" },
    ],
  },
  "apollo-nasa": {
    background:
      "Excerpts from NASA air-to-ground transcripts and crew debriefings record astronauts describing bright particles, flashes and unexplained objects. Crews often weighed ordinary sources: on Apollo 17 the command module pilot guessed that fragments might be coming off the S-IVB rocket stage, and the Apollo 11 crew discussed the S-IVB and spacecraft debris. Astronauts also reported light flashes while trying to sleep in a darkened cabin. The image files are Apollo 12 and Apollo 17 photographs with features flagged for analysis.",
    lore: "Popular accounts say the Apollo 11 crew saw an alien craft on the way to the Moon; in their debriefing they considered the S-IVB stage and spacecraft debris and reached no firm conclusion.",
    sources: [
      { id: "NASA-UAP-D002", page: 2, note: "Apollo 17 fragments: maybe the S-IVB" },
      { id: "NASA-UAP-D004", page: 5, note: "Apollo 11 crew suspects spacecraft origin" },
      { id: "NASA-UAP-D004", page: 6, note: "Aldrin's flashes inside darkened cabin" },
      { id: "NASA-UAP-D002", page: 5, note: "Cernan's bright flash before sleep" },
      { id: "NASA-UAP-VM006", note: "Apollo 17 photo, three dots" },
    ],
  },
  "fbi-62-hq-83894": {
    background:
      "FBI file 62-HQ-83894 gathers Bureau records on flying disc reports, including press-reported sightings from July 1947. Agents looked into the Maury Island, Washington, story of disc fragments falling on a boat and reported it may have been built up for a profitable sale. In February 1948 headquarters told field offices the Bureau was conducting no flying disc investigations and would pass any information to the Air Forces.",
    lore: "Popular accounts present the 1947 Maury Island incident as a real sighting; the FBI file records a reporter's account that Harold Dahl admitted it was \"an entire hoax.\"",
    sources: [
      { id: "65-hs1-834228961-62-hq-83894-section-1", page: 24, note: "July 1947 press disc report" },
      { id: "65-hs1-834228961-62-hq-83894-section-3", page: 37, note: "Maury Island story investigated" },
      { id: "65-hs1-834228961-62-hq-83894-section-4", page: 39, note: "Bureau stops disc investigations, 1948" },
      { id: "65-hs1-834228961-62-hq-83894-serial-164", page: 2, note: "Air Force reporting requirements, 1949" },
    ],
  },
  "project-blue-book": {
    background:
      "Project Blue Book was the Air Force's UFO project; its Special Report No. 14 came from the Air Technical Intelligence Center at Wright-Patterson Air Force Base on 5 May 1955. In a 1952 briefing, Capt. Edward Ruppelt said about 800 cases were on record and about 20% were good reports that allowed no conclusions. The 1952 Tremonton, Utah, film split opinion: one analysis found the images brighter than any bird, while a proposed press line called them balloons or gulls.",
    sources: [
      { id: "CIA-UAP-015", page: 4, note: "Special Report No. 14, 1955" },
      { id: "DOW-UAP-D154", page: 2, note: "Ruppelt: 800 cases, 20% unresolved" },
      { id: "DOW-UAP-D102", page: 37, note: "Images brighter than any bird" },
      { id: "DOW-UAP-D102", page: 38, note: "Press line: balloons or gulls" },
      { id: "DOW-UAP-D092", page: 9, note: "1960s review: bring in universities" },
    ],
  },
  police: {
    background:
      "Local law enforcement officers in Colorado filmed lights with cellphone cameras in October 2023 and January 2024 and reported them to AARO. Officers described orbs hovering for long periods, and one said radar showed no aircraft in the area. AARO notes that phone autofocus and image processing can distort distant subjects. It removed the audio and redacted identifying details, and the reports are labeled unresolved.",
    sources: [
      { id: "LLE-UAP-D004", page: 1, note: "January 2024: orb, no aircraft on radar" },
      { id: "LLE-UAP-D002", page: 1, note: "Transcript of 15-minute video, audio removed" },
      { id: "LLE-UAP-D002", page: 2, note: "Officer says lights stay for hours" },
      { id: "LLE-UAP-PR004", note: "AARO comment on phone image processing" },
    ],
  },
  "nuclear-sites": {
    background:
      "On 16 February 1949 scientists met in a Secret conference at Los Alamos to discuss green fireballs first reported by airline pilots in December 1948. A 1949 Air Force study noted sightings near Oak Ridge and the Hanford Works, and in 1952 Ruppelt described report concentrations around Los Alamos and Albuquerque. In September 2015, ground radar at the Pantex Plant near Amarillo, Texas, tracked an unknown object that security officers followed until it was no longer visible.",
    lore: "Popular accounts read sightings near atomic plants as alien interest; the 1949 Air Force study weighed sightings near Oak Ridge and Hanford as possible Soviet photographic reconnaissance.",
    sources: [
      { id: "DOE-UAP-D004", page: 2, note: "Secret Los Alamos fireball conference" },
      { id: "DOW-UAP-D094", page: 10, note: "Oak Ridge, Hanford: Soviet reconnaissance?" },
      { id: "DOW-UAP-D154", page: 3, note: "Ruppelt: concentrations around Los Alamos" },
      { id: "DOW-UAP-D017", page: 4, note: "Copper sample presumed local origin" },
      { id: "DOE-UAP-D005", page: 3, note: "Pantex radar tracks unknown object" },
    ],
  },
  "aaro-case-resolutions": {
    background:
      "AARO, the Pentagon's All-domain Anomaly Resolution Office, publishes case resolutions: short reports that set what was reported against what its analysts assess. The resolutions read here, dated 2023 to 2025, identify sightings as fishing nets, commercial aircraft, a balloon cluster and sky lanterns. They also find no anomalous performance by the object in the Navy's 2015 \"Go Fast\" video.",
    lore: "Popular accounts say the \"Go Fast\" object raced low over the ocean; the files show it was about 13,000 feet up, moving 5–92 mph, with its apparent speed caused by motion parallax.",
    sources: [
      { id: "AARO-Case_Resolution_of_Southeast_Asia_Triangles_508-02262024", page: 1, note: "Triangles were fishing nets" },
      { id: "AARO-Case_Resolution_of _Western_United_States_Uap_508-02262024.pdf", page: 1, note: "Lights were commercial aircraft" },
      { id: "AARO-AARO_Al_Taqaddam_Case_Resolution_Final.pdf", page: 1, note: "Iraq object was a balloon cluster" },
      { id: "AARO-AARO_Puerto_Rico_UAP_Case_Resolution.pdf", page: 1, note: "Aguadilla objects likely sky lanterns" },
      { id: "AARO-AARO_GoFast_Case_Resolution_Card_Methodology_Final.pdf", page: 3, note: "Go Fast speed explained by parallax" },
    ],
  },
  congress: {
    background:
      "This collection gathers UAP material that Congress has seen or asked for. It holds the transcript of the House Oversight task force's 9 September 2025 UAP hearing, videos that defense officials showed at open House and Senate hearings, and 49 videos AARO found on a classified network after eight House members requested 51 records on March 6, 2026. Letters from 1998 show NASA telling a senator it had no program for investigating UFOs.",
    sources: [
      { id: "CONGRESS-CHRG-119hhrg61718", page: 1, note: "Hearing title page, 9 September 2025" },
      { id: "CONGRESS-CHRG-119hhrg61718", page: 32, note: "Burlison plays Yemen MQ-9 orb video" },
      { id: "AARO-956955", note: "Navy video shown at 2022 House hearing" },
      { id: "DOW-UAP-PR050", note: "One of 49 House-request videos" },
      { id: "USG-UAP-D001", page: 4, note: "NASA reply to Senator Grassley, 1998" },
    ],
  },
};

// Agency hub backgrounds (spec 2026-10-03-realufo-case-stories-batch2-design):
// the AARO/NARA/NASA overviews moved from release.realufo.org. Same shape and
// rules as topic texts: every source is an archive file (PDF page = ?p=).
export const AGENCY_TEXT: Record<string, TopicText> = {
  aaro: {
  background:
    "The All-domain Anomaly Resolution Office (AARO) is the U.S. Department of Defense office that investigates unidentified anomalous phenomena (UAP). It grew out of a Navy-led UAP Task Force that the Deputy Secretary of Defense approved in August 2020. A successor group, the Airborne Object Identification and Management Synchronization Group (AOIMSG), was set up under the Under Secretary of Defense for Intelligence and Security to replace it. After the FY2022 National Defense Authorization Act, AOIMSG was renamed AARO on 15 July 2022 and given a wider mission. AARO reports to Congress in coordination with the Office of the Director of National Intelligence.\n\nDr. Sean Kirkpatrick was asked to stand up and lead the office in early 2022. By March 2024 Tim Phillips was acting director, and an August 2024 organization chart shows Jon Kosloski as director with Phillips as his deputy.\n\nThe files in this archive are AARO's own releases. They include Volume I of its Historical Record Report, presented to the press in March 2024; case resolutions such as the one on the Navy's January 2015 \"Go Fast\" video; and FOIA releases, from a director's biography to organization charts and press emails.\n\nTheir conclusions are consistent. Volume I found no evidence that any U.S. government investigation, academic research or official review panel had confirmed a UAP sighting as extraterrestrial technology, and it notes that the vast majority of cases lack usable data. AARO judged with high confidence that the Go Fast object did not move at anomalous speeds. A metal specimen publicly alleged to come from a crashed extraterrestrial vehicle in 1947 was assessed by Oak Ridge National Laboratory as terrestrial in origin, and AARO concurred.",
  lore: "Popular accounts say the U.S. government is secretly reverse-engineering recovered alien craft; AARO's Historical Record Report says it found no empirical evidence for those claims.",
  sources: [
    { id: "AARO-AARO_Historical_Record_Report_Vol_1_2024.pdf", page: 24, note: "UAP Task Force (2020), then AOIMSG" },
    { id: "AARO-AARO_Historical_Record_Report_Vol_1_2024.pdf", page: 25, note: "AARO established 15 July 2022" },
    { id: "AARO-AARO_Historical_Record_Report_Vol_1_2024.pdf", page: 7, note: "No evidence of extraterrestrial technology" },
    { id: "AARO-23-F-0922_1", page: 1, note: "Kirkpatrick asked to stand up AARO" },
    { id: "AARO-24-F-0922", page: 1, note: "Phillips, acting director, March 2024" },
    { id: "AARO-24-F-0448", page: 1, note: "Org chart, August 2024: Kosloski director" },
    { id: "AARO-AARO_GoFast_Case_Resolution_Card_Methodology_Final.pdf", page: 1, note: "Go Fast: no anomalous speeds" },
    { id: "AARO-AAROs_Supplement_to_ORNLs_Analysis_of_a_Metallic_Specimen", page: 1, note: "Alleged 1947 crash metal: terrestrial" },
  ],
},
  nara: {
  background:
    "The National Archives and Records Administration (NARA) keeps the U.S. government's permanent records. The files this archive lists under the National Archives are UFO records that other agencies created and NARA now holds: the Air Force's Project Blue Book case file on Socorro, New Mexico, and six Federal Aviation Administration files on Japan Air Lines flight 1628 over Alaska.\n\nThe Socorro file comes from NARA's copies of the Blue Book case files, which a 1994 Air Force report says the Air Force had turned over to the National Archives. It covers police officer Lonnie Zamora's report of a landed object on 24 April 1964. The project record card carries the case as UNIDENTIFIED pending additional data, and the Air Force summary found no evidence that the object was extraterrestrial in origin or a threat to the security of the United States.\n\nThe JAL 1628 files come from an FAA series titled \"Information Releases Relating to Unidentified Flying Object.\" They include Captain Kenju Terauchi's written statement, the transcript of an FAA interview with him on 2 January 1987, an Anchorage Center chronology and the FAA's news releases. On 5 March 1987 the FAA said it was unable to confirm the event; its Technical Center attributed a second radar target near the 747 to a split radar return from the aircraft itself.\n\nSince the 2024 National Defense Authorization Act, NARA also has a UFO role written into law. Section 1841 told the Archivist to begin building an \"Unidentified Anomalous Phenomena Records Collection\" within 60 days of enactment, made up of copies of all government records on the subject, to be opened for inspection and put online after transfer. A 2025 AARO paper says AARO is working with NARA to transfer UAP records for permanent storage and public access.",
  lore: "Roswell is often assumed to sit in the Project Blue Book files at the National Archives; the 1994 Air Force report says NARA told Congressman Schiff it was not part of them.",
  sources: [
    { id: "NARA-Blue-Book-Socorro-1964", page: 4, note: "Blue Book record card: Socorro carried as UNIDENTIFIED" },
    { id: "NARA-Blue-Book-Socorro-1964", page: 11, note: "Air Force summary: no evidence of extraterrestrial origin" },
    { id: "DOD-USAF-Roswell-Report-1994", page: 3, note: "Blue Book turned over to NARA; Roswell not in it" },
    { id: "NARA-JAL1628-733667-001-007", page: 6, note: "Terauchi's written statement" },
    { id: "NARA-JAL1628-733667-001-008", page: 11, note: "FAA interview of Terauchi, 2 Jan 1987" },
    { id: "NARA-JAL1628-733667-001-024", page: 3, note: "FAA news release, 5 March 1987: unable to confirm" },
    { id: "NARA-2024-NDAA-Public-Law-118-31", page: 564, note: "NDAA Sec. 1841: UAP Records Collection at NARA" },
    { id: "NARA-2024-NDAA-Public-Law-118-31", page: 565, note: "Sec. 1841: contents and public disclosure" },
    { id: "AARO-AARO_Declassification_Info_Paper_2025", page: 4, note: "AARO transferring UAP records to NARA" },
  ],
},
  nasa: {
  background:
    "NASA, the U.S. civilian space agency, appears in this archive in two ways: as the keeper of astronaut flight records that mention unexplained lights and objects, and as the sponsor of a 2022–2023 scientific study of UAP.\n\nThe flight records are air-to-ground transcripts and crew debriefings. On Gemini 7 in 1965, Frank Borman told Houston \"we have a bogey at ten o'clock high,\" then described what looked like hundreds of little particles about three or four miles away; the crew also had their booster in sight. A February 1962 NASA memo asked for a detailed account of the luminous particles John Glenn reported around his Friendship 7 spacecraft, for scientific evaluation.\n\nIn June 2022 NASA set up an independent study team of outside experts. Its terms of reference posed eight questions: which civilian, commercial and new data, and which analysis techniques, could shed light on the nature and origins of UAP. They called for about eight to twelve members; the final report lists 16, chaired by David Spergel of the Simons Foundation. The foreword says the study \"is not a review of previous UAP incidents\" and that NASA is appointing a Director of UAP Research.\n\nThe report finds that UAP are often caught by chance on sensors not designed or calibrated for them, without full metadata. It recommends that NASA use its Earth-observing satellites and commercial high-resolution imagery, apply artificial intelligence and machine learning, explore crowdsourced smartphone data, and make better use of the Aviation Safety Reporting System for pilot reports. One of the panel's discussion papers adds that there is \"no reason to conclude that existing UAP reports have an extraterrestrial source.\"",
  lore: "Glenn's luminous particles are often retold as an early astronaut UFO sighting; a 1962 NASA draft memo reasoned that their consistency over three orbits meant they were associated with the spacecraft itself.",
  sources: [
    { id: "NASA-UAP-D003", page: 1, note: "Gemini 7: Borman's bogey and particles" },
    { id: "NASA-UAP-D015", page: 55, note: "1962 memo on Glenn's luminous particles" },
    { id: "NASA-UAP-D015", page: 35, note: "Particles tied to the spacecraft itself" },
    { id: "NASA-UAPISTTermsofReference_Signed", page: 2, note: "Eight questions; 8 to 12 members" },
    { id: "NASA-uap-independent-study-team-final-report", page: 2, note: "16 members, chair David Spergel" },
    { id: "NASA-uap-independent-study-team-final-report", page: 9, note: "Foreword: June 2022, not a case review" },
    { id: "NASA-uap-independent-study-team-final-report", page: 23, note: "Overall conclusions and recommendations" },
    { id: "NASA-uap-independent-study-team-final-report", page: 35, note: "No reason to conclude extraterrestrial" },
  ],
},
};
