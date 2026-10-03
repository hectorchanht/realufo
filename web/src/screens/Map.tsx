// Sighting Map + stats screen — ported from realufo-handoff/RealUFO.dc.html
// lines 311-343 (the `showMap` branch): a bordered grid-lined map with
// twinkling signal dots, 4 "Press Start 2P" stat tiles, a "◆ Records by
// decade" vertical bar chart, and a "◆ Top locations" horizontal bar list.
//
// This component renders ONLY the screen content — AppShell (Task 14) owns
// the app frame/AppBar/nav and mounts this inside its `<Outlet/>`, same as
// every other screen task. Data: `useBootstrap()` for `places`/`sightings`/
// `stats` (all default to `[]`/undefined-safe so nothing here ever indexes
// into `undefined` while the query is still loading — see
// FRONTEND-CONTEXT.md's query-hooks contract).
//
// Map points: real places (bootstrap `places[]`, worker/lib/places.ts) —
// one dot per spot, sized by its real file count, projected client-side with
// `project()` (lib/map.ts). Off-world places (Moon, low Earth orbit) have no
// lat/lng and sit in a corner chip instead. Tapping a place opens PlacePanel
// (below the map on phones, a right column >=900px) listing its files via
// `useRecords`, with "See all" to its location hub (or the filtered Archive).
// Curated case pins (`sightings[]`, case rows only) are a separate diamond
// marker that navigates to /case/:slug; their prototype counts were fake and
// are gone.
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useBootstrap, useRecords } from "../api/queries";
import { dotSize, placesNear, project } from "../lib/map";
import { MAP_INTRO } from "../../../worker/lib/shared";
import { useSetPageTitle } from "../lib/pageTitle";
import { WorldMap } from "../components/WorldMap";
import { DocCard } from "../components/DocCard";
import type { MapPlace, Stats } from "../api/types";
import { Skeleton } from "../components/Skeleton";

const files = (n: number) => `${n} file${n === 1 ? "" : "s"}`;

const STAT_TILES: Array<{ key: keyof Pick<Stats, "records" | "videos" | "threads" | "postsToday">; label: string; color: string }> = [
  { key: "records", label: "Records", color: "var(--signal)" },
  { key: "videos", label: "Videos", color: "var(--cyan)" },
  { key: "threads", label: "Threads", color: "var(--amber)" },
  { key: "postsToday", label: "Posts today", color: "var(--violet)" },
];

const PANEL_FILES = 12;

function PlacePanel({ place, onClose }: { place: MapPlace; onClose: () => void }) {
  const { data, isLoading } = useRecords({ location: place.values, limit: PANEL_FILES });
  const seeAll = place.hub ? `/location/${place.hub}` : `/archive?${new URLSearchParams({ location: place.values[0] })}`;
  return (
    <section
      aria-label={place.name}
      className="mb-[14px] rounded-2xl border border-line2 bg-surface p-[14px] min-[900px]:max-h-[640px] min-[900px]:overflow-y-auto"
      style={{ animation: "fadeup .25s ease both" }}
    >
      <div className="mb-3 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold text-ink">{place.name}</h2>
          <div className="mt-1 font-mono text-[10px] uppercase tracking-[.6px] text-faint">{files(place.count)}</div>
        </div>
        <button type="button" aria-label="Close" onClick={onClose} className="px-1 font-mono text-[14px] text-faint hover:text-ink">
          ✕
        </button>
      </div>
      {isLoading ? (
        <Skeleton cards rows={4} />
      ) : (
        <div className="grid grid-flow-row-dense grid-cols-2 gap-3">
          {(data?.records ?? []).map((r) => (
            <DocCard key={r.id} record={r} variant="grid" />
          ))}
        </div>
      )}
      <Link to={seeAll} className="mt-3 inline-block font-mono text-[11px] text-signal hover:underline">
        See all {place.count} →
      </Link>
    </section>
  );
}

