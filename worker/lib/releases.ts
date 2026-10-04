// Release tracker (spec 2026-10-03-realufo-release-tracker-design): the war.gov
// release series, the next-release window and data-written FAQs. Pure — D1
// access lives in routes/releases.ts. No AI text here: every sentence is built
// from counts and dates, and the window is always labelled as an estimate.
// No imports on purpose: the SPA imports these types (web/src/api/types.ts).

export type AgencyAlias = { slug: string; label: string; values: string[] };
export type ReleaseRow = { no: number; date: string; raw: string[] };
export type CountRow = { doc_date: string; agency: string | null; kind: string; n: number };
export interface AgencyCount { label: string; slug: string | null; count: number }
export interface ReleaseInfo {
  no: number; date: string; weekday: string; files: number; gap: number | null;
  agencies: AgencyCount[]; kinds: { pdf: number; video: number; image: number }; newAgencies: string[];
}
export interface NextWindow {
  next: number; earliest: string; likely: string; latest: string; state: "ahead" | "due" | "overdue";
  daysSince: number; shortestGap: number; longestGap: number; medianGap: number; sameWeekday: string | null;
}
export interface FaqItem { q: string; a: string; link?: { href: string; text: string } }
export interface TrackerData {
  series: ReleaseInfo[]; window: NextWindow | null; status: { headline: string; basis: string }; faq: FaqItem[];
}
export interface ReleaseBlock {
  info: ReleaseInfo; size: string; kinds: string;
  prev: { no: number; date: string } | null; next: { no: number; date: string } | null;
  upcoming: string | null; faq: FaqItem[];
}

const DAY = 86_400_000;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const ms = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const addDays = (d: string, n: number) => iso(ms(d) + n * DAY);
const daysBetween = (a: string, b: string) => Math.round((ms(b) - ms(a)) / DAY);
const weekdayOf = (d: string) => WEEKDAYS[new Date(ms(d)).getUTCDay()];
export const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const listJoin = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

export const pad2 = (n: number) => String(n).padStart(2, "0");
export const todayIso = () => new Date().toISOString().slice(0, 10);
export const longDate = (d: string) => {
  const t = new Date(ms(d));
  return `${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]} ${t.getUTCFullYear()}`;
};
// "Fri 2 Oct", or "Fri 2 Oct 2026" with the year.
export const shortDate = (d: string, withYear = false) => {
  const t = new Date(ms(d));
  return `${WEEKDAYS[t.getUTCDay()].slice(0, 3)} ${t.getUTCDate()} ${MONTHS[t.getUTCMonth()].slice(0, 3)}${withYear ? ` ${t.getUTCFullYear()}` : ""}`;
};

function agencyOf(raw: string | null, aliases: AgencyAlias[]): { label: string; slug: string | null } {
  const v = (raw ?? "").trim();
  if (!v) return { label: "Unknown agency", slug: null };
  const e = aliases.find((h) => h.values.includes(v));
  return e ? { label: e.label, slug: e.slug } : { label: v, slug: null };
}

export function releaseSeries(releases: ReleaseRow[], rows: CountRow[], aliases: AgencyAlias[]): ReleaseInfo[] {
  const seen = new Set<string>();
  return releases.map((r, i) => {
    const mine = rows.filter((x) => r.raw.includes(x.doc_date));
    const byLabel = new Map<string, AgencyCount>();
    const kinds = { pdf: 0, video: 0, image: 0 };
    for (const x of mine) {
      const a = agencyOf(x.agency, aliases);
      const e = byLabel.get(a.label) ?? { ...a, count: 0 };
      e.count += x.n;
      byLabel.set(a.label, e);
      if (x.kind === "pdf" || x.kind === "video" || x.kind === "image") kinds[x.kind] += x.n;
    }
    const agencies = [...byLabel.values()].sort((p, q) => q.count - p.count || p.label.localeCompare(q.label));
    const newAgencies = i === 0 ? [] : agencies.map((a) => a.label).filter((l) => !seen.has(l));
    for (const a of agencies) seen.add(a.label);
    return {
      no: r.no, date: r.date, weekday: weekdayOf(r.date), files: mine.reduce((n, x) => n + x.n, 0),
      gap: i ? daysBetween(releases[i - 1].date, r.date) : null, agencies, kinds, newAgencies,
    };
  });
}

export function nextWindow(series: ReleaseInfo[], today: string): NextWindow | null {
  if (series.length < 2) return null;
  const gaps = series.slice(1).map((r) => r.gap as number).sort((a, b) => a - b);
  const mid = gaps.length / 2;
  const medianGap = Math.round(gaps.length % 2 ? gaps[Math.floor(mid)] : (gaps[mid - 1] + gaps[mid]) / 2);
  const last = series[series.length - 1];
  const sameWeekday = series.every((r) => r.weekday === last.weekday) ? last.weekday : null;
  // Nearest date on the shared weekday (offset -3..+3).
  const snap = (d: string) => {
    if (!sameWeekday) return d;
    let diff = (WEEKDAYS.indexOf(sameWeekday) - new Date(ms(d)).getUTCDay() + 7) % 7;
    if (diff > 3) diff -= 7;
    return addDays(d, diff);
  };
  const earliest = snap(addDays(last.date, gaps[0]));
  const likely = snap(addDays(last.date, medianGap));
  const latest = snap(addDays(last.date, gaps[gaps.length - 1]));
  return {
    next: last.no + 1, earliest, likely, latest,
    state: today < earliest ? "ahead" : today <= latest ? "due" : "overdue",
    daysSince: daysBetween(last.date, today),
    shortestGap: gaps[0], longestGap: gaps[gaps.length - 1], medianGap, sameWeekday,
  };
}

