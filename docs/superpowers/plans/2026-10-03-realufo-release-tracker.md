# Release Tracker + Richer Release Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `/releases` tracker page (schedule, gaps, labelled next-release window, FAQ) and richer `/release/N` pages (UFO title, what's new, dated prev/next, FAQ), identical for crawlers and the SPA.

**Architecture:** One pure module `worker/lib/releases.ts` computes the series, window, status text and FAQs from rows already in D1. `worker/routes/releases.ts` loads and caches the data (1 h `cachedJson`) and serves `/api/releases` plus a `ReleaseBlock` for release hubs. Crawler HTML (`ssr.ts`/`pages.ts`) and the SPA (`Releases.tsx`, `Hub.tsx`) render the same objects.

**Tech Stack:** Cloudflare Worker (TypeScript, D1, Cache API), vitest + `@cloudflare/vitest-pool-workers`, React 18 + react-router + TanStack Query, Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-03-realufo-release-tracker-design.md`

## Global Constraints

- FAQ and what's-new text are written from data only — no AI text (hub highlights are the only AI content and keep their "AI-written" label).
- The estimate is always labelled: every status headline contains "no date announced" / "No date announced" except the "schedule not established" state.
- Window = last release + min / median / max gap; dates snap to the shared weekday only while every release shares it. Median of an even count = mean of the middle two, rounded.
- State: `today < earliest` → `ahead`; `earliest ≤ today ≤ latest` → `due`; `today > latest` → `overdue`; fewer than 2 releases → no window (`null`).
- Agencies merge through `AGENCY_HUBS` (label + slug); unlisted raw values shown as-is with `slug: null`; empty → "Unknown agency".
- Release hub title: `Pentagon UFO Files Release 06 (18 Sep 2026): 74 Files`; chip label (`releaseLabel`) unchanged.
- Tracker title: `Pentagon UFO File Releases: Dates, Schedule & Next Release`.
- Data cached 1 h under `${origin}/__releases`; "today" = Worker clock, UTC ISO date.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; stage only the files you touched (other sessions share this checkout).
- Worker tests: `npx vitest run -c worker/vitest.config.ts <file>` from repo root. Web tests: `cd web && npx vitest run <file>`. The web suite has 19 pre-existing failures (client/theme/localStorage); compare against that baseline, don't fix them.

## Review Focus

- Today exactly on `earliest` or `latest` must be `due` (inclusive bounds) — pinned in Task 1.
- A release whose agency column is NULL or blank must not crash and shows "Unknown agency" — pinned in Task 1.
- `/releases` must still render (plain title + description) if the D1 query throws — pinned in Task 4.
- A release hub with no highlight picks must omit the notable-files FAQ item (no empty answer) — pinned in Task 1.
- Non-release hubs (agency/location/decade) must not gain a `release` block or FAQ JSON-LD — pinned in Task 3 and Task 4.

---

## File Structure

- Create `worker/lib/releases.ts` — pure, import-free: types (incl. `TrackerData`, `ReleaseBlock`), `releaseSeries`, `nextWindow`, `statusText`, `upcomingText`, `sizeLine`, `kindsText`, `agencyList`, `trackerFaq`, `releaseFaq`, date helpers.
- Create `worker/routes/releases.ts` — D1 + cache: `loadSeries`, `trackerData`, `releaseBlock`, `releasesApi`.
- Modify `worker/lib/hubs.ts` — release `hubTitle`.
- Modify `worker/routes/hubs.ts` — `Hub.release`, call `releaseBlock` for release hubs.
- Modify `worker/index.ts` — route `GET /api/releases`.
- Modify `worker/lib/shared.ts` — `RELEASES_TITLE`, `RELEASES_DESCRIPTION` (worker + SPA).
- Modify `worker/lib/meta.ts` — `MetaInput.faq` → FAQPage JSON-LD.
- Modify `worker/lib/ssr.ts` — `faqHtml`, `releaseBlockHtml`, `releasesBody`, `hubBody` release blocks, `browseBody` tracker link.
- Modify `worker/lib/pages.ts` — `/releases` loader + route; hub loader passes `faq` and release description.
- Modify `worker/routes/sitemap.ts`, `worker/routes/llms.ts` — add `/releases`.
- Web: `web/src/api/types.ts` (Hub.release), `web/src/api/queries.ts` (`useReleases`), create `web/src/screens/Releases.tsx`, create `web/src/components/Faq.tsx`, modify `web/src/router.tsx`, `web/src/screens/Hub.tsx`, `web/src/screens/Browse.tsx`, `web/src/components/SiteFooter.tsx`.
- Tests: create `worker/tests/releases-lib.spec.ts`, `worker/tests/releases.spec.ts`, `web/src/tests/releases.test.tsx`; modify `worker/tests/hubs-lib.spec.ts`, `worker/tests/hubs.spec.ts`, `worker/tests/meta.spec.ts`, `worker/tests/sitemap.spec.ts`, `web/src/tests/hub.test.tsx`.

---

### Task 1: Pure release module

**Files:**
- Create: `worker/lib/releases.ts`
- Test: `worker/tests/releases-lib.spec.ts`

**Interfaces:**
- Consumes: nothing at runtime — the module has **no imports** so the SPA can import its types without pulling Worker-only code. Callers pass the agency alias table (`AGENCY_HUBS` from `worker/lib/hubs.ts`, shape `{ slug, label, values }[]`).
- Produces (all exported from `worker/lib/releases.ts`):
  - `type ReleaseRow = { no: number; date: string; raw: string[] }` (same shape `wargovReleases()` returns minus `count`; extra fields are ignored)
  - `type CountRow = { doc_date: string; agency: string | null; kind: string; n: number }`
  - `interface AgencyCount { label: string; slug: string | null; count: number }`
  - `interface ReleaseInfo { no: number; date: string; weekday: string; files: number; gap: number | null; agencies: AgencyCount[]; kinds: { pdf: number; video: number; image: number }; newAgencies: string[] }`
  - `interface NextWindow { next: number; earliest: string; likely: string; latest: string; state: "ahead" | "due" | "overdue"; daysSince: number; shortestGap: number; longestGap: number; medianGap: number; sameWeekday: string | null }`
  - `interface FaqItem { q: string; a: string; link?: { href: string; text: string } }`
  - `type AgencyAlias = { slug: string; label: string; values: string[] }`
  - `releaseSeries(releases: ReleaseRow[], rows: CountRow[], aliases: AgencyAlias[]): ReleaseInfo[]`
  - `interface TrackerData { series: ReleaseInfo[]; window: NextWindow | null; status: { headline: string; basis: string }; faq: FaqItem[] }`
  - `interface ReleaseBlock { info: ReleaseInfo; size: string; kinds: string; prev: { no: number; date: string } | null; next: { no: number; date: string } | null; upcoming: string | null; faq: FaqItem[] }`
  - `nextWindow(series: ReleaseInfo[], today: string): NextWindow | null`
  - `statusText(win: NextWindow | null): { headline: string; basis: string }`
  - `upcomingText(win: NextWindow): string`
  - `sizeLine(r: ReleaseInfo, prev: ReleaseInfo | null): string`
  - `kindsText(k: ReleaseInfo["kinds"]): string`
  - `agencyList(r: ReleaseInfo, max?: number): string`
  - `trackerFaq(series: ReleaseInfo[], win: NextWindow | null): FaqItem[]`
  - `releaseFaq(r: ReleaseInfo, series: ReleaseInfo[], win: NextWindow | null, picks: { id: string; title: string }[]): FaqItem[]`
  - `longDate(iso: string): string` ("18 September 2026"), `shortDate(iso: string, withYear?: boolean): string` ("Fri 2 Oct"), `pad2(n: number): string`, `todayIso(): string`

- [ ] **Step 1: Write the failing tests**

Create `worker/tests/releases-lib.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  releaseSeries, nextWindow, statusText, upcomingText, sizeLine, kindsText, agencyList, trackerFaq, releaseFaq,
  shortDate, longDate, type CountRow, type ReleaseRow,
} from "../lib/releases";
import { AGENCY_HUBS } from "../lib/hubs";

