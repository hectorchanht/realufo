// Pixelated, game-like world map used as the Sighting Map backdrop. Rendered
// as a coarse equirectangular land grid (continents approximated by ellipse
// "blobs") so it aligns cell-for-cell with the same equirectangular projection
// the sighting dots use (lib/map.ts `project`): x=(lng+180)/360, y=(90-lat)/180.
// One <svg> of 1×1 rects (crisp edges) stretched to fill the map box.
import { useMemo } from "react";

const COLS = 96;
const ROWS = 48;

// [lngCenter, latCenter, lngRadius, latRadius] — rough continent blobs.
const BLOBS: Array<[number, number, number, number]> = [
  // North America
  [-100, 46, 33, 20],
  [-96, 62, 40, 12],
  [-108, 30, 16, 11],
  [-80, 24, 12, 8],
  // Greenland
  [-42, 72, 15, 9],
  // South America
  [-60, -10, 14, 22],
  [-64, -34, 8, 12],
  // Europe
  [12, 52, 19, 11],
  [26, 60, 20, 9],
  [-2, 54, 6, 6], // British Isles
  // Africa
  [18, 4, 21, 30],
  [24, -20, 13, 12],
  // Middle East
  [46, 30, 16, 14],
  // Asia
  [92, 52, 52, 20],
  [108, 32, 30, 16],
  [130, 60, 40, 13],
  [78, 22, 13, 13], // India
  [118, 4, 24, 9], // SE Asia / Indonesia
  [140, 38, 6, 9], // Japan
  // Australia
  [134, -25, 19, 11],
];

function isLand(lat: number, lng: number): boolean {
  for (const [lngC, latC, lngR, latR] of BLOBS) {
    const dx = (lng - lngC) / lngR;
    const dy = (lat - latC) / latR;
    if (dx * dx + dy * dy <= 1) return true;
  }
  return false;
}

export function WorldMap() {
  const cells = useMemo(() => {
    const rects: Array<{ x: number; y: number }> = [];
    for (let cy = 0; cy < ROWS; cy++) {
      for (let cx = 0; cx < COLS; cx++) {
        // cell center → lat/lng
        const lng = ((cx + 0.5) / COLS) * 360 - 180;
        const lat = 90 - ((cy + 0.5) / ROWS) * 180;
        if (isLand(lat, lng)) rects.push({ x: cx, y: cy });
      }
    }
    return rects;
  }, []);

  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${COLS} ${ROWS}`}
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
      {cells.map((c) => (
        <rect
          key={`${c.x}-${c.y}`}
          x={c.x + 0.12}
          y={c.y + 0.12}
          width={0.76}
          height={0.76}
          fill="var(--signal)"
          opacity={0.22}
        />
      ))}
    </svg>
  );
}

export default WorldMap;
