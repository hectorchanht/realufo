// Hub landing pages (spec 2026-10-02-realufo-hub-pages): which raw D1 values
// each hub covers, and the titles/intros written from a hub's own data. Pure —
// D1 access lives in routes/hubs.ts. D1 values are never rewritten; aliases
// merge duplicates and typos ("DoW" + "Department of War").
import { decadeOf, yearOf } from "./facets";

export type HubKind = "release" | "agency" | "location" | "decade";
export const HUB_KINDS: HubKind[] = ["release", "agency", "location", "decade"];
export const MIN_HUB_FILES = 5;

export interface HubSummary { kind: HubKind; slug: string; label: string; count: number }
export interface HubStats { files: number; pdf: number; video: number; image: number; from: string | null; to: string | null }
export type HubLinks = Partial<Record<HubKind, string>>;
type Entry = { slug: string; label: string; phrase: string; values: string[] };

export const AGENCY_HUBS: Entry[] = [
  { slug: "department-of-war", label: "Department of War", phrase: "from the U.S. Department of War (the Pentagon)", values: ["DoW", "Department of War"] },
  { slug: "fbi", label: "FBI", phrase: "from the Federal Bureau of Investigation (FBI)", values: ["FBI"] },
  { slug: "aaro", label: "AARO", phrase: "from the All-domain Anomaly Resolution Office (AARO)", values: ["AARO"] },
  { slug: "nara", label: "National Archives", phrase: "held by the U.S. National Archives (NARA)", values: ["NARA"] },
  { slug: "nasa", label: "NASA", phrase: "from NASA", values: ["NASA"] },
  { slug: "cia", label: "CIA", phrase: "from the Central Intelligence Agency (CIA)", values: ["CIA", "Central Intelligence Agency"] },
  { slug: "department-of-state", label: "Department of State", phrase: "from the U.S. Department of State", values: ["Department of State", "DoS"] },
  { slug: "department-of-energy", label: "Department of Energy", phrase: "from the U.S. Department of Energy", values: ["Department of Energy"] },
  { slug: "local-law-enforcement", label: "Local law enforcement", phrase: "from local law enforcement agencies", values: ["Local Law Enforcement"] },
];

export const LOCATION_HUBS: Entry[] = [
  { slug: "western-united-states", label: "Western United States", phrase: "about incidents in the western United States", values: ["Western United States", "Westen United States"] },
  { slug: "las-vegas-nevada", label: "Las Vegas, Nevada", phrase: "about incidents in Las Vegas, Nevada", values: ["Las Vegas, Nevada"] },
  { slug: "centcom", label: "CENTCOM (Middle East)", phrase: "about incidents in U.S. Central Command's area (CENTCOM)", values: ["CENTCOM"] },
  { slug: "middle-east", label: "Middle East", phrase: "about incidents in the Middle East", values: ["Middle East"] },
  { slug: "europe", label: "Europe", phrase: "about incidents in Europe", values: ["Europe"] },
  { slug: "iraq", label: "Iraq", phrase: "about incidents in Iraq", values: ["Iraq"] },
  { slug: "syria", label: "Syria", phrase: "about incidents in Syria", values: ["Syria"] },
  { slug: "arabian-gulf", label: "Arabian Gulf", phrase: "about incidents over the Arabian Gulf", values: ["Arabian Gulf"] },
  { slug: "northeastern-united-states", label: "Northeastern United States", phrase: "about incidents in the northeastern United States", values: ["Northeastern United States"] },
  { slug: "colorado", label: "Colorado", phrase: "about incidents in Colorado", values: ["Colorado", "Colorado Springs, Colorado", "Colorado Springs, Colorado, U.S."] },
  { slug: "eastern-united-states", label: "Eastern United States", phrase: "about incidents in the eastern United States", values: ["Eastern United States"] },
  { slug: "moon", label: "The Moon", phrase: "about sightings on or around the Moon", values: ["Moon"] },
  { slug: "yellow-sea", label: "Yellow Sea", phrase: "about incidents over the Yellow Sea", values: ["Yellow Sea"] },
  { slug: "washington-dc", label: "Washington, D.C.", phrase: "about incidents in Washington, D.C.", values: ["Washington, D.C."] },
  { slug: "east-china-sea", label: "East China Sea", phrase: "about incidents over the East China Sea", values: ["East China Sea"] },
  { slug: "pacific-ocean", label: "Pacific Ocean", phrase: "about incidents over the Pacific Ocean", values: ["Pacific Ocean"] },
  { slug: "greece", label: "Greece", phrase: "about incidents in Greece", values: ["Greece"] },
  { slug: "low-earth-orbit", label: "Low Earth orbit", phrase: "about sightings in low Earth orbit", values: ["Low Earth Orbit", "Low-Earth Orbit"] },
  { slug: "atlantic-ocean", label: "Atlantic Ocean", phrase: "about incidents over the Atlantic Ocean", values: ["Atlantic Ocean", "North Atlantic Ocean"] },
];

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const pad2 = (n: number) => String(n).padStart(2, "0");
// "2026-09-18" → [18, 8 (month index), 2026]
const ymd = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return [d, m - 1, y] as const;
};
const longDate = (iso: string) => {
  const [d, m, y] = ymd(iso);
  return `${d} ${MONTHS[m]} ${y}`;
};

