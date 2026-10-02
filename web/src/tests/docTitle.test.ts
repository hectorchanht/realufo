import { describe, it, expect } from "vitest";
import { docTitleParts, docPageTitle } from "../lib/docTitle";

const CASES: [string, string, string, boolean, string][] = [
  // [id, raw title, shown title, showId, shown id] — real records
  ["DOW-UAP-D094", "DOW-UAP-D094, Analysis of Flying Object Incidents in the United States, 1949", "Analysis of Flying Object Incidents in the United States, 1949", true, "DOW-UAP-D094"],
  ["DOW-UAP-D085", "DOW-UAP-D085_Transmission-of-CIA-Scientific-Advisory-Panel-Rept_1953", "Transmission-of-CIA-Scientific-Advisory-Panel-Rept 1953", true, "DOW-UAP-D085"],
  ["AARO-IMG-Go_Fast_UAP", "Go Fast UAP", "Go Fast UAP", false, "AARO-IMG-Go_Fast_UAP"],
  ["AARO-AARO_Puerto_Rico_UAP_Case_Resolution.pdf", "Puerto Rico UAP Case Resolution", "Puerto Rico UAP Case Resolution", false, "AARO-AARO_Puerto_Rico_UAP_Case_Resolution.pdf"],
  ["341110677NumericalFile", "341_110677_Numerical_File,_5-2500", "341 110677 Numerical File, 5-2500", false, "341110677NumericalFile"],
  ["65-hs1-834228961-62-hq-83894-section-1", "65_HS1-834228961_62-HQ-83894_Section_001", "65 HS1-834228961 62-HQ-83894 Section 001", false, "65-hs1-834228961-62-hq-83894-section-1"],
  ["AARO-956955", "Navy 2021 Flyby video", "Navy 2021 Flyby video", true, "AARO-956955"],
  ["DOW-UAP", "DOW-UAP-PR057a, \"Spherical UAP in clouds\"", "\"Spherical UAP in clouds\"", true, "DOW-UAP-PR057a"],
  ["AARO-AARO_Al_Taqaddam_Case_Resolution_Final.pdf", "Al Taqaddum Case Resolution", "Al Taqaddum Case Resolution", false, "AARO-AARO_Al_Taqaddam_Case_Resolution_Final.pdf"],
  ["AARO-AARO_GoFast_Case_Resolution_Card_Methodology_Final.pdf", "\"GO FAST\" Case Resolution Methodology", "\"GO FAST\" Case Resolution Methodology", false, "AARO-AARO_GoFast_Case_Resolution_Card_Methodology_Final.pdf"],
  ["NARA-2024-NDAA-Public-Law-118-31", "2024 National Defense Authorization Act — Public Law 118-31", "2024 National Defense Authorization Act — Public Law 118-31", true, "NARA-2024-NDAA-Public-Law-118-31"],
  ["X-1", "X-1", "X-1", false, "X-1"],
  ["WARGOV-VID-111688723", "DOW-UAP-PR019, Unresolved UAP Report, Middle East, May 2022", "Unresolved UAP Report, Middle East, May 2022", true, "DOW-UAP-PR019"],
  ["FBI-UAP-D014-2", "FBI-UAP-D014, Correspondence Relating to UFO Sightings, 1967, 1974", "Correspondence Relating to UFO Sightings, 1967, 1974", true, "FBI-UAP-D014"],
  ["X-2", "", "X-2", false, "X-2"],
];

describe("docTitleParts", () => {
  it.each(CASES)("%s", (id, raw, title, showId, shown) => {
    expect(docTitleParts(id, raw)).toEqual({ id: shown, title, showId });
  });

  it("a video slug borrowing its PDF twin's code is told apart by kind", () => {
    const raw = "DOW-UAP-PR019, Unresolved UAP Report, Middle East, May 2022";
    expect(docTitleParts("WARGOV-VID-111688723", raw, "video").id).toBe("DOW-UAP-PR019 (video)");
    expect(docTitleParts("DOW-UAP-PR019", raw, "pdf").id).toBe("DOW-UAP-PR019");
    expect(docTitleParts("WARGOV-VID-111688723", raw).id).toBe("DOW-UAP-PR019"); // kind unknown: unchanged
  });
  it("page title leads with the id only when it adds something", () => {
    expect(docPageTitle("DOW-UAP-D094", "DOW-UAP-D094, Analysis")).toBe("DOW-UAP-D094 — Analysis");
    expect(docPageTitle("AARO-IMG-Go_Fast_UAP", "Go Fast UAP")).toBe("Go Fast UAP");
  });
});
