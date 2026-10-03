import { describe, it, expect } from "vitest";
import { CASE_SLUGS, citeParts, citedSources, storyProblems, storyWords, type CaseStory } from "../lib/caseStories";
import { CASE_STORY_TEXT } from "../lib/caseStoryText";

const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");
const ok: CaseStory = {
  title: "Socorro 1964: Test",
  sections: [{ heading: "H", paras: [`${words(650)} [1] and [2].`], quote: { text: "Q", who: "Zamora", src: 1 } }],
  timeline: [{ date: "1964-04-24", event: "Landing report", src: 2 }],
  sources: [{ id: "DOW-UAP-D001", page: 3, note: "n1" }, { url: "https://release.realufo.org/nara/socorro.html", note: "n2" }],
  updated: "2026-10-03",
};

describe("citeParts", () => {
  it("splits valid [n] markers and leaves other brackets as text", () => {
    expect(citeParts("A [1] b [2][3] c [sic] d [9] e [redacted].", 3)).toEqual([
      "A ", { n: 1 }, " b ", { n: 2 }, { n: 3 }, " c [sic] d [9] e [redacted].",
    ]);
    expect(citeParts("no cites", 2)).toEqual(["no cites"]);
  });
});

describe("story validation", () => {
  it("a valid story has no problems", () => {
    expect(storyProblems("socorro", ok)).toEqual([]);
    expect([...citedSources(ok)].sort()).toEqual([1, 2]);
    expect(storyWords(ok)).toBeGreaterThan(600);
  });
  it("flags bad markers, uncited sources, bad source shape, length, date, slug", () => {
    const bad: CaseStory = {
      ...ok,
      sections: [{ heading: "H", paras: ["short [1] [4]"] }],
      timeline: [],
      sources: [{ id: "A", note: "x" }, { id: "B", url: "https://x", note: "y" }, { note: "z" }],
      updated: "Oct 2026",
    };
    const p = storyProblems("not-a-case", bad).join(" | ");
    expect(p).toMatch(/not a batch case slug/);
    expect(p).toMatch(/\[4\] has no source/);
    expect(p).toMatch(/source 2 is never cited/);
    expect(p).toMatch(/source 2 needs exactly one of id\/url/);
    expect(p).toMatch(/source 3 needs exactly one of id\/url/);
    expect(p).toMatch(/words/);
    expect(p).toMatch(/updated/);
  });
  it("CASE_SLUGS is the batch", () => {
    expect(CASE_SLUGS).toEqual(["roswell", "kaikoura", "jal-1628", "tehran", "socorro", "travis-walton", "shag-harbour", "ohare-2006", "stephenville", "trans-en-provence", "manises", "falcon-lake"]);
  });
});

describe("CASE_STORY_TEXT", () => {
  it("every story is valid", () => {
    expect(Object.keys(CASE_STORY_TEXT).length).toBeGreaterThan(0);
    for (const [slug, s] of Object.entries(CASE_STORY_TEXT)) expect(storyProblems(slug, s), slug).toEqual([]);
  });
});