// The six real war.gov releases (prod, 2026-10-03).
const RELEASES: ReleaseRow[] = [
  { no: 1, date: "2026-05-08", raw: ["5/8/26"] },
  { no: 2, date: "2026-05-22", raw: ["5/22/26"] },
  { no: 3, date: "2026-06-12", raw: ["6/12/26"] },
  { no: 4, date: "2026-07-10", raw: ["7/10/26"] },
  { no: 5, date: "2026-08-07", raw: ["8/7/26"] },
  { no: 6, date: "2026-09-18", raw: ["9/18/26"] },
];
const ROWS: CountRow[] = [
  { doc_date: "5/8/26", agency: "DoW", kind: "pdf", n: 100 },
  { doc_date: "5/8/26", agency: "Department of War", kind: "video", n: 60 },
  { doc_date: "5/8/26", agency: "IC", kind: "pdf", n: 9 },
  { doc_date: "5/22/26", agency: "CIA", kind: "pdf", n: 56 },
  { doc_date: "6/12/26", agency: "DoW", kind: "video", n: 69 },
  { doc_date: "7/10/26", agency: "DoW", kind: "video", n: 36 },
  { doc_date: "8/7/26", agency: "DoW", kind: "video", n: 41 },
  { doc_date: "9/18/26", agency: "DoW", kind: "video", n: 70 },
  { doc_date: "9/18/26", agency: "Local Law Enforcement", kind: "pdf", n: 4 },
];
const series = releaseSeries(RELEASES, ROWS, AGENCY_HUBS);

describe("releaseSeries", () => {
  it("counts files, gaps and weekdays per release", () => {
    expect(series.map((r) => r.files)).toEqual([169, 56, 69, 36, 41, 74]);
    expect(series.map((r) => r.gap)).toEqual([null, 14, 21, 28, 28, 42]);
    expect(series.every((r) => r.weekday === "Friday")).toBe(true);
    expect(series[5].kinds).toEqual({ pdf: 4, video: 70, image: 0 });
  });
  it("merges agency aliases through AGENCY_HUBS and keeps unknown values as-is", () => {
    expect(series[0].agencies).toEqual([
      { label: "Department of War", slug: "department-of-war", count: 160 },
      { label: "IC", slug: null, count: 9 },
    ]);
  });
  it("lists agencies new in a release (none for the first)", () => {
    expect(series[0].newAgencies).toEqual([]);
    expect(series[1].newAgencies).toEqual(["CIA"]);
    expect(series[2].newAgencies).toEqual([]);
    expect(series[5].newAgencies).toEqual(["Local law enforcement"]);
  });
  it("labels a NULL or blank agency 'Unknown agency' instead of crashing", () => {
    const s = releaseSeries([{ no: 1, date: "2026-05-08", raw: ["5/8/26"] }], [
      { doc_date: "5/8/26", agency: null, kind: "pdf", n: 2 },
      { doc_date: "5/8/26", agency: "  ", kind: "pdf", n: 1 },
    ], AGENCY_HUBS);
    expect(s[0].agencies).toEqual([{ label: "Unknown agency", slug: null, count: 3 }]);
  });
});

describe("nextWindow", () => {
  it("window = last + min/median/max gap, snapped to Friday", () => {
    const w = nextWindow(series, "2026-10-03")!;
    expect(w).toMatchObject({
      next: 7, earliest: "2026-10-02", likely: "2026-10-16", latest: "2026-10-30",
      shortestGap: 14, medianGap: 28, longestGap: 42, sameWeekday: "Friday", daysSince: 15,
    });
  });
  it("state by today, with inclusive bounds", () => {
    expect(nextWindow(series, "2026-09-25")!.state).toBe("ahead");
    expect(nextWindow(series, "2026-10-02")!.state).toBe("due");
    expect(nextWindow(series, "2026-10-03")!.state).toBe("due");
    expect(nextWindow(series, "2026-10-30")!.state).toBe("due");
    const late = nextWindow(series, "2026-11-05")!;
    expect(late.state).toBe("overdue");
    expect(late.daysSince).toBe(48);
  });
  it("no weekday snapping once releases fall on different days", () => {
    const mixed = releaseSeries([...RELEASES.slice(0, 5), { no: 6, date: "2026-09-16", raw: ["9/16/26"] }], ROWS, AGENCY_HUBS);
    const w = nextWindow(mixed, "2026-10-03")!;
    expect(w.sameWeekday).toBeNull();
    // gaps 14,21,28,28,40 → median 28; 16 Sep + 14/28/40
    expect([w.earliest, w.likely, w.latest]).toEqual(["2026-09-30", "2026-10-14", "2026-10-26"]);
  });
  it("median of an even number of gaps is the rounded mean of the middle two", () => {
    const four = releaseSeries(RELEASES.slice(0, 5), ROWS, AGENCY_HUBS); // gaps 14,21,28,28
    expect(nextWindow(four, "2026-08-08")!.medianGap).toBe(25); // (21+28)/2 = 24.5 → 25
  });
  it("null with fewer than two releases", () => {
    expect(nextWindow(series.slice(0, 1), "2026-10-03")).toBeNull();
    expect(nextWindow([], "2026-10-03")).toBeNull();
  });
});

describe("text", () => {
  it("dates", () => {
    expect(shortDate("2026-10-02")).toBe("Fri 2 Oct");
    expect(shortDate("2026-10-30", true)).toBe("Fri 30 Oct 2026");
    expect(longDate("2026-09-18")).toBe("18 September 2026");
  });
  it("status per state, always labelled as an estimate", () => {
    expect(statusText(nextWindow(series, "2026-09-25"))).toEqual({
      headline: "Release 07: no date announced. If the pattern holds: Fri 2 Oct – Fri 30 Oct 2026, most likely around Fri 16 Oct.",
      basis: "Based on the gaps between past releases: 14–42 days, median 28. Every release so far landed on a Friday.",
    });
    expect(statusText(nextWindow(series, "2026-10-03")).headline).toBe(
      "Release 07 is due any day: we're inside the expected window (Fri 2 Oct – Fri 30 Oct 2026), most likely around Fri 16 Oct. No date announced."
    );
    expect(statusText(nextWindow(series, "2026-11-05")).headline).toBe(
      "Release 07 is overdue: 48 days since Release 06; the longest gap so far was 42 days. No date announced."
    );
    expect(statusText(null)).toEqual({ headline: "Release schedule not established yet.", basis: "" });
  });
  it("upcoming slot text", () => {
    expect(upcomingText(nextWindow(series, "2026-09-25")!)).toBe("Release 07: expected Fri 2 Oct – Fri 30 Oct");
    expect(upcomingText(nextWindow(series, "2026-10-03")!)).toBe("Release 07: due any day");
    expect(upcomingText(nextWindow(series, "2026-11-05")!)).toBe("Release 07: overdue");
  });
  it("size, kinds and agency lines", () => {
    expect(sizeLine(series[5], series[4])).toBe("74 files, +33 on Release 05");
    expect(sizeLine(series[1], series[0])).toBe("56 files, −113 on Release 01");
    expect(sizeLine(series[0], null)).toBe("169 files: the first release");
    expect(kindsText(series[5].kinds)).toBe("70 videos, 4 PDFs");
    expect(kindsText({ pdf: 1, video: 0, image: 1 })).toBe("1 PDF, 1 image");
    expect(agencyList(series[0])).toBe("Department of War (160), IC (9)");
    expect(agencyList(series[0], 1)).toBe("Department of War (160) and 1 more");
  });
});

