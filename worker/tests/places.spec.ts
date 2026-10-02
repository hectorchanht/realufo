import { describe, it, expect } from "vitest";
import { PLACES, mapPlaces } from "../lib/places";

describe("places gazetteer", () => {
  it("maps each raw D1 location value to at most one place", () => {
    const all = PLACES.flatMap((p) => p.values);
    expect(new Set(all).size).toBe(all.length);
  });

  it("every place has real coordinates or is explicitly off-world", () => {
    for (const p of PLACES) {
      if (p.lat === null) expect(p.lng).toBeNull();
      else expect(Math.abs(p.lat) <= 90 && Math.abs(p.lng!) <= 180).toBe(true);
    }
  });
});

describe("mapPlaces", () => {
  const rows = [
    { location: "Western United States", n: 49 },
    { location: "Westen United States", n: 7 },
    { location: "Moon", n: 8 },
    { location: "Various", n: 6 },
    { location: "Somewhere New", n: 2 },
  ];

  it("sums aliases into one place with real counts, busiest first", () => {
    const { places } = mapPlaces(rows, new Set());
    expect(places[0]).toMatchObject({ name: "Western United States", count: 56 });
    expect(places[0].values).toEqual(["Western United States", "Westen United States"]);
  });

  it("keeps off-world places with null coords and drops zero-count places", () => {
    const { places } = mapPlaces(rows, new Set());
    expect(places.find((p) => p.name === "The Moon")).toMatchObject({ lat: null, lng: null, count: 8 });
    expect(places.every((p) => p.count > 0)).toBe(true);
  });

  it("counts files whose location has no map spot (skipped + unknown values)", () => {
    expect(mapPlaces(rows, new Set()).unmapped).toBe(8);
  });

  it("links a place to a location hub only when that hub is live", () => {
    expect(mapPlaces(rows, new Set()).places[0].hub).toBeNull();
    expect(mapPlaces(rows, new Set(["western-united-states"])).places[0].hub).toBe("western-united-states");
  });
});
