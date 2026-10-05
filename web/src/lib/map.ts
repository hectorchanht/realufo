// Equirectangular lat/lng -> unit-square (0..1) projection for the Sighting
// Map screen (Task 23). The prototype (realufo-handoff/data.js's
// `mapPoints[]`) stores precomputed `x`/`y` per point rather than raw
// lat/lng; our API instead returns `lat`/`lng` on each `Sighting`
// (docs/superpowers/FRONTEND-CONTEXT.md's bootstrap shape), so the screen
// projects client-side with this exact formula.
//
// Verified against data.js's own stored values for its Roswell point
// (lat:33.39, lng:-104.52 -> x:0.20966666666666667, y:0.3145):
//   x = (lng + 180) / 360
//   y = (90 - lat) / 180
export interface ProjectedPoint {
  x: number;
  y: number;
}

export function project(lat: number, lng: number): ProjectedPoint {
  return {
    x: (lng + 180) / 360,
    y: (90 - lat) / 180,
  };
}

// Dot diameter in px: log-scaled so a 1-file place is still tappable and the
// ~50-file regions don't swallow their neighbours.
export function dotSize(count: number): number {
  return 8 + Math.min(14, Math.log2(count) * 2.5);
}

// Deep-link slug for map places — single source of truth lives in
// worker/lib/places.ts (same module the web app already imports MAP_INTRO from).
export { placeSlug } from "../../../worker/lib/places";

// Every on-map place whose dot sits under a tap at (px, py) in a w×h box,
// biggest first. Many places are <1° apart (Colorado / Colorado Springs) and
// overlap at any zoom, so a tap resolves to all of them, not the topmost.
// `slop` widens each dot's hit radius for fingers.
export function placesNear<T extends { lat: number | null; lng: number | null; count: number }>(
  places: T[],
  px: number,
  py: number,
  w: number,
  h: number,
  slop = 12,
): T[] {
  return places
    .filter((p) => {
      if (p.lat === null || p.lng === null) return false;
      const { x, y } = project(p.lat, p.lng);
      return Math.hypot(x * w - px, y * h - py) <= dotSize(p.count) / 2 + slop;
    })
    .sort((a, b) => b.count - a.count);
}