describe("FAQs", () => {
  it("tracker FAQ answers from data", () => {
    const faq = trackerFaq(series, nextWindow(series, "2026-10-03"));
    expect(faq.map((f) => f.q)).toEqual([
      "When is the next UFO file release?",
      "How many UFO files have been released?",
      "How often are the UFO files released?",
      "What day of the week are they released?",
      "Where do the UFO files come from?",
      "What was in the latest release?",
    ]);
    expect(faq[0].a).toMatch(/^Release 07 is due any day/);
    expect(faq[1].a).toBe("445 files across 6 releases, from Release 01 (8 May 2026) to Release 06 (18 September 2026).");
    expect(faq[2].a).toBe("Every 14–42 days so far (median 28). The gaps: 14, 21, 28, 28 and 42 days.");
    expect(faq[3].a).toBe("Every release so far came out on a Friday.");
    expect(faq[4].link).toEqual({ href: "https://www.war.gov/UFO/", text: "war.gov/UFO" });
    expect(faq[5]).toEqual({
      q: "What was in the latest release?",
      a: "Release 06 (18 September 2026) has 74 files: 70 videos, 4 PDFs. Agencies: Department of War (70), Local law enforcement (4).",
      link: { href: "/release/6", text: "Release 06 files" },
    });
  });
  it("tracker FAQ with one release says no date is announced", () => {
    const one = series.slice(0, 1);
    const faq = trackerFaq(one, null);
    expect(faq[0].a).toBe("No date has been announced, and there aren't enough releases yet to estimate one.");
    expect(faq[2].a).toBe("Only one release so far.");
  });
  it("release FAQ; notable files only when there are picks", () => {
    const win = nextWindow(series, "2026-10-03");
    const faq = releaseFaq(series[5], series, win, [{ id: "A", title: "Orb over Syria" }, { id: "B", title: "Police clip" }]);
    expect(faq.map((f) => f.q)).toEqual([
      "When was Release 06 published?",
      "How many files are in Release 06?",
      "Which agencies are in Release 06?",
      "What are the notable files in Release 06?",
      "When is the next release?",
    ]);
    expect(faq[0].a).toBe("On Friday, 18 September 2026.");
    expect(faq[1].a).toBe("74 files: 70 videos, 4 PDFs.");
    expect(faq[3].a).toBe("Orb over Syria; Police clip.");
    expect(faq[4].a).toMatch(/^Release 07 is due any day/);
    expect(faq[4].link).toEqual({ href: "/releases", text: "Release tracker" });
    const older = releaseFaq(series[4], series, win, []);
    expect(older.map((f) => f.q)).not.toContain("What are the notable files in Release 05?");
    expect(older.at(-1)!.a).toBe("Release 06 came out on 18 September 2026.");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run -c worker/vitest.config.ts worker/tests/releases-lib.spec.ts`
Expected: FAIL — cannot resolve `../lib/releases`.

- [ ] **Step 3: Implement `worker/lib/releases.ts`**

```ts
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
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run -c worker/vitest.config.ts worker/tests/releases-lib.spec.ts`
Expected: PASS (all tests). Also `npx tsc --noEmit -p .` → no output.

- [ ] **Step 5: Commit**

```bash
git add worker/lib/releases.ts worker/tests/releases-lib.spec.ts
git commit -m "feat(releases): pure release series, next-release window and data-written FAQs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Data loader + `/api/releases`

**Files:**
- Create: `worker/routes/releases.ts`
- Modify: `worker/index.ts` (import + `on("GET", "/api/releases", releasesApi);` next to the hubs routes, line ~37)
- Test: `worker/tests/releases.spec.ts`

**Interfaces:**
- Consumes: Task 1 exports (including `TrackerData`, `ReleaseBlock`); `AGENCY_HUBS` from `worker/lib/hubs.ts`; `wargovReleases(env)` from `worker/lib/facets.ts` (returns `{ no, date, raw, count }[]`); `cachedJson(key, load, ttl?)` from `worker/lib/cache.ts`; `json(body, init?)` from `worker/lib/json.ts`.
- Produces:
  - `loadSeries(env: Env, origin: string): Promise<ReleaseInfo[]>`
  - `trackerData(env: Env, origin: string, today?: string): Promise<TrackerData>`
  - `releaseBlock(env: Env, origin: string, no: number, picks: { id: string; title: string }[], today?: string): Promise<ReleaseBlock | null>`
  - `releasesApi(req: Request, env: Env): Promise<Response>` — `GET /api/releases` → `TrackerData`, `cache-control: public, max-age=300`.

- [ ] **Step 1: Write the failing test**

Create `worker/tests/releases.spec.ts` (seed data: release 1 = 5/8/26 with 12 files — DoW 9, NASA 1, DoS 2; release 2 = 6/12/26 with 8 files — CIA 1, DoW 1, FBI 5, IC 1):

```ts
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../index";
import { seedTestDB } from "./helpers";
import { trackerData, releaseBlock } from "../routes/releases";

beforeAll(() => seedTestDB(env.DB));
const call = async (path: string) => {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request("https://x" + path), env as any, ctx);
  await waitOnExecutionContext(ctx);
  return res;
};

describe("release tracker data", () => {
  it("builds the series from the seeded war.gov releases", async () => {
    const d = await trackerData(env as any, "https://t1", "2026-07-01");
    expect(d.series.map((r) => [r.no, r.date, r.files, r.gap])).toEqual([
      [1, "2026-05-08", 12, null],
      [2, "2026-06-12", 8, 35],
    ]);
    expect(d.series[1].newAgencies).toEqual(["FBI", "CIA", "IC"]);
    expect(d.window).toMatchObject({ next: 3, earliest: "2026-07-17", latest: "2026-07-17", state: "ahead" });
    expect(d.status.headline).toBe("Release 03: no date announced. If the pattern holds: Fri 17 Jul 2026, most likely around Fri 17 Jul.");
    expect(d.faq[0].q).toBe("When is the next UFO file release?");
  });

  it("GET /api/releases serves the same shape, publicly cacheable", async () => {
    const res = await call("/api/releases");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=300");
    const d: any = await res.json();
    expect(d.series).toHaveLength(2);
    expect(d.window.next).toBe(3);
    expect(typeof d.status.headline).toBe("string");
    expect(d.faq.length).toBeGreaterThan(3);
  });

  it("release block: newest has the upcoming slot, older has next", async () => {
    const newest = (await releaseBlock(env as any, "https://t2", 2, [], "2026-07-01"))!;
    expect(newest.size).toBe("8 files, −4 on Release 01");
    expect(newest.prev).toEqual({ no: 1, date: "2026-05-08" });
    expect(newest.next).toBeNull();
    expect(newest.upcoming).toBe("Release 03: expected Fri 17 Jul");
    const first = (await releaseBlock(env as any, "https://t2", 1, [], "2026-07-01"))!;
    expect(first.size).toBe("12 files: the first release");
    expect(first.next).toEqual({ no: 2, date: "2026-06-12" });
    expect(first.upcoming).toBeNull();
    expect(await releaseBlock(env as any, "https://t2", 99, [])).toBeNull();
  });
});
```

Note: the expected `newAgencies` order follows `agencies` sort (count desc, then label): FBI 5, then CIA 1 and IC 1 alphabetically → `["FBI", "CIA", "IC"]`. Each test uses a distinct origin (`https://t1`, `https://t2`) so the Cache API memo from one test doesn't feed another.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run -c worker/vitest.config.ts worker/tests/releases.spec.ts`
Expected: FAIL — cannot resolve `../routes/releases`.

- [ ] **Step 3: Implement `worker/routes/releases.ts`**

```ts
// Release tracker data (spec 2026-10-03-realufo-release-tracker-design). One
// grouped query + wargovReleases(), memoized like the hub list.
import type { Env } from "../env";
import { json } from "../lib/json";
import { cachedJson } from "../lib/cache";
import { wargovReleases } from "../lib/facets";
import { AGENCY_HUBS } from "../lib/hubs";
import {
  kindsText, nextWindow, releaseFaq, releaseSeries, sizeLine, statusText, todayIso, trackerFaq, upcomingText,
  type CountRow, type ReleaseBlock, type ReleaseInfo, type TrackerData,
} from "../lib/releases";

// ponytail: 1h per colo like listHubsCached; a new drop shows up within the hour.
export const loadSeries = async (env: Env, origin: string): Promise<ReleaseInfo[]> =>
  (await cachedJson(`${origin}/__releases`, async () => {
    const [releases, rows] = await Promise.all([
      wargovReleases(env),
      env.DB.prepare(
        "SELECT doc_date, agency, kind, count(*) n FROM records WHERE archive='wargov' AND status='live' AND doc_date IS NOT NULL GROUP BY 1,2,3"
      ).all<CountRow>(),
    ]);
    return releaseSeries(releases, rows.results, AGENCY_HUBS);
  })) ?? [];

export async function trackerData(env: Env, origin: string, today = todayIso()): Promise<TrackerData> {
  const series = await loadSeries(env, origin);
  const window = nextWindow(series, today);
  return { series, window, status: statusText(window), faq: trackerFaq(series, window) };
}

export async function releaseBlock(
  env: Env, origin: string, no: number, picks: { id: string; title: string }[], today = todayIso()
): Promise<ReleaseBlock | null> {
  const series = await loadSeries(env, origin);
  const i = series.findIndex((r) => r.no === no);
  if (i < 0) return null;
  const info = series[i];
  const prev = series[i - 1] ?? null;
  const next = series[i + 1] ?? null;
  const window = nextWindow(series, today);
  return {
    info, size: sizeLine(info, prev), kinds: kindsText(info.kinds),
    prev: prev && { no: prev.no, date: prev.date }, next: next && { no: next.no, date: next.date },
    upcoming: !next && window ? upcomingText(window) : null,
    faq: releaseFaq(info, series, window, picks),
  };
}

export async function releasesApi(req: Request, env: Env) {
  return json(await trackerData(env, new URL(req.url).origin), { headers: { "cache-control": "public, max-age=300" } });
}
```

In `worker/index.ts` add next to `import { hubsIndex, getHub } from "./routes/hubs";`:

```ts
import { releasesApi } from "./routes/releases";
```

and after `on("GET", "/api/hubs/:kind/:slug", getHub);`:

```ts
on("GET", "/api/releases", releasesApi);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run -c worker/vitest.config.ts worker/tests/releases.spec.ts` → PASS. Then `npx tsc --noEmit -p .` → no output.

- [ ] **Step 5: Commit**

```bash
git add worker/routes/releases.ts worker/index.ts worker/tests/releases.spec.ts
git commit -m "feat(releases): cached tracker data, release blocks and GET /api/releases

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Release hubs carry the block + UFO title

**Files:**
- Modify: `worker/lib/hubs.ts` (`hubTitle`, release branch)
- Modify: `worker/routes/hubs.ts` (`Hub` interface, `loadHub`)
- Test: `worker/tests/hubs-lib.spec.ts:31`, `worker/tests/hubs.spec.ts:57-63`

**Interfaces:**
- Consumes: `releaseBlock(env, origin, no, picks)` from Task 2 and `ReleaseBlock` from Task 1; `docTitle(t, id, kind)` from `worker/lib/ssr.ts`.
- Produces: `Hub.release?: ReleaseBlock | null` — present (object) on release hubs, absent on other kinds. `hubTitle` for releases returns `Pentagon UFO Files Release 06 (18 Sep 2026): 74 Files`.

- [ ] **Step 1: Update the failing tests**

In `worker/tests/hubs-lib.spec.ts` replace line 31:

```ts
    expect(hubTitle({ kind: "release", slug: "6", label: "Release 06 · 18 Sep 2026", count: 74 })).toBe("Pentagon UFO Files Release 06 (18 Sep 2026): 74 Files");
```

In `worker/tests/hubs.spec.ts` replace the `"release hub: title, prev/next, its files"` test with:

```ts
  it("release hub: title, prev/next, its files, release block", async () => {
    const h: any = await (await call("/api/hubs/release/2")).json();
    expect(h.title).toBe("Pentagon UFO Files Release 02 (12 Jun 2026): 8 Files");
    expect(h.prev).toBe("1");
    expect(h.next).toBeNull();
    expect(h.records.length).toBe(8);
    expect(h.release.size).toBe("8 files, −4 on Release 01");
    expect(h.release.info.newAgencies).toEqual(["FBI", "CIA", "IC"]);
    expect(h.release.prev).toEqual({ no: 1, date: "2026-05-08" });
    expect(h.release.faq[0].q).toBe("When was Release 02 published?");
  });

  it("non-release hubs have no release block", async () => {
    const h: any = await (await call("/api/hubs/agency/fbi")).json();
    expect(h).not.toHaveProperty("release");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run -c worker/vitest.config.ts worker/tests/hubs-lib.spec.ts worker/tests/hubs.spec.ts`
Expected: FAIL on the title and `h.release` assertions.

- [ ] **Step 3: Implement**

`worker/lib/hubs.ts`, in `hubTitle` replace the release line:

```ts
  // "Release 06 · 18 Sep 2026" → "Pentagon UFO Files Release 06 (18 Sep 2026): 74 Files"
  // ("UFO" is what people search; the chip label stays short).
  if (h.kind === "release") return `Pentagon UFO Files ${h.label.replace(" · ", " (")}): ${h.count} Files`;
```

`worker/routes/hubs.ts`:

Add imports:

```ts
import { docTitle } from "../lib/ssr";
import { releaseBlock } from "./releases";
import type { ReleaseBlock } from "../lib/releases";
```

Extend the interface:

```ts
export interface Hub {
  kind: HubKind; slug: string; title: string; intro: string; stats: HubStats;
  records: CardRow[]; siblings: HubSummary[]; prev?: string | null; next?: string | null;
  highlights: Highlights | null;
  release?: ReleaseBlock | null;
}
```

In `loadHub`, replace the final `return { ... }` with:

```ts
  const same = hubs.filter((h) => h.kind === me.kind);
  const i = same.indexOf(me);
  const highlights = highlightsOf(hlRow, records);
  const release =
    me.kind === "release"
      ? await releaseBlock(env, origin, Number(me.slug), (highlights?.picks ?? []).map((p) => ({ id: p.id, title: docTitle(p.title, p.id, p.kind) })))
      : undefined;
  return {
    kind: me.kind, slug: me.slug, title: hubTitle(me), intro: hubIntro(me, sel.release, stats), stats, records, highlights,
    siblings: same.filter((h) => h !== me),
    ...(me.kind === "release" ? { prev: same[i - 1]?.slug ?? null, next: same[i + 1]?.slug ?? null, release } : {}),
  };
```

(Delete the old `const same`/`const i` lines above it so they aren't declared twice.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run -c worker/vitest.config.ts worker/tests/hubs-lib.spec.ts worker/tests/hubs.spec.ts` → PASS. Then the full worker suite `npx vitest run -c worker/vitest.config.ts` → all pass (fix any other test that asserted the old release title, e.g. grep `"Pentagon UAP Release"` in `worker/tests`).

- [ ] **Step 5: Commit**

```bash
git add worker/lib/hubs.ts worker/routes/hubs.ts worker/tests/hubs-lib.spec.ts worker/tests/hubs.spec.ts
git commit -m "feat(releases): release hubs carry what's-new/prev-next/FAQ block; UFO-style title

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Crawler HTML — `/releases`, release hub blocks, FAQ JSON-LD, sitemap, llms

**Files:**
- Modify: `worker/lib/shared.ts` (`RELEASES_TITLE`, `RELEASES_DESCRIPTION` — shared with the SPA)
- Modify: `worker/lib/meta.ts` (`MetaInput.faq`, FAQPage script in `injectMeta`)
- Modify: `worker/lib/ssr.ts` (`faqHtml`, `releaseBlockHtml`, `releasesBody`, `HubPageData.release`, `hubBody`, `browseBody`)
- Modify: `worker/lib/pages.ts` (`releasesPage` + route; `hubPage` passes `faq`, release description)
- Modify: `worker/routes/sitemap.ts:54`, `worker/routes/llms.ts` (Main pages list)
- Test: `worker/tests/meta.spec.ts`, `worker/tests/sitemap.spec.ts`

**Interfaces:**
- Consumes: `trackerData` (Task 2); `TrackerData`, `ReleaseBlock`, `FaqItem`, `agencyList`, `longDate`, `pad2`, `shortDate` (Task 1).
- Produces: `MetaInput.faq?: { q: string; a: string }[]`; `releasesBody(d: TrackerData): string`; `faqHtml(items: FaqItem[]): string`; `releaseBlockHtml(b: ReleaseBlock): string`.

- [ ] **Step 1: Write the failing tests**

Append to `worker/tests/meta.spec.ts` (it already defines `fakeAssets`, `worker`, `env`, `createExecutionContext`, `waitOnExecutionContext`, and seeds the DB in a `beforeAll`; reuse them):

```ts
describe("release tracker pages (crawler HTML)", () => {
  const get = async (path: string, over: Record<string, unknown> = {}) => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("https://x" + path, { headers: { accept: "text/html" } }), { ...env, ASSETS: fakeAssets, ...over } as any, ctx);
    await waitOnExecutionContext(ctx);
    return res.text();
  };

  it("/releases has the status, table, FAQ and FAQPage JSON-LD", async () => {
    const html = await get("/releases");
    expect(html).toContain("<title>Pentagon UFO File Releases: Dates, Schedule &amp; Next Release · RealUFO</title>");
    expect(html).toContain("<h1>Pentagon UFO File Releases: Dates, Schedule &amp; Next Release</h1>");
    expect(html).toMatch(/Release 03/);
    expect(html).toContain('<a href="/release/2">Release 02</a>');
    expect(html).toContain("<h2>FAQ</h2>");
    expect(html).toContain('"@type":"FAQPage"');
    expect(html).toContain('"@type":"CollectionPage"');
  });

  it("/releases falls back to the plain title when D1 fails", async () => {
    // Own origin: the page memo and the series memo are keyed by origin, so a
    // cached result from the test above can't mask the failure.
    const broken = { prepare: () => { throw new Error("D1 down"); } };
    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request("https://broken.test/releases", { headers: { accept: "text/html" } }),
      { ...env, ASSETS: fakeAssets, DB: broken } as any, ctx
    );
    await waitOnExecutionContext(ctx);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain("<h1>Pentagon UFO File Releases: Dates, Schedule &amp; Next Release</h1>");
    expect(html).not.toContain("FAQPage");
  });

  it("/release/2 has what's new, dated prev link, tracker link and FAQ", async () => {
    const html = await get("/release/2");
    expect(html).toContain("<h1>Pentagon UFO Files Release 02 (12 Jun 2026): 8 Files</h1>");
    expect(html).toContain("<h2>What's new in Release 02</h2>");
    expect(html).toContain("8 files, −4 on Release 01");
    expect(html).toContain("First release with files from FBI, CIA and IC");
    expect(html).toContain('<a href="/release/1">← Release 01 (8 May)</a>');
    expect(html).toContain('<a href="/releases">');
    expect(html).toContain('"@type":"FAQPage"');
  });

  it("agency hubs get no FAQ JSON-LD", async () => {
    const html = await get("/agency/fbi");
    expect(html).not.toContain('"@type":"FAQPage"');
    expect(html).not.toContain("What's new in");
  });
});
```

`fakeAssets` is the module-level fake ASSETS binding already used throughout `meta.spec.ts`. If `serveWithMeta` itself touches `env.DB` for every page and the broken binding makes the request 500 before the loader runs, give the broken stub a `prepare` that throws only for the release query (`prepare: (sql: string) => { if (sql.includes("archive='wargov'")) throw new Error("D1 down"); return env.DB.prepare(sql); }`).

In `worker/tests/sitemap.spec.ts`, inside the existing main test, add:

```ts
    expect(xml).toContain("<loc>https://realufo.org/releases</loc>");
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run -c worker/vitest.config.ts worker/tests/meta.spec.ts worker/tests/sitemap.spec.ts`
Expected: FAIL (no `/releases` route, no FAQ, no sitemap entry).

- [ ] **Step 3: Implement**

`worker/lib/meta.ts` — add to `MetaInput` (after `breadcrumbs`):

```ts
  // Emitted as a FAQPage (data-written Q&A only).
  faq?: { q: string; a: string }[];
```

and in `injectMeta`'s `tags` array, after the breadcrumbs entry:

```ts
    m.faq?.length &&
      ldScript({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: m.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
      }),
```

`worker/lib/shared.ts` — append:

```ts
export const RELEASES_TITLE = "Pentagon UFO File Releases: Dates, Schedule & Next Release";
export const RELEASES_DESCRIPTION =
  "Every Pentagon UFO file release so far: dates, file counts, gaps between drops and when the next release is likely.";
```

`worker/lib/ssr.ts` — add imports at the top (with the other imports; `caseStoryUrl` is already imported from `./shared`, extend that line):

```ts
import { caseStoryUrl, RELEASES_TITLE } from "./shared";
import { agencyList, longDate, pad2, shortDate, type FaqItem, type ReleaseBlock, type TrackerData } from "./releases";
```

Extend `HubPageData`:

```ts
export type HubPageData = {
  kind: string; title: string; intro: string; records: RecordLink[]; siblings: HubLinkData[];
  prev?: string | null; next?: string | null;
  highlights?: { lede: string; picks: { id: string; why: string; title: string; kind?: string }[] } | null;
  release?: ReleaseBlock | null;
};
```

Add these helpers (after `highlightsHtml`):

```ts
export const faqHtml = (items: FaqItem[]) =>
  items.length
    ? `<section><h2>FAQ</h2>${items
        .map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}${f.link ? ` ${a(f.link)}` : ""}</p>`)
        .join("")}</section>`
    : "";

const releaseNav = (b: ReleaseBlock) =>
  [
    b.prev && a({ href: hubHref("release", String(b.prev.no)), text: `← Release ${pad2(b.prev.no)} (${shortDate(b.prev.date).slice(4)})` }),
    b.next && a({ href: hubHref("release", String(b.next.no)), text: `Release ${pad2(b.next.no)} (${shortDate(b.next.date).slice(4)}) →` }),
    b.upcoming && a({ href: "/releases", text: `${b.upcoming} →` }),
  ].filter(Boolean);

export const releaseBlockHtml = (b: ReleaseBlock) => {
  const items = [
    esc(b.size),
    b.info.agencies
      .map((g) => (g.slug ? a({ href: hubHref("agency", g.slug), text: `${g.label} ${g.count}` }) : esc(`${g.label} ${g.count}`)))
      .join(" · "),
    esc(b.kinds),
    b.info.newAgencies.length ? esc(`First release with files from ${listAnd(b.info.newAgencies)}`) : "",
  ].filter(Boolean);
  return `<section><h2>What's new in Release ${pad2(b.info.no)}</h2><ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul></section>`;
};

