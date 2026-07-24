// Sighting Map + stats screen — ported from realufo-handoff/RealUFO.dc.html
// lines 311-343 (the `showMap` branch): a bordered grid-lined map with one
// twinkling signal dot per bootstrap `sightings[]` entry, 4 "Press Start 2P"
// stat tiles, a "◆ Records by decade" vertical bar chart, and a "◆ Top
// locations" horizontal bar list.
//
// This component renders ONLY the screen content — AppShell (Task 14) owns
// the app frame/AppBar/nav and mounts this inside its `<Outlet/>`, same as
// every other screen task. Data: `useBootstrap()` for `sightings`/`stats`
// (both default to `[]`/undefined-safe so nothing here ever indexes into
// `undefined` while the query is still loading — see FRONTEND-CONTEXT.md's
// query-hooks contract).
//
// Map points: the prototype's data.js precomputes each point's `x`/`y`
// (equirectangular projection of `lat`/`lng`); our API instead returns raw
// `lat`/`lng` on each Sighting; `project()` (lib/map.ts) reproduces that
// projection client-side.
//
// Tap behavior (prototype's per-point `onTap`): a sighting with a
// `case_slug` navigates to `/case/:slug`; one without surfaces a toast
// ("<name> · <count> reports") via `useOverlay()` instead (prototype line
// 495's toast pattern, same as every other screen's non-navigating tap).
import { useNavigate } from "react-router-dom";
import { useBootstrap } from "../api/queries";
import { useOverlay } from "../overlays/OverlayProvider";
import { project } from "../lib/map";
import { useSetPageTitle } from "../lib/pageTitle";
import type { Sighting, Stats } from "../api/types";

// prototype line 318: dot diameter in px, `9 + min(15, n/11)` — scales with
// report count, capped at 24px.
function dotSize(count: number): number {
  return 9 + Math.min(15, count / 11);
}

const STAT_TILES: Array<{ key: keyof Pick<Stats, "records" | "videos" | "threads" | "postsToday">; label: string; color: string }> = [
  { key: "records", label: "Records", color: "var(--signal)" },
  { key: "videos", label: "Videos", color: "var(--cyan)" },
  { key: "threads", label: "Threads", color: "var(--amber)" },
  { key: "postsToday", label: "Posts today", color: "var(--violet)" },
];

export function MapScreen() {
  // AppBar title — prototype's `titles.map` (RealUFO.dc.html:566).
  useSetPageTitle("SIGHTING MAP", "Where the files come from");

  const { data } = useBootstrap();
  const navigate = useNavigate();
  const { toast } = useOverlay();

  const sightings = data?.sightings ?? [];
  const stats = data?.stats;
  const byDecade = stats?.byDecade ?? [];
  const topLocations = stats?.topLocations ?? [];

  // Math.max(1, ...) keeps the divisor safe (no NaN/Infinity bar heights)
  // whether the array is empty or every count happens to be 0.
  const maxDecade = Math.max(1, ...byDecade.map(([, n]) => n));
  const maxLocation = Math.max(1, ...topLocations.map(([, n]) => n));

  function handleTap(sighting: Sighting) {
    if (sighting.case_slug) {
      navigate(`/case/${sighting.case_slug}`);
    } else {
      toast(`${sighting.name} · ${sighting.count} reports`);
    }
  }

  return (
    <div data-screen="map" style={{ animation: "fadeup .35s ease both" }}>
      {/* map panel — prototype lines 313-321 */}
      <div
        className="relative mb-[14px] aspect-[16/10] overflow-hidden rounded-2xl border border-line2"
        style={{ background: "radial-gradient(120% 120% at 50% 0%, var(--surface), var(--bg2))" }}
      >
        <div
          className="absolute inset-0 opacity-50"
          style={{
            backgroundImage:
              "linear-gradient(var(--line) 1px, transparent 1px), linear-gradient(90deg, var(--line) 1px, transparent 1px)",
            backgroundSize: "9.09% 12.5%",
          }}
        />
        <div className="absolute left-0 right-0 top-1/2 h-px" style={{ background: "var(--line2)" }} />
        <div className="absolute bottom-0 top-0 left-1/2 w-px" style={{ background: "var(--line2)" }} />
        {sightings.map((sighting) => {
          const { x, y } = project(sighting.lat, sighting.lng);
          const size = dotSize(sighting.count);
          return (
            <button
              key={sighting.id}
              type="button"
              title={sighting.name}
              onClick={() => handleTap(sighting)}
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full hover:scale-150"
              style={{
                left: `${x * 100}%`,
                top: `${y * 100}%`,
                width: size,
                height: size,
                background: sighting.accent,
                boxShadow: `0 0 12px 2px ${sighting.accent}`,
                animation: "twinkle 3s ease-in-out infinite",
              }}
            />
          );
        })}
        <div
          className="absolute bottom-[11px] left-3 font-mono text-[9px] text-faint"
          style={{ letterSpacing: ".5px" }}
        >
          ◉ {sightings.length} HOTSPOTS · TAP A SIGNAL
        </div>
      </div>

      {/* 4 stat tiles — prototype lines 322-327 */}
      <div data-grid className="mb-5 grid grid-cols-2 gap-[10px] min-[900px]:grid-cols-4">
        {STAT_TILES.map((tile) => (
          <div key={tile.key} className="rounded-[13px] border border-line bg-surface p-[14px]">
            <div className="font-pixel text-[15px]" style={{ color: tile.color }}>
              {stats && stats[tile.key] != null ? stats[tile.key].toLocaleString() : "—"}
            </div>
            <div className="mt-2 font-mono text-[9px] uppercase tracking-[.6px] text-faint">{tile.label}</div>
          </div>
        ))}
      </div>

      {/* "◆ Records by decade" bar chart — prototype lines 328-336 */}
      <div className="mx-0.5 mb-3 font-pixel text-[9px] tracking-[1px] text-faint">◆ Records by decade</div>
      <div className="mb-2 flex h-[110px] items-end gap-[5px]">
        {byDecade.map(([label, n]) => (
          <div key={label} className="flex h-full flex-1 flex-col items-center justify-end gap-[6px]">
            <div
              title={String(n)}
              className="w-full rounded-t"
              style={{
                height: `${(n / maxDecade) * 94 + 6}%`,
                background: "linear-gradient(to top, var(--signal-dim), var(--signal))",
              }}
            />
            <span
              className="font-mono text-[7.5px] text-faint"
              style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
            >
              {label}
            </span>
          </div>
        ))}
      </div>

      {/* "◆ Top locations" bars — prototype lines 337-342 */}
      <div className="mx-0.5 mb-3 mt-5 font-pixel text-[9px] tracking-[1px] text-faint">◆ Top locations</div>
      <div className="flex flex-col gap-[9px]">
        {topLocations.map(([label, n]) => (
          <div key={label} className="flex items-center gap-[10px]">
            <span className="w-24 flex-none text-right font-mono text-[11px] text-dim">{label}</span>
            <div className="h-4 flex-1 overflow-hidden rounded-[5px] bg-surface">
              <div
                className="h-full"
                style={{
                  width: `${(n / maxLocation) * 100}%`,
                  background: "linear-gradient(90deg, var(--cyan), var(--signal))",
                }}
              />
            </div>
            <span className="w-12 flex-none font-mono text-[10px] text-faint">{n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default MapScreen;