const range = (w: NextWindow, withYear: boolean) =>
  w.earliest === w.latest ? shortDate(w.earliest, withYear) : `${shortDate(w.earliest)} – ${shortDate(w.latest, withYear)}`;

export function statusText(w: NextWindow | null): { headline: string; basis: string } {
  if (!w) return { headline: "Release schedule not established yet.", basis: "" };
  const next = `Release ${pad2(w.next)}`;
  const headline =
    w.state === "ahead"
      ? `${next}: no date announced. If the pattern holds: ${range(w, true)}, most likely around ${shortDate(w.likely)}.`
      : w.state === "due"
        ? `${next} is due any day: we're inside the expected window (${range(w, true)}), most likely around ${shortDate(w.likely)}. No date announced.`
        : `${next} is overdue: ${w.daysSince} days since Release ${pad2(w.next - 1)}; the longest gap so far was ${w.longestGap} days. No date announced.`;
  const gaps = w.shortestGap === w.longestGap ? `${w.shortestGap} days` : `${w.shortestGap}–${w.longestGap} days, median ${w.medianGap}`;
  const day = w.sameWeekday ? ` Every release so far landed on a ${w.sameWeekday}.` : "";
  return { headline, basis: `Based on the gaps between past releases: ${gaps}.${day}` };
}

// Short "next" slot on the newest release page.
export function upcomingText(w: NextWindow): string {
  const next = `Release ${pad2(w.next)}`;
  return w.state === "ahead" ? `${next}: expected ${range(w, false)}` : w.state === "due" ? `${next}: due any day` : `${next}: overdue`;
}

export function sizeLine(r: ReleaseInfo, prev: ReleaseInfo | null): string {
  if (!prev) return `${r.files} files: the first release`;
  const d = r.files - prev.files;
  return `${r.files} files, ${d >= 0 ? "+" : "−"}${Math.abs(d)} on Release ${pad2(prev.no)}`;
}

export function kindsText(k: ReleaseInfo["kinds"]): string {
  return [
    [k.video, "video"],
    [k.pdf, "PDF"],
    [k.image, "image"],
  ]
    .filter(([n]) => (n as number) > 0)
    .sort((a, b) => (b[0] as number) - (a[0] as number))
    .map(([n, w]) => plural(n as number, w as string))
    .join(", ");
}

export function agencyList(r: ReleaseInfo, max = Infinity): string {
  const shown = r.agencies.slice(0, max).map((a) => `${a.label} (${a.count})`).join(", ");
  const rest = r.agencies.length - Math.min(max, r.agencies.length);
  return rest > 0 ? `${shown} and ${rest} more` : shown;
}

export function trackerFaq(series: ReleaseInfo[], w: NextWindow | null): FaqItem[] {
  if (!series.length) return [];
  const first = series[0];
  const last = series[series.length - 1];
  const total = series.reduce((n, r) => n + r.files, 0);
  const s = statusText(w);
  const days = [...new Set(series.map((r) => r.weekday))];
  return [
    {
      q: "When is the next UFO file release?",
      a: w ? `${s.headline} ${s.basis}` : "No date has been announced, and there aren't enough releases yet to estimate one.",
    },
    {
      q: "How many UFO files have been released?",
      a: `${total} files across ${plural(series.length, "release")}, from Release ${pad2(first.no)} (${longDate(first.date)}) to Release ${pad2(last.no)} (${longDate(last.date)}).`,
    },
    {
      q: "How often are the UFO files released?",
      a: w
        ? `Every ${w.shortestGap}–${w.longestGap} days so far (median ${w.medianGap}). The gaps: ${listJoin(series.slice(1).map((r) => String(r.gap)))} days.`
        : "Only one release so far.",
    },
    {
      q: "What day of the week are they released?",
      a: days.length === 1 ? `Every release so far came out on a ${days[0]}.` : `On different days so far: ${listJoin(days)}.`,
    },
    {
      q: "Where do the UFO files come from?",
      a: "The U.S. Department of War publishes them at war.gov/UFO. RealUFO mirrors every file with its full text, summaries and video tools.",
      link: { href: "https://www.war.gov/UFO/", text: "war.gov/UFO" },
    },
    {
      q: "What was in the latest release?",
      a: `Release ${pad2(last.no)} (${longDate(last.date)}) has ${last.files} files: ${kindsText(last.kinds)}. Agencies: ${agencyList(last)}.`,
      link: { href: `/release/${last.no}`, text: `Release ${pad2(last.no)} files` },
    },
  ];
}

// picks: hub highlight picks with display titles (already re-checked against the hub).
export function releaseFaq(r: ReleaseInfo, series: ReleaseInfo[], w: NextWindow | null, picks: { id: string; title: string }[]): FaqItem[] {
  const p = pad2(r.no);
  const next = series.find((x) => x.no === r.no + 1);
  const faq: FaqItem[] = [
    { q: `When was Release ${p} published?`, a: `On ${r.weekday}, ${longDate(r.date)}.` },
    { q: `How many files are in Release ${p}?`, a: `${r.files} files: ${kindsText(r.kinds)}.` },
    { q: `Which agencies are in Release ${p}?`, a: `${agencyList(r)}.` },
  ];
  if (picks.length) faq.push({ q: `What are the notable files in Release ${p}?`, a: `${picks.slice(0, 3).map((x) => x.title).join("; ")}.` });
  faq.push({
    q: "When is the next release?",
    a: next ? `Release ${pad2(next.no)} came out on ${longDate(next.date)}.` : statusText(w).headline,
    link: { href: "/releases", text: "Release tracker" },
  });
  return faq;
}