const listAnd = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

export function releasesBody(d: TrackerData): string {
  const total = d.series.reduce((n, r) => n + r.files, 0);
  const rows = [...d.series]
    .reverse()
    .map((r) => `<tr><td>${a({ href: hubHref("release", String(r.no)), text: `Release ${pad2(r.no)}` })}</td><td>${esc(`${r.weekday}, ${longDate(r.date)}`)}</td><td>${r.files}</td><td>${r.gap ?? "—"}</td><td>${esc(agencyList(r, 3))}</td></tr>`)
    .join("");
  const facts = [
    `${d.series.length} releases, ${total} files`,
    d.window && `Median gap: ${d.window.medianGap} days`,
    d.window?.sameWeekday && `Every release so far landed on a ${d.window.sameWeekday}`,
  ].filter(Boolean) as string[];
  return [
    `<h1>${esc(RELEASES_TITLE)}</h1>`,
    `<p><strong>${esc(d.status.headline)}</strong></p>`,
    d.status.basis ? `<p>${esc(d.status.basis)}</p>` : "",
    `<ul>${facts.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>`,
    `<table><thead><tr><th>Release</th><th>Date</th><th>Files</th><th>Gap (days)</th><th>Agencies</th></tr></thead><tbody>${rows}</tbody></table>`,
    faqHtml(d.faq),
  ].join("");
}
```

Update `hubBody` to render the block (keep the old nav for hubs without a block):

```ts
export function hubBody(h: HubPageData): string {
  const nav = h.release
    ? releaseNav(h.release)
    : [
        h.prev && a({ href: hubHref("release", h.prev), text: `← Release ${h.prev.padStart(2, "0")}` }),
        h.next && a({ href: hubHref("release", h.next), text: `Release ${h.next.padStart(2, "0")} →` }),
      ].filter(Boolean);
  return [
    `<p>${a({ href: "/browse", text: "Browse" })} › ${esc(KIND_HEADING[h.kind] ?? "")}</p>`,
    `<h1>${esc(h.title)}</h1>`,
    paras(h.intro),
    h.release ? releaseBlockHtml(h.release) : "",
    highlightsHtml(h.highlights),
    nav.length ? `<p>${nav.join(" · ")}</p>` : "",
    h.release ? `<p>${a({ href: "/releases", text: "All releases & next-release estimate" })}</p>` : "",
    section(`Files (${h.records.length})`, docLinks(h.records)),
    h.release ? faqHtml(h.release.faq) : "",
    section(`More ${(KIND_HEADING[h.kind] ?? "hubs").toLowerCase()}`, hubLinks(h.siblings)),
  ].join("");
}
```

Update `browseBody` to link the tracker:

```ts
export const browseBody = (hubs: HubLinkData[]) =>
  tabBody(
    "Browse the archive",
    "Every declassified UAP file, grouped by release, agency, location and decade.",
    `<p>${a({ href: "/releases", text: "Release tracker: dates, schedule and next release" })}</p>`,
    ...["release", "agency", "location", "decade"].map((k) => section(KIND_HEADING[k], hubLinks(hubs.filter((h) => h.kind === k))))
  );
