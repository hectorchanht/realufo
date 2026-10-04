// Map places (spec: "enrich the map", 2026-10-02): which raw D1 `location`
// values sit on which spot of the Sighting Map. Pure — counts come from
// routes/bootstrap.ts. D1 values are never rewritten; `values` merges aliases
// and typos ("Westen United States"). Regions and military commands get one
// representative spot; multi-place strings ("Northeastern U.S.; Afghanistan")
// sit on their first place. lat/lng null = off-world (shown as a chip, not a dot).
// A value missing here still counts, as "files without a map spot".
import { LOCATION_HUBS } from "./hubs";

export interface Place { name: string; lat: number | null; lng: number | null; values: string[] }
export interface MapPlace extends Place { count: number; hub: string | null }

const p = (name: string, lat: number | null, lng: number | null, values: string[] = [name]): Place => ({ name, lat, lng, values });

export const PLACES: Place[] = [
  // United States
  p("Western United States", 39.5, -116.5, ["Western United States", "Westen United States"]),
  p("Las Vegas, Nevada", 36.17, -115.14),
  p("Northeastern United States", 42.5, -73.5, ["Northeastern United States", "Northeastern U.S.; Afghanistan"]),
  p("Eastern United States", 37.5, -79),
  p("Southeastern United States", 33, -84),
  p("Southern United States", 32, -90),
  p("Midwestern United States", 41.5, -90),
  p("United States", 39.8, -98.6),
  p("Colorado", 39, -105.5),
  p("Colorado Springs, Colorado", 38.83, -104.82, ["Colorado Springs, Colorado", "Colorado Springs, Colorado, U.S."]),
  p("Washington, D.C.", 38.9, -77.04),
  p("Tremonton, Utah", 41.71, -112.17),
  p("Montana", 47, -109.5, ["Montana; Utah"]),
  p("New Mexico", 34.5, -106),
  p("Cape Kennedy, Florida", 28.4, -80.6),
  p("Virginia", 37.5, -78.8),
  p("Washington State", 47.4, -120.5, ["Washington State", "Washington State, United States"]),
  p("Texas", 31, -99),
  p("New Jersey", 40.1, -74.5, ["New Jersey", "New Jersey, United States"]),
  p("Detroit, Michigan", 42.33, -83.05, ["Detroit, Michigan", "Detroit, MI"]),
  p("Boston, Massachusetts", 42.36, -71.06),
  p("NORTHCOM", 47, -92),
  p("North America", 54, -102),
  p("Mexico", 23.6, -102.5),
  // Middle East / Central Asia
  p("CENTCOM", 29.5, 47.5),
  p("Middle East", 31, 36),
  p("Syria", 35, 38.5),
  p("Iraq", 33.2, 43.7),
  p("Iran", 32.4, 53.7),
  p("Arabian Gulf", 26.8, 51.5),
  p("Gulf of Oman", 24.5, 58.5),
  p("Strait of Hormuz", 26.57, 56.25),
  p("United Arab Emirates", 24.3, 54.4),
  p("Arabian Sea", 15, 65),
  p("Gulf of Aden", 12.5, 48),
  p("Djibouti", 11.6, 43.1),
  p("Afghanistan", 33.9, 67.7),
  p("Kazakhstan", 48, 67),
  p("Turkmenistan", 39, 59.5),
  p("Azerbaijan", 40.4, 49.9, ["Azerbaijan", "Baku, Azerbaijan"]),
  p("Georgia", 42.3, 43.4), // the country — the one record is a Tbilisi cable
  p("Ladakh, India", 34.2, 77.6, ["Ladakh, India; Nepal; Sikkim, India; Bhutan"]),
  // Europe
  p("Europe", 46.5, 2.5),
  p("EUCOM", 54, 25),
  p("Greece", 39, 22),
  p("Aegean Sea", 38.5, 25),
  p("Mediterranean Sea", 35, 18),
  p("Germany", 51.2, 10.4),
  p("Netherlands", 52.1, 5.3),
  p("Sweden", 62, 15),
  p("Hungary", 47.5, 19.04, ["Hungary", "Budapest, Hungary"]),
  p("USSR", 58, 70),
  // Asia-Pacific
  p("Yellow Sea", 35.5, 123.5),
  p("East China Sea", 29, 125.5),
  p("South China Sea", 13, 114),
  p("Japan", 36.2, 138.3),
  p("INDOPACOM", 5, 135, ["INDOPACOM", "Indo-PACOM"]),
  p("Papua New Guinea", -6.3, 145),
  p("Australia", -25, 134),
  p("Pacific Ocean", 15, -145),
  // Atlantic, Americas, Africa
  p("Atlantic Ocean", 30, -40),
  p("North Atlantic Ocean", 45, -35),
  p("Caribbean Sea", 15, -75),
  p("Gulf of America", 25, -90),
  p("Bahia, Brazil", -12.5, -41.7),
  p("Africa", 5, 20),
  p("AFRICOM", -5, 25),
  p("Harare, Zimbabwe", -17.83, 31.05),
  // Off-world
  p("The Moon", null, null, ["Moon"]),
  p("Low Earth orbit", null, null, ["Low Earth Orbit", "Low-Earth Orbit"]),
];
// "Various", "Pacific Time Zone": no single spot — counted as unmapped.

/** Per-place real file counts (busiest first) + how many located files have no spot. */
export function mapPlaces(rows: { location: string; n: number }[], liveHubs: Set<string>) {
  const counts = new Map(rows.map((r) => [r.location, r.n]));
  const places: MapPlace[] = PLACES.map((pl) => ({
    ...pl,
    count: pl.values.reduce((n, v) => n + (counts.get(v) ?? 0), 0),
    hub: LOCATION_HUBS.find((h) => liveHubs.has(h.slug) && h.values.some((v) => pl.values.includes(v)))?.slug ?? null,
  }))
    .filter((pl) => pl.count > 0)
    .sort((a, b) => b.count - a.count);
  const mapped = new Set(PLACES.flatMap((pl) => pl.values));
  const unmapped = rows.filter((r) => !mapped.has(r.location)).reduce((n, r) => n + r.n, 0);
  return { places, unmapped };
}