// Shown when a tap lands on several overlapping dots: pick one to open.
function PlaceChooser({ places, onPick, onClose }: { places: MapPlace[]; onPick: (name: string) => void; onClose: () => void }) {
  const label = `${places.length} places here`;
  return (
    <section
      aria-label={label}
      className="mb-[14px] rounded-2xl border border-line2 bg-surface p-[14px]"
      style={{ animation: "fadeup .25s ease both" }}
    >
      <div className="mb-2 flex items-center gap-2">
        <h2 className="flex-1 font-mono text-[10px] uppercase tracking-[.6px] text-faint">{label}</h2>
        <button type="button" aria-label="Close" onClick={onClose} className="px-1 font-mono text-[14px] text-faint hover:text-ink">
          ✕
        </button>
      </div>
      <div className="flex flex-col">
        {places.map((p) => (
          <button
            key={p.name}
            type="button"
            onClick={() => onPick(p.name)}
            className="flex items-center gap-3 border-t border-line py-[10px] text-left first:border-t-0 hover:text-signal"
          >
            <span className="min-w-0 flex-1 truncate text-[14px] text-ink">{p.name}</span>
            <span className="flex-none font-mono text-[10px] text-faint">{files(p.count)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function MapScreen() {
  // AppBar title — prototype's `titles.map` (RealUFO.dc.html:566).
  useSetPageTitle("SIGHTING MAP", "Where the files come from");

  const { data } = useBootstrap();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string | null>(null);
  const [choices, setChoices] = useState<MapPlace[] | null>(null);

  const cases = data?.sightings ?? [];
  const places = data?.places ?? [];
  const onMap = places.filter((p) => p.lat !== null && p.lng !== null);
  const offWorld = places.filter((p) => p.lat === null || p.lng === null);
  const place = places.find((p) => p.name === selected) ?? null;
  // One link per hub (a hub can cover several map places); the biggest place names it.
  const hubPlaces = places
    .filter((p) => p.hub)
    .sort((p, q) => q.count - p.count)
    .filter((p, i, a) => a.findIndex((q) => q.hub === p.hub) === i);
  const stats = data?.stats;
  const byDecade = stats?.byDecade ?? [];
  const topLocations = stats?.topLocations ?? [];

  // Math.max(1, ...) keeps the divisor safe (no NaN/Infinity bar heights)
  // whether the array is empty or every count happens to be 0.
  const maxDecade = Math.max(1, ...byDecade.map(([, n]) => n));
  const maxLocation = Math.max(1, ...topLocations.map(([, n]) => n));

  const toggle = (name: string) => {
    setChoices(null);
    setSelected((s) => (s === name ? null : name));
  };

  // Pointer taps anywhere on the map hit-test every dot near the finger, so
  // overlapping dots and taps on a dot's glow still resolve. Keyboard
  // activation (detail 0) is left to the focused dot's own onClick.
  const pick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.detail === 0) return;
    const box = e.currentTarget.getBoundingClientRect();
    const hits = placesNear(onMap, e.clientX - box.left, e.clientY - box.top, box.width, box.height);
    if (hits.length === 1) toggle(hits[0].name);
    else if (hits.length > 1) {
      setSelected(null);
      setChoices(hits);
    }
  };

  return (
    <div data-screen="map" style={{ animation: "fadeup .35s ease both" }}>
      <p className="mb-3 text-[13px] leading-[1.55] text-dim">{MAP_INTRO}</p>
      <div className={place || choices ? "items-start min-[900px]:grid min-[900px]:grid-cols-[minmax(0,1fr)_340px] min-[900px]:gap-[14px]" : ""}>
        {/* map panel — prototype lines 313-321 */}
        <div
          data-map
          onClick={pick}
          className="relative mb-[14px] aspect-[16/10] overflow-hidden rounded-2xl border border-line2"
          style={{ background: "radial-gradient(120% 120% at 50% 0%, var(--surface), var(--bg2))" }}
        >
          <div
            className="absolute inset-0 opacity-30"
            style={{
              backgroundImage:
                "linear-gradient(var(--line) 1px, transparent 1px), linear-gradient(90deg, var(--line) 1px, transparent 1px)",
              backgroundSize: "9.09% 12.5%",
            }}
          />
          {/* Pixelated equirectangular world map behind the sighting dots. */}
          <WorldMap />
          <div className="absolute left-0 right-0 top-1/2 h-px opacity-60" style={{ background: "var(--line2)" }} />
          <div className="absolute bottom-0 top-0 left-1/2 w-px opacity-60" style={{ background: "var(--line2)" }} />
          {onMap.map((p) => {
            const { x, y } = project(p.lat!, p.lng!);
            const size = dotSize(p.count);
            const active = p.name === selected || !!choices?.some((c) => c.name === p.name);
            return (
              <button
                key={p.name}
                type="button"
                title={`${p.name} · ${files(p.count)}`}
                aria-pressed={active}
                onClick={(e) => e.detail === 0 && toggle(p.name)}
                className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full hover:scale-150"
                style={{
                  left: `${x * 100}%`,
                  top: `${y * 100}%`,
                  width: size,
                  height: size,
                  background: "var(--signal)",
                  boxShadow: active ? "0 0 0 2px var(--ink), 0 0 14px 3px var(--signal)" : "0 0 12px 2px var(--signal)",
                  zIndex: active ? 2 : 1,
                  animation: active ? undefined : "twinkle 3s ease-in-out infinite",
                }}
              />
            );
          })}
          {cases.map((c) => {
            const { x, y } = project(c.lat, c.lng);
            return (
              <button
                key={c.id}
                type="button"
                title={`Case: ${c.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (c.case_slug) navigate(`/case/${c.case_slug}`);
                }}
                className="absolute z-[3] h-[9px] w-[9px] -translate-x-1/2 -translate-y-1/2 rotate-45 border border-bg hover:scale-150"
                style={{ left: `${x * 100}%`, top: `${y * 100}%`, background: c.accent }}
              />
            );
          })}
          {offWorld.length > 0 && (
            <div className="absolute bottom-[30px] left-3 z-[3] flex flex-col items-start gap-1">
              {offWorld.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  aria-pressed={p.name === selected}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(p.name);
                  }}
                  className={`rounded-full border bg-surface px-2 py-[3px] font-mono text-[9px] hover:text-ink ${
                    p.name === selected ? "border-signal text-signal" : "border-line2 text-dim"
                  }`}
                >
                  ☾ {p.name} · {p.count}
                </button>
              ))}
            </div>
          )}
          <div
            className="absolute bottom-[11px] left-3 font-mono text-[9px] text-faint"
            style={{ letterSpacing: ".5px" }}
          >
            ◉ {places.length} PLACES · ◆ {cases.length} CASES · TAP A SIGNAL
          </div>
        </div>
        {place && <PlacePanel place={place} onClose={() => setSelected(null)} />}
        {choices && <PlaceChooser places={choices} onPick={toggle} onClose={() => setChoices(null)} />}
      </div>
      {!!data?.unmappedFiles && (
        <div className="-mt-2 mb-[14px] font-mono text-[9px] text-faint">
          + {files(data.unmappedFiles)} without a map spot (e.g. “Various”)
        </div>
      )}

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

      {/* Same places as links (the map is buttons on a canvas): each opens its hub page. */}
      {hubPlaces.length > 0 && (
        <nav aria-label="Places in the archive" className="mt-6">
          <h2 className="mx-0.5 mb-3 font-pixel text-[9px] tracking-[1px] text-faint">◆ Places in the archive</h2>
          <ul className="flex flex-wrap gap-2">
            {hubPlaces.map((p) => (
              <li key={p.name}>
                <Link
                  to={`/location/${p.hub}`}
                  className="inline-block rounded-full border border-line2 px-[11px] py-[5px] font-mono text-[10px] text-dim hover:border-signal hover:text-signal"
                >
                  {p.name} · {p.count}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}

export default MapScreen;