export function releaseLabel(no: number, iso: string): string {
  const [d, m, y] = ymd(iso);
  return `Release ${pad2(no)} · ${d} ${MONTHS[m].slice(0, 3)} ${y}`;
}

export function hubTitle(h: HubSummary): string {
  if (h.kind === "release") return h.label;
  if (h.kind === "location") return `UAP files: ${h.label}`;
  return `${h.label} UAP files`;
}

export function hubStats(records: { kind: string; incident_date: string | null }[]): HubStats {
  const years = records.map((r) => yearOf(r.incident_date)).filter((y): y is string => !!y).sort();
  const n = (k: string) => records.filter((r) => r.kind === k).length;
  return {
    files: records.length, pdf: n("pdf"), video: n("video"), image: n("image"),
    from: years[0] ?? null, to: years[years.length - 1] ?? null,
  };
}

const entry = (kind: HubKind, slug: string) =>
  (kind === "agency" ? AGENCY_HUBS : kind === "location" ? LOCATION_HUBS : []).find((e) => e.slug === slug);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function hubIntro(h: HubSummary, release: { no: number; date: string } | null, s: HubStats): string {
  const phrase =
    h.kind === "release" && release
      ? `the Department of War published on ${longDate(release.date)} (Release ${pad2(release.no)})`
      : h.kind === "decade"
        ? `about incidents in the ${h.slug}`
        : entry(h.kind, h.slug)?.phrase ?? `about ${h.label}`;
  const parts = [plural(s.pdf, "PDF"), plural(s.video, "video"), plural(s.image, "image")].filter((p) => !p.startsWith("0 "));
  const years = !s.from || !s.to ? "" : s.from === s.to ? ` Incidents date from ${s.from}.` : ` Incidents span ${s.from}–${s.to}.`;
  return `${plural(s.files, "declassified UAP file")} ${phrase}: ${parts.join(", ")}.${years}`;
}

export function hubsFor(
  r: { agency: string | null; location: string | null; incident_date: string | null },
  releaseNo: number | null,
  live: Set<string>
): HubLinks {
  const out: HubLinks = {};
  const add = (kind: HubKind, slug: string | undefined) => {
    if (slug && live.has(`${kind}/${slug}`)) out[kind] = slug;
  };
  add("agency", AGENCY_HUBS.find((e) => e.values.includes(r.agency ?? ""))?.slug);
  add("location", LOCATION_HUBS.find((e) => e.values.includes(r.location ?? ""))?.slug);
  add("release", releaseNo ? String(releaseNo) : undefined);
  const dec = decadeOf(r.incident_date);
  add("decade", dec ? `${dec}s` : undefined);
  return out;
}