```

(`a` is declared with `const` further down `ssr.ts`; the helpers above are only called at request time, after module init, so the order is fine — same as existing `hubBody`.)

`worker/lib/pages.ts`:

Add `releasesBody` to the `./ssr` import list. Extend the existing `import { MAP_INTRO } from "./shared";` line and add imports:

```ts
import { MAP_INTRO, RELEASES_DESCRIPTION, RELEASES_TITLE } from "./shared";
import { trackerData } from "../routes/releases";
import { agencyList, longDate } from "./releases";
```

Add the loader (next to `browsePage`):

```ts
const releasesPage: Loader = async (env, _g, url) => {
  const meta = { title: RELEASES_TITLE, description: RELEASES_DESCRIPTION, type: "website" as const };
  let d;
  try {
    d = await trackerData(env, url.origin);
  } catch (e) {
    console.error("release tracker failed", e);
    return { meta, body: tabBody(RELEASES_TITLE, RELEASES_DESCRIPTION) };
  }
  const last = d.series[d.series.length - 1];
  return {
    meta: {
      ...meta,
      description: last
        ? `${d.series.length} Pentagon UFO file releases so far (${d.series.reduce((n, r) => n + r.files, 0)} files), the latest on ${last.weekday} ${longDate(last.date)}. ${d.status.headline}`
        : RELEASES_DESCRIPTION,
      jsonLd: {
        "@type": "CollectionPage",
        name: RELEASES_TITLE,
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: d.series.length,
          itemListElement: d.series.map((r, i) => ({
            "@type": "ListItem", position: i + 1, url: `${url.origin}${hubHref("release", String(r.no))}`, name: `Release ${String(r.no).padStart(2, "0")}`,
          })),
        },
      },
      faq: d.faq,
      breadcrumbs: [
        { name: "Home", href: "/" },
        { name: "Browse", href: "/browse" },
        { name: "Release tracker", href: "/releases" },
      ],
    },
    body: releasesBody(d),
  };
};
```

Register it in `ROUTES` after `/browse`:

```ts
  { pattern: new URLPattern({ pathname: "/releases" }), load: releasesPage },
