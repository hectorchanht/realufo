import { describe, it, expect } from "vitest";
import { AGENCY_HUBS, LOCATION_HUBS, hubIntro, hubStats, hubTitle, hubsFor, releaseLabel } from "../lib/hubs";

describe("hub registry", () => {
  it("slugs are url-safe and unique; no raw value sits in two hubs of a kind", () => {
    for (const hubs of [AGENCY_HUBS, LOCATION_HUBS]) {
      expect(new Set(hubs.map((h) => h.slug)).size).toBe(hubs.length);
      expect(hubs.every((h) => /^[a-z0-9-]+$/.test(h.slug))).toBe(true);
      const vals = hubs.flatMap((h) => h.values);
      expect(new Set(vals).size).toBe(vals.length);
    }
    expect(AGENCY_HUBS.length).toBe(9);
    expect(LOCATION_HUBS.length).toBe(19);
  });

  it("hubsFor maps aliases and only links live hubs", () => {
    const live = new Set(["agency/department-of-war", "location/colorado", "location/western-united-states", "release/2", "decade/1940s"]);
    expect(hubsFor({ agency: "Department of War", location: "Colorado Springs, Colorado, U.S.", incident_date: "12/30/47" }, 2, live)).toEqual({
      agency: "department-of-war", location: "colorado", release: "2", decade: "1940s",
    });
    expect(hubsFor({ agency: "DoW", location: "Westen United States", incident_date: null }, null, live)).toEqual({
      agency: "department-of-war", location: "western-united-states",
    });
    expect(hubsFor({ agency: "FBI", location: "Atlantis", incident_date: "1985" }, 3, live)).toEqual({});
  });
});

describe("titles, stats, intros", () => {
  it("titles per kind", () => {
    expect(releaseLabel(6, "2026-09-18")).toBe("Release 06 · 18 Sep 2026");
    expect(hubTitle({ kind: "release", slug: "6", label: "Release 06 · 18 Sep 2026", count: 74 })).toBe("Pentagon UFO Files Release 06 (18 Sep 2026): 74 Files");
    expect(hubTitle({ kind: "topic", slug: "aawsap", label: "AAWSAP & DIRDs", count: 44 })).toBe("AAWSAP & the DIRD Reports: 44 Declassified UFO Files");
    expect(hubTitle({ kind: "agency", slug: "fbi", label: "FBI", count: 5 })).toBe("FBI UAP files");
    expect(hubTitle({ kind: "location", slug: "las-vegas-nevada", label: "Las Vegas, Nevada", count: 37 })).toBe("UAP files: Las Vegas, Nevada");
    expect(hubTitle({ kind: "decade", slug: "1950s", label: "1950s", count: 29 })).toBe("1950s UAP files");
  });

  it("stats count kinds and year range", () => {
    expect(hubStats([
      { kind: "pdf", incident_date: "1952" }, { kind: "pdf", incident_date: "July, 1952" }, { kind: "image", incident_date: null },
    ])).toEqual({ files: 3, pdf: 2, video: 0, image: 1, from: "1952", to: "1952" });
  });

  it("intro pluralises, omits zero parts and phrases years", () => {
    const one = { files: 3, pdf: 2, video: 0, image: 1, from: "1952", to: "1952" };
    expect(hubIntro({ kind: "decade", slug: "1950s", label: "1950s", count: 3 }, null, one)).toBe(
      "3 declassified UAP files about incidents in the 1950s: 2 PDFs, 1 image. Incidents date from 1952."
    );
    const span = { files: 1, pdf: 0, video: 1, image: 0, from: "1947", to: "2025" };
    expect(hubIntro({ kind: "release", slug: "6", label: "Release 06 · 18 Sep 2026", count: 1 }, { no: 6, date: "2026-09-18" }, span)).toBe(
      "1 declassified UAP file the Department of War published on 18 September 2026 (Release 06): 1 video. Incidents span 1947–2025."
    );
    const noYear = { files: 2, pdf: 0, video: 2, image: 0, from: null, to: null };
    expect(hubIntro({ kind: "agency", slug: "fbi", label: "FBI", count: 2 }, null, noYear)).toBe(
      "2 declassified UAP files from the Federal Bureau of Investigation (FBI): 2 videos."
    );
    expect(hubIntro({ kind: "location", slug: "las-vegas-nevada", label: "Las Vegas, Nevada", count: 2 }, null, noYear)).toBe(
      "2 declassified UAP files about incidents in Las Vegas, Nevada: 2 videos."
    );
  });
});
