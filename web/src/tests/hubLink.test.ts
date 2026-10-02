import { describe, it, expect } from "vitest";
import type { HubSummary } from "../api/types";
import { hubForFilters } from "../lib/hubLink";

const hubs: HubSummary[] = [
  { kind: "release", slug: "6", label: "Release 06 · 18 Sep 2026", count: 74 },
  { kind: "agency", slug: "department-of-war", label: "Department of War", count: 267, values: ["DoW", "Department of War"] },
  { kind: "location", slug: "colorado", label: "Colorado", count: 16, values: ["Colorado", "Colorado Springs, Colorado"] },
  { kind: "decade", slug: "1950s", label: "1950s", count: 29 },
];

describe("hubForFilters", () => {
  it("maps a single tag filter, through aliases, to its hub", () => {
    expect(hubForFilters({ agency: "DoW" }, hubs)?.slug).toBe("department-of-war");
    expect(hubForFilters({ location: "Colorado Springs, Colorado" }, hubs)?.slug).toBe("colorado");
    expect(hubForFilters({ release: "6" }, hubs)?.slug).toBe("6");
    expect(hubForFilters({ decade: "1950" }, hubs)?.slug).toBe("1950s");
  });
  it("no hub for two tag filters, an unmapped value, or no tag filter", () => {
    expect(hubForFilters({ agency: "DoW", release: "6" }, hubs)).toBeNull();
    expect(hubForFilters({ agency: "IC" }, hubs)).toBeNull();
    expect(hubForFilters({ decade: "1980" }, hubs)).toBeNull();
    expect(hubForFilters({}, hubs)).toBeNull();
  });
});