```

In `hubPage`, inside `meta`, change `description: h.intro,` to:

```ts
        description: h.release ? `${h.intro} Agencies: ${agencyList(h.release.info, 3)}.` : h.intro,
```

and add after `breadcrumbs: [...]`:

```ts
        faq: h.release?.faq,
```

`worker/routes/sitemap.ts:54` — add `"/releases"` to the static list:

```ts
    ...["/", "/archive", "/boards", "/cases", "/map", "/browse", "/releases", "/privacy", "/terms"].map((p) => loc(p)),
```

`worker/routes/llms.ts` — in "Main pages", after the Browse line:

```ts
    link("Release tracker", "/releases", "every Pentagon UFO file release, the gaps between them and the next-release estimate"),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run -c worker/vitest.config.ts` → all pass. `npx tsc --noEmit -p .` → no output.

- [ ] **Step 5: Commit**

```bash
git add worker/lib/shared.ts worker/lib/meta.ts worker/lib/ssr.ts worker/lib/pages.ts worker/routes/sitemap.ts worker/routes/llms.ts worker/tests/meta.spec.ts worker/tests/sitemap.spec.ts
git commit -m "feat(releases): /releases tracker and release-hub blocks in crawler HTML, FAQPage JSON-LD, sitemap + llms

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: SPA — tracker screen, release blocks on Hub, links

**Files:**
- Modify: `web/src/api/types.ts` (Hub.release; re-export tracker types)
- Modify: `web/src/api/queries.ts` (`qk.releases`, `useReleases`)
- Create: `web/src/components/Faq.tsx`
- Create: `web/src/screens/Releases.tsx`
- Modify: `web/src/router.tsx` (`/releases` route)
- Modify: `web/src/screens/Hub.tsx` (release blocks)
- Modify: `web/src/screens/Browse.tsx`, `web/src/components/SiteFooter.tsx` (links)
- Test: create `web/src/tests/releases.test.tsx`; modify `web/src/tests/hub.test.tsx`

**Interfaces:**
- Consumes: `GET /api/releases` → `TrackerData`; `Hub.release` → `ReleaseBlock` (Task 2/3). Types are imported type-only from `../../../worker/lib/releases` (import-free on purpose); `RELEASES_TITLE` from `../../../worker/lib/shared` (web already imports worker modules, e.g. `worker/lib/profiles`). Never import `worker/routes/*` or `worker/lib/ssr.ts` into the SPA: they pull Worker-only types into the web type-check and bundle.
- Produces: `useReleases(): UseQueryResult<TrackerData>`; `<Faq items={FaqItem[]} />`; default export `Releases` screen.

- [ ] **Step 1: Write the failing tests**

