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
