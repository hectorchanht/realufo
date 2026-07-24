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