Create `web/src/tests/releases.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Releases from "../screens/Releases";

const useReleasesMock = vi.fn();
vi.mock("../api/queries", () => ({ useReleases: () => useReleasesMock() }));

const data = {
  series: [
    { no: 1, date: "2026-05-08", weekday: "Friday", files: 169, gap: null, agencies: [{ label: "Department of War", slug: "department-of-war", count: 160 }], kinds: { pdf: 100, video: 69, image: 0 }, newAgencies: [] },
    { no: 2, date: "2026-05-22", weekday: "Friday", files: 56, gap: 14, agencies: [{ label: "CIA", slug: "cia", count: 56 }], kinds: { pdf: 56, video: 0, image: 0 }, newAgencies: ["CIA"] },
  ],
  window: { next: 3, earliest: "2026-06-05", likely: "2026-06-05", latest: "2026-06-05", state: "ahead", daysSince: 3, shortestGap: 14, longestGap: 14, medianGap: 14, sameWeekday: "Friday" },
  status: { headline: "Release 03: no date announced. If the pattern holds: Fri 5 Jun 2026, most likely around Fri 5 Jun.", basis: "Based on the gaps between past releases: 14 days. Every release so far landed on a Friday." },
  faq: [{ q: "Where do the UFO files come from?", a: "The U.S. Department of War publishes them at war.gov/UFO.", link: { href: "https://www.war.gov/UFO/", text: "war.gov/UFO" } }],
};

describe("Releases screen", () => {
  beforeEach(() => useReleasesMock.mockReturnValue({ data, isLoading: false }));

  it("shows the status, table (newest first) and FAQ", () => {
    render(<MemoryRouter><Releases /></MemoryRouter>);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Pentagon UFO File Releases: Dates, Schedule & Next Release");
    expect(screen.getByText(data.status.headline)).toBeInTheDocument();
    expect(screen.getByText(data.status.basis)).toBeInTheDocument();
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows[0].textContent).toContain("Release 02");
    expect(screen.getByRole("link", { name: "Release 01" }).getAttribute("href")).toBe("/release/1");
    expect(screen.getByText("Where do the UFO files come from?")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "war.gov/UFO" }).getAttribute("href")).toBe("https://www.war.gov/UFO/");
  });

  it("loading state", () => {
    useReleasesMock.mockReturnValue({ data: undefined, isLoading: true });
    render(<MemoryRouter><Releases /></MemoryRouter>);
    expect(screen.getByText(/loading signal/i)).toBeInTheDocument();
  });
});
```

In `web/src/tests/hub.test.tsx`, add a release fixture and test (after the existing `hubs` constant; reuse `useHubMock` and `renderAt`):

```tsx
const release6: HubData = {
  kind: "release", slug: "6", title: "Pentagon UFO Files Release 06 (18 Sep 2026): 74 Files",
  intro: "74 declassified UAP files the Department of War published on 18 September 2026 (Release 06): 4 PDFs, 70 videos.",
  stats: { files: 74, pdf: 4, video: 70, image: 0, from: "1950", to: "2025" },
  records: [], siblings: [], prev: "5", next: null, highlights: null,
  release: {
    info: { no: 6, date: "2026-09-18", weekday: "Friday", files: 74, gap: 42,
      agencies: [{ label: "Department of War", slug: "department-of-war", count: 70 }, { label: "Local law enforcement", slug: "local-law-enforcement", count: 4 }],
      kinds: { pdf: 4, video: 70, image: 0 }, newAgencies: ["Local law enforcement"] },
    size: "74 files, +33 on Release 05", kinds: "70 videos, 4 PDFs",
    prev: { no: 5, date: "2026-08-07" }, next: null, upcoming: "Release 07: due any day",
    faq: [{ q: "When was Release 06 published?", a: "On Friday, 18 September 2026." }],
  },
};

describe("release hub blocks", () => {
  it("renders what's new, dated nav, tracker link and FAQ", () => {
    useHubMock.mockReturnValue({ data: release6, isLoading: false });
    renderAt("/release/6");
    expect(screen.getByRole("heading", { name: "WHAT'S NEW IN RELEASE 06" })).toBeInTheDocument();
    expect(screen.getByText("74 files, +33 on Release 05")).toBeInTheDocument();
    expect(screen.getByText("First release with files from Local law enforcement")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Department of War 70" }).getAttribute("href")).toBe("/agency/department-of-war");
    expect(screen.getByRole("link", { name: "← RELEASE 05 (7 Aug)" }).getAttribute("href")).toBe("/release/5");
    expect(screen.getByRole("link", { name: "Release 07: due any day →" }).getAttribute("href")).toBe("/releases");
    expect(screen.getByText("When was Release 06 published?")).toBeInTheDocument();
  });

  it("agency hubs render no release blocks", () => {
    useHubMock.mockReturnValue({ data: fbi, isLoading: false });
    renderAt("/agency/fbi");
    expect(screen.queryByText(/WHAT'S NEW/)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "FAQ" })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npx vitest run src/tests/releases.test.tsx src/tests/hub.test.tsx`
Expected: FAIL — `../screens/Releases` missing; release blocks absent.

- [ ] **Step 3: Implement**

`web/src/api/types.ts` — add near the `Hub` interface:

```ts
export type { FaqItem, NextWindow, ReleaseBlock, ReleaseInfo, TrackerData } from "../../../worker/lib/releases";
```

and add to `interface Hub` (after `highlights`):

```ts
  /** Releases only: what's new, dated prev/next, FAQ (worker/routes/releases.ts). */
  release?: import("../../../worker/lib/releases").ReleaseBlock | null;
```

`web/src/api/queries.ts` — in `qk` add `releases: ["releases"] as const,`; import `TrackerData` in the existing `import type { ... } from "./types"` list; add after `useHub`:

```ts
export function useReleases() {
  return useQuery({ queryKey: qk.releases, queryFn: () => api.get<TrackerData>("/api/releases") });
}
```

Create `web/src/components/Faq.tsx`:

```tsx
// Data-written FAQ (worker/lib/releases.ts); same items the Worker emits as FAQPage JSON-LD.
import { Link } from "react-router-dom";
import type { FaqItem } from "../api/types";

export function Faq({ items }: { items: FaqItem[] }) {
  if (!items.length) return null;
  return (
    <section aria-labelledby="faq" className="mb-6">
      <h2 id="faq" className="mb-3 font-mono text-[11px] font-semibold tracking-[.5px] text-ink">FAQ</h2>
      <dl className="flex flex-col gap-3">
        {items.map((f) => (
          <div key={f.q}>
            <dt className="text-[13.5px] font-semibold text-ink">{f.q}</dt>
            <dd className="text-[13.5px] leading-[1.6] text-dim">
              {f.a}{" "}
              {f.link &&
                (f.link.href.startsWith("/") ? (
                  <Link to={f.link.href} className="text-signal hover:underline">{f.link.text}</Link>
                ) : (
                  <a href={f.link.href} target="_blank" rel="noopener" className="text-signal hover:underline">{f.link.text}</a>
                ))}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
```

Create `web/src/screens/Releases.tsx`:

```tsx
// /releases — the war.gov release series and a labelled next-release window
// (spec 2026-10-03-realufo-release-tracker-design). The Worker pre-renders the
// same data for crawlers (worker/lib/ssr.ts releasesBody).
import { Link } from "react-router-dom";
import { useReleases } from "../api/queries";
import { useSetPageTitle } from "../lib/pageTitle";
import { Faq } from "../components/Faq";
import { RELEASES_TITLE } from "../../../worker/lib/shared";

const pad2 = (n: number) => String(n).padStart(2, "0");

export default function Releases() {
  const { data, isLoading } = useReleases();
  useSetPageTitle("RELEASES", "", RELEASES_TITLE);
  if (isLoading || !data) {
    return <div data-screen="releases" className="font-mono text-[11px] text-faint">◉ loading signal…</div>;
  }
  const total = data.series.reduce((n, r) => n + r.files, 0);
  return (
    <div data-screen="releases" style={{ animation: "fadeup .3s ease both" }}>
      <h1 className="mb-3 text-[19px] font-bold leading-[1.3] text-ink">{RELEASES_TITLE}</h1>
      <div className="mb-4 rounded-xl border border-signal p-3">
        <p className="text-[14.5px] font-semibold leading-[1.55] text-ink">{data.status.headline}</p>
        {data.status.basis && <p className="mt-1 text-[12.5px] leading-[1.5] text-dim">{data.status.basis}</p>}
      </div>
      <div className="mb-4 font-mono text-[10.5px] text-faint">
        {data.series.length} RELEASES · {total} FILES{data.window ? ` · MEDIAN GAP ${data.window.medianGap} DAYS` : ""}
      </div>
      <div className="mb-6 overflow-x-auto">
        <table className="w-full border-collapse text-left text-[12.5px]">
          <thead>
            <tr className="font-mono text-[10px] text-faint">
              <th className="py-1 pr-3">RELEASE</th><th className="py-1 pr-3">DATE</th><th className="py-1 pr-3">FILES</th><th className="py-1 pr-3">GAP</th><th className="py-1">AGENCIES</th>
            </tr>
          </thead>
          <tbody>
            {[...data.series].reverse().map((r) => (
              <tr key={r.no} className="border-t border-line">
                <td className="py-1.5 pr-3"><Link to={`/release/${r.no}`} className="text-signal hover:underline">Release {pad2(r.no)}</Link></td>
                <td className="py-1.5 pr-3 text-dim">{r.weekday.slice(0, 3)} {r.date}</td>
                <td className="py-1.5 pr-3 text-ink">{r.files}</td>
                <td className="py-1.5 pr-3 text-dim">{r.gap ?? "—"}</td>
                <td className="py-1.5 text-dim">{r.agencies.slice(0, 3).map((a) => a.label).join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Faq items={data.faq} />
    </div>
  );
}
```

