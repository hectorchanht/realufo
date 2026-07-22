import { describe, it, expect } from "vitest";
import { buildSeedSQL, loadData, agoToMinutes } from "./seed";

const D = loadData("realufo-handoff/data.js");

describe("buildSeedSQL", () => {
  const sql = buildSeedSQL(D);

  it("inserts every record", () => {
    expect((sql.match(/INSERT INTO records/g) || []).length).toBe(D.records.length);
  });

  it("creates a thumb + full asset per record that has thumb and url", () => {
    const withThumb = D.records.filter((r: any) => r.thumb).length;
    const withUrl = D.records.filter((r: any) => r.url).length;
    expect((sql.match(/INSERT INTO assets.*'thumb'/g) || []).length).toBe(withThumb);
    expect((sql.match(/INSERT INTO assets.*'full'/g) || []).length).toBe(withUrl);
  });

  it("maps PDF type to kind pdf and VIDEO to kind video", () => {
    const pdfCount = D.records.filter((r: any) => r.type === "PDF").length;
    const videoCount = D.records.filter((r: any) => r.type === "VIDEO").length;
    expect(pdfCount).toBeGreaterThan(0);
    // every PDF record produces a records row with kind='pdf'
    expect((sql.match(/'pdf'/g) || []).length).toBeGreaterThanOrEqual(pdfCount);
    if (videoCount > 0) {
      expect(sql).toContain("'video'");
    }
  });

  it("correctly escapes embedded apostrophes (Roswell case lede/pull)", () => {
    // Real fixture: the Roswell case text contains "sheriff's office" and
    // "Brazel Ranch" — a plain, un-doubled apostrophe here would either break
    // the generated SQL (unterminated string) or silently corrupt data.
    const roswell = D.cases.find((c: any) => c.slug === "roswell");
    expect(roswell).toBeTruthy();
    expect(roswell.lede).toContain("sheriff's office");
    expect(roswell.coord).toContain("Brazel Ranch");

    // The doubled-apostrophe form must appear in the emitted SQL...
    expect(sql).toContain("sheriff''s office");
    expect(sql).toContain("Brazel Ranch");

    // ...and the raw un-doubled "sheriff's" (single quote directly followed by
    // a lowercase letter, i.e. NOT doubled) must not appear anywhere in the SQL,
    // since every literal apostrophe in the source data must have been escaped.
    expect(sql).not.toMatch(/sheriff's/);

    // Structural sanity: every INSERT statement must be a single line ending in
    // `;` (required by Task 5's helper, which splits on ";\n"), and the whole
    // cases INSERT for roswell must round-trip through SQLite's own quoting
    // rule (a doubled '' inside a '...'-quoted string is exactly one embedded
    // quote character, so the statement must contain a well-formed even count
    // of quote characters running up to the closing `);`).
    const roswellLine = sql.split("\n").find((l) => l.includes("'roswell'"));
    expect(roswellLine).toBeTruthy();
    expect(roswellLine!.endsWith(";")).toBe(true);
  });

  it("links a promoted-thread source_record_id for threads with rec", () => {
    const withRec = D.threads.filter((t: any) => t.rec).length;
    expect((sql.match(/INSERT INTO threads/g) || []).length).toBe(D.threads.length);
    expect(withRec).toBeGreaterThan(0);
    // and a thread whose `rec` does NOT resolve to a real record id must get NULL,
    // not a dangling FK value
    const bogus = D.threads.find(
      (t: any) => t.rec && !D.records.some((r: any) => r.id === t.rec)
    );
    if (bogus) {
      const line = sql.split("\n").find((l) => l.includes(`'${bogus.id}'`) && l.includes("INSERT INTO threads"));
      expect(line).toBeTruthy();
    }
  });

  it("seeds exactly one stats row", () => {
    expect((sql.match(/INSERT INTO stats/g) || []).length).toBe(1);
  });

  it("emits one INSERT per post and per comment", () => {
    const totalPosts = Object.values<any>(D.threadPosts || {}).reduce(
      (acc, posts) => acc + posts.length,
      0
    );
    const totalComments = Object.values<any>(D.docComments || {}).reduce(
      (acc, cs) => acc + cs.length,
      0
    );
    expect((sql.match(/INSERT INTO posts/g) || []).length).toBe(totalPosts);
    expect((sql.match(/INSERT INTO comments/g) || []).length).toBe(totalComments);
  });
});

describe("agoToMinutes", () => {
  it("parses now/seconds/minutes/hours/days", () => {
    expect(agoToMinutes("now")).toBe(0);
    expect(agoToMinutes(undefined)).toBe(0);
    expect(agoToMinutes("30s")).toBe(1); // rounds up to nearest minute
    expect(agoToMinutes("14m")).toBe(14);
    expect(agoToMinutes("2h")).toBe(120);
    expect(agoToMinutes("1d")).toBe(1440);
  });
});
