import { describe, it, expect } from "vitest";
import { docTitleParts, docPageTitle } from "../lib/docTitle";

const CASES: [string, string, string, boolean][] = [
  // [id, raw title, shown title, showId] — real records
  ["DOW-UAP-D094", "DOW-UAP-D094, Analysis of Flying Object Incidents in the United States, 1949", "Analysis of Flying Object Incidents in the United States, 1949", true],
  ["DOW-UAP-D085", "DOW-UAP-D085_Transmission-of-CIA-Scientific-Advisory-Panel-Rept_1953", "Transmission-of-CIA-Scientific-Advisory-Panel-Rept 1953", true],
  ["AARO-IMG-Go_Fast_UAP", "Go Fast UAP", "Go Fast UAP", false],
  ["AARO-AARO_Puerto_Rico_UAP_Case_Resolution.pdf", "Puerto Rico UAP Case Resolution", "Puerto Rico UAP Case Resolution", false],
  ["341110677NumericalFile", "341_110677_Numerical_File,_5-2500", "341 110677 Numerical File, 5-2500", false],
  ["65-hs1-834228961-62-hq-83894-section-1", "65_HS1-834228961_62-HQ-83894_Section_001", "65 HS1-834228961 62-HQ-83894 Section 001", false],
  ["AARO-956955", "Navy 2021 Flyby video", "Navy 2021 Flyby video", true],
  ["DOW-UAP", "DOW-UAP-PR057a, \"Spherical UAP in clouds\"", "DOW-UAP-PR057a, \"Spherical UAP in clouds\"", true],
  ["X-1", "X-1", "X-1", false],
  ["X-2", "", "X-2", false],
];

describe("docTitleParts", () => {
  it.each(CASES)("%s", (id, raw, title, showId) => {
    expect(docTitleParts(id, raw)).toEqual({ title, showId });
  });
  it("page title leads with the id only when it adds something", () => {
    expect(docPageTitle("DOW-UAP-D094", "DOW-UAP-D094, Analysis")).toBe("DOW-UAP-D094 — Analysis");
    expect(docPageTitle("AARO-IMG-Go_Fast_UAP", "Go Fast UAP")).toBe("Go Fast UAP");
  });
});
