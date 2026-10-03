import { describe, it, expect } from "vitest";
import { TOPIC_RULES, firstSentence, topicWhere, validTopic } from "../lib/topics";
import { TOPIC_TEXT } from "../lib/topicText";

describe("topicWhere", () => {
  it("ORs title, summary and agency matches with bound values", () => {
    expect(topicWhere({ title: ["DIRD", "AAWSAP"], summary: ["AAWSAP"], agencies: ["Local Law Enforcement"] })).toEqual({
      sql: "(r.title LIKE ? OR r.title LIKE ? OR r.summary LIKE ? OR r.agency IN (SELECT value FROM json_each(?)))",
      binds: ["%DIRD%", "%AAWSAP%", "%AAWSAP%", '["Local Law Enforcement"]'],
    });
  });
  it("ANDs notTitle exclusions (NULL titles count as not matching)", () => {
    expect(topicWhere({ title: ["Flying Disc"], notTitle: ["62-HQ-83894"] })).toEqual({
      sql: "(r.title LIKE ?) AND coalesce(r.title,'') NOT LIKE ?",
      binds: ["%Flying Disc%", "%62-HQ-83894%"],
    });
  });
  it("an empty rule matches nothing", () => {
    expect(topicWhere({})).toEqual({ sql: "0", binds: [] });
  });
});

describe("TOPIC_RULES", () => {
  it("has the 10 approved topics, unique slugs, all valid", () => {
    expect(TOPIC_RULES.map((t) => t.slug)).toEqual([
      "aawsap", "mission-reports", "flying-discs", "apollo-nasa", "fbi-62-hq-83894",
      "project-blue-book", "police", "nuclear-sites", "aaro-case-resolutions", "congress",
    ]);
    expect(TOPIC_RULES.every(validTopic)).toBe(true);
  });
  it("every LIKE pattern fits D1's 50-byte limit (%word%)", () => {
    for (const t of TOPIC_RULES)
      for (const w of [...(t.rule.title ?? []), ...(t.rule.summary ?? []), ...(t.rule.notTitle ?? [])])
        expect(new TextEncoder().encode(`%${w}%`).length, `${t.slug}: ${w}`).toBeLessThanOrEqual(50);
  });
  it("validTopic rejects an entry with no positive rule and no includes", () => {
    expect(validTopic({ slug: "x", label: "X", title: "X", rule: { notTitle: ["a"] } })).toBe(false);
    expect(validTopic({ slug: "x", label: "X", title: "X", rule: {}, include: ["A-1"] })).toBe(true);
  });
  it("audit adjustments are in the registry", () => {
    const by = Object.fromEntries(TOPIC_RULES.map((t) => [t.slug, t]));
    expect(by["flying-discs"].rule.notTitle).toEqual(["62-HQ-83894"]);
    expect(by["nuclear-sites"].include).toEqual(expect.arrayContaining(["DOW-UAP-D094", "DOW-UAP-D017"]));
    expect(by["nuclear-sites"].exclude).toContain("DOW-UAP-D126");
    expect(by["congress"].exclude).toContain("059uap00013");
  });
});

describe("TOPIC_TEXT", () => {
  it("every topic has a background (≤ 700 chars), optional lore, and 2–5 sources with positive pages", () => {
    for (const t of TOPIC_RULES) {
      const x = TOPIC_TEXT[t.slug];
      expect(x, t.slug).toBeDefined();
      expect(x.background.length, t.slug).toBeGreaterThan(80);
      expect(x.background.length, t.slug).toBeLessThanOrEqual(700);
      expect(x.sources.length, t.slug).toBeGreaterThanOrEqual(2);
      expect(x.sources.length, t.slug).toBeLessThanOrEqual(5);
      for (const s of x.sources) {
        expect(s.note.length, `${t.slug} ${s.id}`).toBeGreaterThan(3);
        if (s.page !== undefined) expect(Number.isInteger(s.page) && s.page > 0, `${t.slug} ${s.id}`).toBe(true);
      }
    }
    expect(Object.keys(TOPIC_TEXT).sort()).toEqual(TOPIC_RULES.map((t) => t.slug).sort());
  });
});

describe("firstSentence", () => {
  it("doesn't stop at abbreviations like U.S. or No.", () => {
    expect(firstSentence("Mission Reports (MISREPs) are the forms U.S. military aircrews file after a mission. Each one here logs a UAP.")).toBe(
      "Mission Reports (MISREPs) are the forms U.S. military aircrews file after a mission."
    );
    expect(firstSentence("Its Special Report No. 14 came out in 1955. Later text.")).toBe("Its Special Report No. 14 came out in 1955.");
    expect(firstSentence("No full stop")).toBe("No full stop");
  });
});
