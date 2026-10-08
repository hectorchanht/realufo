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
  query: string; // Amazon search query (fallback when asin is absent)
  asin?: string; // direct product link: amazon.com/dp/<asin> — preferred
  match?: string[]; // keywords (lowercase) matched against record title+summary
}

function amz(pick: AffiliatePick): string {
  const base = pick.asin
    ? `https://www.amazon.com/dp/${pick.asin}/`
    : `https://www.amazon.com/s?k=${encodeURIComponent(pick.query)}`;
  return AMAZON_TAG ? `${base}${pick.asin ? "?" : "&"}tag=${encodeURIComponent(AMAZON_TAG)}` : base;
}

export function affiliateUrl(pick: AffiliatePick): string {
  return amz(pick);
}

const PICKS: AffiliatePick[] = [
  {
    title: "The UFO Experience",
    creator: "J. Allen Hynek",
    blurb: "Written by Blue Book's own chief scientist — the astronomer who classified the very cases in this archive, and who went from skeptic to believer.",
    query: "The UFO Experience J Allen Hynek",
    asin: "1590033086",
    match: ["blue book", "hynek"],
  },
  {
    title: "The Hynek UFO Report",
    creator: "J. Allen Hynek",
    blurb: "A case-by-case walkthrough of hundreds of Blue Book files — the same incidents you're browsing, analyzed by the insider who read them all.",
    query: "Hynek UFO Report",
    asin: "1982187210",
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
    asin: "1585092262",
    match: ["flying disc", "flying saucer", "kenneth arnold", "1947"],
  },
  {
    title: "Flying Saucers Are Real",
    creator: "Donald Keyhoe",
    blurb: "The 1950 bestseller by a Marine Corps major that forced the Air Force to answer for the saucer wave, using the same era's official files.",
    query: "Flying Saucers Are Real Donald Keyhoe",
    asin: "8986476010",
    match: ["flying disc", "flying saucer", "keyhoe"],
  },
  {
    title: "UFOs and Nukes",
    creator: "Robert Hastings",
    blurb: "40 years, 160+ military witnesses: the definitive investigation of UFOs over nuclear weapons sites — the incidents in this archive are its source material.",
    query: "UFOs and Nukes Robert Hastings",
    asin: "1544822197",
    match: ["nuclear", "oak ridge", "los alamos", "missile", "silo", "warhead"],
  },
  {
    title: "Skinwalkers at the Pentagon",
    creator: "Lacatski, Kelleher & Knapp",
    blurb: "By the creator of the Pentagon's secret AAWSAP program itself — the insider account of the program behind these documents.",
    query: "Skinwalkers at the Pentagon Lacatski",
    asin: "B09HR54GQF",
    match: ["aawsap", "dird", "aatip", "bigelow", "skinwalker"],
  },
  {
    title: "Imminent",
    creator: "Luis Elizondo",
    blurb: "By the former Pentagon UAP official whose testimony drove the congressional hearings — the insider story behind the push for disclosure.",
    query: "Imminent Luis Elizondo",
    asin: "0063235560",
    match: ["elizondo", "congress", "hearing", "uaptf", "aaro", "grusch"],
  },
  {
    title: "The FBI-CIA-UFO Connection",
    creator: "Bruce Maccabee",
    blurb: "A Navy physicist documents — from declassified files — how deeply the FBI and CIA tracked UFOs through the Cold War. The files you're reading are his evidence.",
    query: "FBI CIA UFO Connection Maccabee",
    asin: "1502317214",
    match: ["fbi", "62-hq-83894", "cia", "hoover"],
  },
  {
    title: "UFOs and the National Security State",
    creator: "Richard Dolan",
    blurb: "The definitive history of the intelligence community's 50-year entanglement with UFOs — CIA, NSA, and the cover apparatus behind the documents.",
    query: "UFOs and the National Security State Dolan",
    asin: "1571743170",
    match: ["cia", "nsa", "intelligence community", "national security"],
  },
  {
    title: "Inside The Black Vault",
    creator: "John Greenewald",
    blurb: "By the man behind the world's largest FOIA UFO archive — how he pried these very documents out of the government, and what he learned.",
    query: "Inside The Black Vault Greenewald",
    asin: "1538118378",
    match: ["foia", "black vault"],
  },
  {
    title: "UFO: The Inside Story",
    creator: "Garrett Graff",
    blurb: "A Pulitzer finalist traces the government's 80-year search — from Roswell to the UAP hearings — through declassified documents like these.",
    query: "UFO Inside Story Garrett Graff",
    asin: "1982196777",
    match: ["roswell", "congress", "disclosure"],
  },
  {
    title: "The Report on Unidentified Flying Objects",
    creator: "Edward J. Ruppelt",
    blurb: "The insider the shelf was missing: the Air Force captain who ran Project Blue Book 1951–1953 wrote the first serious account of the official investigation — Washington 1952, the Lubbock Lights, the Mantell crash.",
    query: "Report on Unidentified Flying Objects Ruppelt",
    match: ["ruppelt", "blue book", "project grudge", "project sign", "washington 1952"],
  },
  {
    title: "Passport to Magonia",
    creator: "Jacques Vallée",
    blurb: "Hynek's own protégé goes furthest of all: UFO landings read against a thousand years of fairy lore. The multidimensional hypothesis starts here — the strangest book on the shelf, and the most influential.",
    query: "Passport to Magonia Jacques Vallee",
    asin: "0987422480",
    match: ["vallee", "magonia", "folklore", "fairy"],
  },
  {
    title: "UFOs: Generals, Pilots, and Government Officials Go on the Record",
    creator: "Leslie Kean",
    blurb: "A New York Times bestseller by an investigative journalist: generals, pilots and officials — Tehran 1976, Belgium 1989, the Phoenix Lights — write their own chapters. The credibility cornerstone of the modern UAP era.",
    query: "UFOs Generals Pilots Government Officials Go on the Record Leslie Kean",
    asin: "0307717089",
    match: ["kean", "generals", "tehran", "belgium", "phoenix lights"],
  },
  {
    title: "Hunt for the Skinwalker",
    creator: "Colm Kelleher & George Knapp",
    blurb: "Before the Pentagon's $22 million program, there was the ranch: the NIDS science team's instrumented investigation of Skinwalker Ranch — the direct predecessor of AAWSAP, by two of the same authors.",
    query: "Hunt for the Skinwalker Kelleher Knapp",
    asin: "1416505210",
    match: ["skinwalker", "nids", "bigelow", "ranch"],
  },
  {
    title: "Crash at Corona",
    creator: "Stanton Friedman & Don Berliner",
    blurb: "The nuclear physicist who reopened Roswell and an aviation writer rebuild the 1947 Corona crash from once-classified documents and debris-handler testimony. The definitive Roswell investigation.",
    query: "Crash at Corona Friedman Berliner",
    asin: "1605209392",
    match: ["roswell", "corona", "friedman", "debris", "retrieval"],
  },
  {
    title: "Clear Intent",
    creator: "Lawrence Fawcett & Barry Greenwood",
    blurb: "The FOIA pioneers' book: hundreds of declassified pages prised out of the CIA, FBI and NSA in the 1970s–80s. The playbook for reading the very files in this archive.",
    query: "Clear Intent Fawcett Greenwood",
    match: ["foia", "fawcett", "greenwood", "citizens against ufo secrecy"],
  },
  {
    title: "Encounter in Rendlesham Forest",
    creator: "Nick Pope, John Burroughs & Jim Penniston",
    blurb: "Britain's Roswell, on the record: the MoD's former UFO-desk chief plus the two USAF airmen who walked into the forest in December 1980 — backed by formerly-classified documents.",
    query: "Encounter in Rendlesham Forest Pope Burroughs Penniston",
    asin: "1250038103",
    match: ["rendlesham", "halt", "bentwaters", "woodbridge"],
  },
  {
    title: "A.D. After Disclosure",
    creator: "Richard Dolan & Bryce Zabel",
    blurb: "The historian behind the National Security State series teams with a Hollywood screenwriter to game out the day after disclosure — government, science, religion, markets. The 'what happens next' book.",
    query: "A.D. After Disclosure Dolan Zabel",
    asin: "1601632223",
    match: ["disclosure", "dolan", "zabel"],
  },
  {
    title: "Witness to Roswell",
    creator: "Thomas Carey & Donald Schmitt",
    blurb: "The Roswell deep-dive by its two most persistent investigators — new witnesses, the debris trail, and a foreword by Apollo astronaut Edgar Mitchell. The follow-on for Crash at Corona readers.",
    query: "Witness to Roswell Carey Schmitt",
    asin: "1637480032",
    match: ["roswell", "carey", "schmitt", "marcel"],
  },
  {
    title: "The Day After Roswell",
    creator: "Philip Corso & William Birnes",
    blurb: "The wildest insider claim ever published: a Pentagon colonel says he seeded Roswell wreckage tech — integrated circuits, fiber optics, lasers — into American industry. A bestseller; read it skeptical.",
    query: "The Day After Roswell Corso",
    asin: "067101756X",
    match: ["corso", "roswell", "reverse engineering", "day after roswell"],
  },
  {
    title: "Abduction: Human Encounters with Aliens",
    creator: "John E. Mack",
    blurb: "A Harvard psychiatrist and Pulitzer winner puts his career on the line for 60+ experiencers — the clinical counterweight to every 'it's all bunk' memo in this archive.",
    query: "Abduction Human Encounters with Aliens John Mack",
    asin: "1416575804",
    match: ["abduction", "mack", "experiencers", "harvard"],
  },
  {
    title: "Communion",
    creator: "Whitley Strieber",
    blurb: "The 1987 bestseller that put the abduction experience on the map, by the horror novelist who lived it. Love it or doubt it — it's the book every case file gets compared against.",
    query: "Communion Whitley Strieber",
    asin: "0061474185",
    match: ["communion", "strieber", "abduction"],
  },
  {
    title: "Night Siege",
    creator: "J. Allen Hynek, Philip Imbrogno & Bob Pratt",
    blurb: "7,000+ sightings of silent boomerang craft over New York and Connecticut, 1982–86 — investigated by Hynek himself. The mass-sighting classic for the triangle files.",
    query: "Night Siege Hudson Valley UFO Hynek Imbrogno",
    asin: "B0036DD2LC",
    match: ["hudson valley", "triangle", "boomerang", "imbrogno"],
  },
  {
    title: "The Interrupted Journey",
    creator: "John G. Fuller",
    blurb: "September 1961, New Hampshire: the first abduction book, built from the Hills' hypnosis transcripts — and they filed a contemporaneous Air Force report. Where the modern abduction story starts.",
    query: "The Interrupted Journey John Fuller Betty Barney Hill",
    asin: "0285624504",
    match: ["hill", "betty", "barney", "abduction"],
  },
  {
    title: "Fire in the Sky",
    creator: "Travis Walton",
    blurb: "November 1975, Arizona: six loggers watch Walton taken, polygraphs all round, five days gone. The abduction case with the most witnesses — and a Hollywood film.",
    query: "Fire in the Sky Travis Walton",
    asin: "1569247102",
    match: ["walton", "heber", "snowflake", "apache-sitgreaves"],
  },
  {
    title: "Mirage Men",
    creator: "Mark Pilkington",
    blurb: "The uncomfortable one: a journalist argues US intel promoted crashed-saucer stories — Bennewitz, Dulce, AFOSI's Richard Doty — as cover for classified programs. Read it alongside the cover-up histories.",
    query: "Mirage Men Mark Pilkington",
    asin: "1845298578",
    match: ["disinformation", "bennewitz", "dulce", "doty"],
  },
  {
    title: "Area 51",
    creator: "Annie Jacobsen",
    blurb: "The declassified history of Groom Lake — U-2, OXCART, Have Blue — plus the book's notorious claim that Roswell was a Soviet hoax. Essential context, controversial ending.",
    query: "Area 51 Annie Jacobsen",
    asin: "0316202304",
    match: ["area 51", "groom lake", "roswell"],
  },
  {
    title: "Phenomena",
    creator: "Annie Jacobsen",
    blurb: "Forty years of CIA, DIA and Army remote-viewing and parapsychology — the Stargate Project, SRI, Puthoff and Targ — built entirely from declassified documents.",
    query: "Phenomena Annie Jacobsen",
    asin: "0316349364",
    match: ["remote viewing", "stargate", "psychic", "esp"],
  },
  {
    title: "American Cosmic",
    creator: "D. W. Pasulka",
    blurb: "A religion professor's field study of the modern UFO belief system — Silicon Valley contactee networks, the To the Stars milieu, Vallée and Garry Nolan as informants. The AATIP era, anthropologized.",
    query: "American Cosmic D W Pasulka",
    asin: "019069288X",
    match: ["aatip", "uap", "disclosure", "to the stars"],
  },
  {
    title: "Top Secret/Majic",
    creator: "Stanton T. Friedman",
    blurb: "The physicist's 21-year investigation of the MJ-12 documents — Truman's alleged 1947 secret UFO group and the Roswell paper trail. The pro-MJ-12 case at its strongest.",
    query: "Top Secret Majic Stanton Friedman",
    asin: "B0CH83SR9V",
    match: ["majestic 12", "mj-12", "roswell", "truman"],
  },
  {
    title: "The Majestic Documents",
    creator: "Robert M. Wood & Ryan S. Wood",
    blurb: "The leaked documents themselves, compiled: the SOM1-01 recovery manual, the Interplanetary Phenomenon Unit report, the Einstein–Oppenheimer memo. Primary sources for the MJ-12 debate.",
    query: "The Majestic Documents Wood",
    asin: "B002P26AJG",
    match: ["majestic 12", "som1-01", "interplanetary phenomenon unit", "mj-12"],
  },
  {
    title: "Dark Object",
    creator: "Don Ledger & Chris Styles",
    blurb: "October 1967, Shag Harbour, Nova Scotia: three RCMP officers watch it go down, the Navy dives for it, the official file calls it a UFO. The world's only government-documented UFO crash — Canada's Roswell.",
    query: "Dark Object Ledger Styles Shag Harbour",
    match: ["shag harbour", "nova scotia", "canada", "1967"],
  },
  {
    title: "Need to Know",
    creator: "Timothy Good",
    blurb: "Good's dossier of military-intelligence insider testimonies and declassified documents — carrier encounters, the Hillenkoetter quote, and how the services really handled UFOs.",
    query: "Need to Know Timothy Good UFOs military intelligence",
    match: ["need to know", "good", "military", "intelligence"],
  },
  {
    title: "Intruders",
    creator: "Budd Hopkins",
    blurb: "The New York Times bestseller that mainstreamed the abduction narrative — the Kathie Davis Indiana case, missing time, the hybrid-breeding theme. Dedicated to J. Allen Hynek; spawned the 1992 CBS miniseries.",
    query: "Intruders Budd Hopkins",
    asin: "0345346335",
    match: ["abduction", "hopkins", "missing time", "copley"],
  },
  {
    title: "Faded Giant",
    creator: "Robert Salas",
    blurb: "March 1967, Malmstrom AFB: Salas sat the Oscar Flight capsule while UFOs shut down 10 Minuteman missiles overhead. The firsthand account behind the archive's nuclear-sites files.",
    query: "Faded Giant Robert Salas",
    asin: "1419603418",
    match: ["malmstrom", "missile", "oscar flight", "salas", "1967"],
  },
  {
    title: "The Andreasson Affair",
    creator: "Raymond E. Fowler",
    blurb: "A 12-month CUFOS investigation of Betty Andreasson's 1967 Massachusetts abduction — hypnosis transcripts, lie-detector tests, her own drawings. The best-documented close encounter of the fourth kind of its era.",
    query: "The Andreasson Affair Raymond Fowler",
    asin: "1601633467",
    match: ["andreasson", "betty", "abduction", "ce-iv", "fowler"],
  },
  {
    title: "Missing Time",
    creator: "Budd Hopkins",
    blurb: "The book that coined 'missing time' as the common thread of abduction reports — seven experiencers under hypnosis. The clinical foundation Hopkins, Jacobs and Mack all built on.",
    query: "Missing Time Budd Hopkins",
    asin: "0345353358",
    match: ["missing time", "hopkins", "hypnosis", "abduction"],
  },
  {
    title: "The Threat",
    creator: "David M. Jacobs",
    blurb: "Temple historian Jacobs' 700+ regression interviews argue a covert hybrid-breeding agenda aimed at domination — the darkest academic reading of the abduction files, and the counterweight to Mack.",
    query: "The Threat David Jacobs",
    asin: "0684848139",
    match: ["jacobs", "hybrids", "threat", "abduction", "roper"],
  },
  {
    title: "Passport to the Cosmos",
    creator: "John E. Mack",
    blurb: "Mack's follow-up to Abduction — the Harvard psychiatrist's case that the phenomenon demands a new science of human experience. He survived a Harvard inquiry into his methods.",
    query: "Passport to the Cosmos John Mack",
    asin: "0609805576",
    match: ["mack", "cosmos", "experiencers", "harvard", "transformation"],
  },
  {
    title: "In Plain Sight",
    creator: "Ross Coulthart",
    blurb: "Five-time Walkley winner Coulthart's investigation of the modern disclosure beat — the Wilson/Davis memos, crash-retrieval claims, Nat Kobitz's admission. The journalist's entry point to the UAP era.",
    query: "In Plain Sight Ross Coulthart",
    asin: "B09B7ZJ9TP",
    match: ["coulthart", "disclosure", "wilson", "crash retrieval", "uap"],
  },
  {
    title: "Encounters",
    creator: "D. W. Pasulka",
    blurb: "Pasulka's follow-up to American Cosmic — experiencers, the Trinity crash material, AI-as-intelligence, and the UFO-as-religion thesis extended into the disclosure era.",
    query: "Encounters D W Pasulka",
    asin: "1250879566",
    match: ["pasulka", "encounters", "nonhuman", "trinity", "experiencers"],
  },
  {
    title: "Pascagoula",
    creator: "Calvin Parker",
    blurb: "October 1973, Mississippi: Parker's firsthand account of the abduction that turned skeptical deputies into believers — includes his full hypnotic-regression transcript with the late Budd Hopkins.",
    query: "Pascagoula Calvin Parker",
    asin: "198299584X",
    match: ["pascagoula", "hickson", "parker", "1973", "mississippi"],
  },
  {
    title: "The Invisible College",
    creator: "Jacques Vallée",
    blurb: "Vallée's 'control system' hypothesis — UFO encounters as a belief-manipulation mechanism operating across history. Written out of his Project Blue Book years alongside Hynek.",
    query: "The Invisible College Jacques Vallee",
    asin: "1938398513",
    match: ["vallee", "invisible college", "control system", "hynek"],
  },
  {
    title: "The Aztec UFO Incident",
    creator: "Scott & Suzanne Ramsey",
    blurb: "The Ramseys' case for the alleged 1948 Aztec, New Mexico saucer recovery — declassified documents, eyewitness interviews, and the Frank Scully story revisited with new evidence. Preface by Stanton Friedman.",
    query: "The Aztec UFO Incident Ramsey",
    asin: "1632650010",
    match: ["aztec", "crash", "new mexico", "1948", "scully"],
  },
  {
    title: "Socorro 'Saucer'",
    creator: "Ray Stanford",
    blurb: "April 1964, Lonnie Zamora's landing — Stanford's account, including his claim that NASA-Goddard scientists suppressed metal-fragment test results at the intelligence community's behest. He arrived at the site alongside Hynek.",
    query: "Socorro Saucer Ray Stanford",
    asin: "0917092007",
    match: ["socorro", "zamora", "1964", "landing", "pentagon"],
  },
  {
    title: "The Braxton County Monster",
    creator: "Frank C. Feschino Jr.",
    blurb: "September 1952, Flatwoods, West Virginia — tied to the Washington DC saucer swarms of July 1952, Project Blue Book, and Ruppelt's investigation. The deep dive on the Flatwoods Monster.",
    query: "The Braxton County Monster Feschino",
    asin: "0578128837",
    match: ["flatwoods", "braxton", "1952", "monster", "west virginia"],
  },
];

// The full 48-book shelf, in D1 affiliate_picks sort order.
export const ALL_PICKS: AffiliatePick[] = PICKS;

// Topic hub pages: which picks show on each topic.
const TOPIC_PICKS: Record<string, string[]> = {
  "project-blue-book": ["The UFO Experience", "The Hynek UFO Report", "Project Blue Book Declassified", "The Report on Unidentified Flying Objects", "The Braxton County Monster"],
  "flying-discs": ["The Coming of the Saucers", "Flying Saucers Are Real"],
  "nuclear-sites": ["UFOs and Nukes", "Faded Giant"],
  "aawsap": ["Skinwalkers at the Pentagon", "Hunt for the Skinwalker"],
  "congress": ["Imminent", "UFO: The Inside Story", "UFOs: Generals, Pilots, and Government Officials Go on the Record", "A.D. After Disclosure", "In Plain Sight"],
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