`web/src/router.tsx` — add after the `/browse` route:

```tsx
          { path: "/releases", lazy: screen(() => import("./screens/Releases")) },
```

`web/src/screens/Hub.tsx` — add imports:

```tsx
import type { ReleaseBlock } from "../api/types";
import { Faq } from "../components/Faq";
```

Replace the prev/next block:

```tsx
      {data.release ? (
        <ReleaseNav b={data.release} />
      ) : (
        (data.prev || data.next) && (
          <div className="mb-4 flex justify-between font-mono text-xs text-ink">
            {data.prev ? <Link to={`/release/${data.prev}`}>← RELEASE {data.prev.padStart(2, "0")}</Link> : <span />}
            {data.next ? <Link to={`/release/${data.next}`}>RELEASE {data.next.padStart(2, "0")} →</Link> : <span />}
          </div>
        )
      )}
```

Insert `{data.release && <WhatsNew b={data.release} />}` right after the intro `<p>` (before Highlights), and `{data.release && <Faq items={data.release.faq} />}` right after the records grid `</div>` (before "MORE …"). Add these components at the bottom of the file:

```tsx
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayMon = (iso: string) => `${Number(iso.slice(8, 10))} ${MON[Number(iso.slice(5, 7)) - 1]}`;
const pad2 = (n: number) => String(n).padStart(2, "0");

function WhatsNew({ b }: { b: ReleaseBlock }) {
  const fresh = b.info.newAgencies;
  return (
    <section aria-labelledby="hub-new" className="mb-5 rounded-xl border border-line p-3">
      <h2 id="hub-new" className="mb-2 font-mono text-[11px] font-semibold tracking-[.5px] text-ink">
        WHAT'S NEW IN RELEASE {pad2(b.info.no)}
      </h2>
      <ul className="flex flex-col gap-1 text-[13.5px] leading-[1.55] text-dim">
        <li>{b.size}</li>
        <li className="flex flex-wrap gap-x-2">
          {b.info.agencies.map((g) =>
            g.slug ? (
              <Link key={g.label} to={`/agency/${g.slug}`} className="text-signal hover:underline">{g.label} {g.count}</Link>
            ) : (
              <span key={g.label}>{g.label} {g.count}</span>
            )
          )}
        </li>
        <li>{b.kinds}</li>
        {fresh.length > 0 && <li>First release with files from {fresh.length < 2 ? fresh[0] : `${fresh.slice(0, -1).join(", ")} and ${fresh[fresh.length - 1]}`}</li>}
      </ul>
    </section>
  );
}

function ReleaseNav({ b }: { b: ReleaseBlock }) {
  return (
    <div className="mb-4 flex flex-wrap justify-between gap-2 font-mono text-xs text-ink">
      {b.prev ? <Link to={`/release/${b.prev.no}`}>← RELEASE {pad2(b.prev.no)} ({dayMon(b.prev.date)})</Link> : <span />}
      <Link to="/releases" className="text-faint hover:text-signal">ALL RELEASES</Link>
      {b.next ? (
        <Link to={`/release/${b.next.no}`}>RELEASE {pad2(b.next.no)} ({dayMon(b.next.date)}) →</Link>
      ) : b.upcoming ? (
        <Link to="/releases" className="text-signal">{b.upcoming} →</Link>
      ) : (
        <span />
      )}
    </div>
  );
}
```

`web/src/screens/Browse.tsx` — right after the `<h1>`:

```tsx
      <Link to="/releases" className="mb-4 inline-block font-mono text-[11px] text-signal hover:underline">
        Release tracker: dates, schedule and next release →
      </Link>
```

`web/src/components/SiteFooter.tsx` — in the "Explore" column, after the `browse` item:

```tsx
          <li key="releases"><Link className={linkCls} to="/releases">Release tracker</Link></li>,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && npx tsc --noEmit -p tsconfig.app.json && npx vitest run src/tests/releases.test.tsx src/tests/hub.test.tsx` → PASS. Then the full web suite `npx vitest run` → only the 19 baseline failures.

- [ ] **Step 5: Commit**

```bash
git add web/src/api/types.ts web/src/api/queries.ts web/src/components/Faq.tsx web/src/screens/Releases.tsx web/src/router.tsx web/src/screens/Hub.tsx web/src/screens/Browse.tsx web/src/components/SiteFooter.tsx web/src/tests/releases.test.tsx web/src/tests/hub.test.tsx
git commit -m "feat(releases): SPA tracker screen, release-hub what's new / nav / FAQ, footer + browse links

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Verify locally, deploy, IndexNow

**Files:** none (operational).

- [ ] **Step 1: Local check** — `preview_start` `worker-dev` (port 8787) after `cd web && npx vite build`; then:

```bash
curl -s http://localhost:8787/releases | grep -oE '<h1>[^<]*|<strong>[^<]*|FAQPage' | head
curl -s http://localhost:8787/release/6 | grep -oE "<h1>[^<]*|What's new in Release 06|First release with files from[^<]*|/releases" | head
```

Expected: tracker h1, a status headline containing "Release 07", `FAQPage`; release 6 h1 "Pentagon UFO Files Release 06 (18 Sep 2026): 74 Files", the what's-new heading and the `/releases` link. (Local page memo lives in `.wrangler/state/v3/cache`; if a page shows old content, it was requested before — use a path not requested yet or wait an hour.) Open `http://localhost:5173/releases` and `/release/6` in the browser pane and screenshot both.

- [ ] **Step 2: Deploy from a clean worktree of HEAD** (other sessions share the checkout):

```bash
npx wrangler d1 migrations list realufo-db --remote | tail -1   # expect "No migrations to apply"
export PATH="/Users/laichan/.nvm/versions/node/v22.22.0/bin:$PATH"
D=<scratchpad>/deploy-releases; git worktree add --detach $D HEAD && cd $D
pnpm install --frozen-lockfile --prefer-offline && (cd web && pnpm install --frozen-lockfile --prefer-offline)
pnpm run deploy          # NOT `pnpm deploy`
```

Expected: `Current Version ID: …`.

- [ ] **Step 3: Verify live, push, clean up**

```bash
curl -s https://realufo.org/releases | grep -c FAQPage          # 1
curl -s https://realufo.org/sitemap.xml | grep -c '/releases<'   # 1
git push origin HEAD:build/app-foundation
git worktree remove --force $D
```

(`/release/N` pages may serve the 1 h page memo; check one that wasn't requested recently, or recheck after an hour.)

- [ ] **Step 4: IndexNow**

```bash
python3 crawler/indexnow.py https://realufo.org/releases https://realufo.org/release/1 https://realufo.org/release/2 https://realufo.org/release/3 https://realufo.org/release/4 https://realufo.org/release/5 https://realufo.org/release/6 https://realufo.org/browse
```

Expected: `200 submitted 8 urls`.

- [ ] **Step 5: Record** — append a line to the project memory (`realufo-project-state.md`) with the live version id and commit, and note that the Spec 9 guess-the-date poll is the pending follow-up.
