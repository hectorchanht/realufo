// buildCitations: pure citation builders for the Cite button.
import { describe, it, expect } from "vitest";
import { buildCitations } from "../lib/cite";

const rec = { id: "DOW-UAP-PR057a", agency: "DoW", agency_full: "Department of War", title: "UAP Report  PR057a ", doc_date: "7/10/26" };

describe("buildCitations", () => {
  it("APA: author (year, month day). title [Declassified record]. archive. url", () => {
    const c = buildCitations(rec, "https://realufo.org");
    expect(c.APA).toBe(
      "Department of War. (2026, July 10). UAP Report PR057a [Declassified record]. RealUFO Declassified UAP Archive. https://realufo.org/doc/DOW-UAP-PR057a"
    );
  });
  it("Chicago: author. \"title.\" archive. date. url.", () => {
    const c = buildCitations(rec, "https://realufo.org");
    expect(c.Chicago).toBe(
      'Department of War. "UAP Report PR057a." RealUFO Declassified UAP Archive. July 10, 2026. https://realufo.org/doc/DOW-UAP-PR057a.'
    );
  });
  it("BibTeX: @misc with a URL-safe key", () => {
    const c = buildCitations(rec, "https://realufo.org");
    expect(c.BibTeX).toContain("@misc{realufo:DOWUAPPR057a,");
    expect(c.BibTeX).toContain("author = {Department of War}");
    expect(c.BibTeX).toContain("year = {2026}");
  });
  it("falls back gracefully without agency/date/title", () => {
    const c = buildCitations({ id: "X-1" }, "https://realufo.org");
    expect(c.APA).toContain("U.S. Government. (n.d.).");
    expect(c.APA).toContain("X-1 [Declassified record]");
    expect(c.Chicago).toContain('"X-1."');
  });
  it("parses ISO dates too", () => {
    const c = buildCitations({ ...rec, doc_date: "2026-05-08" }, "https://realufo.org");
    expect(c.Chicago).toContain("May 8, 2026.");
  });
  it("RIS: TY/AU/TI/DA/PY/PB/UR/ER lines for Zotero import", () => {
    const c = buildCitations(rec, "https://realufo.org");
    const lines = c.RIS.split("\n");
    expect(lines[0]).toBe("TY  - ELEC");
    expect(lines).toContain("TI  - UAP Report PR057a");
    expect(lines).toContain("AU  - Department of War");
    expect(lines).toContain("DA  - 2026/07/10/");
    expect(lines).toContain("PY  - 2026");
    expect(lines).toContain("PB  - RealUFO Declassified UAP Archive");
    expect(lines).toContain("UR  - https://realufo.org/doc/DOW-UAP-PR057a");
    expect(lines[lines.length - 1]).toBe("ER  - ");
  });
  it("RIS falls back to year-only date", () => {
    const c = buildCitations({ id: "X-1", doc_date: "circa 1947" }, "https://realufo.org");
    expect(c.RIS.split("\n")).toContain("DA  - 1947///");
  });
});
