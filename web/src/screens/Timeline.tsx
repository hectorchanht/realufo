// Sightings Timeline — year-by-year visualization of dated sightings.
// Data: GET /api/timeline (D1 `records.incident_date` aggregated through
// yearOf(), the same parser the Archive decade filter uses). Visual language
// follows web/src/screens/Map.tsx: pixel headings, stat tiles, gradient bars,
// fadeup animation. Each year bar is a real link to /timeline/:year — opening
// a year shows its files (useRecords with the `year` param, same free-text
// matching as the decade filter) and the URL is shareable/referenceable;
// "See all" goes to the year's decade hub.
import { useEffect, useMemo } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useRecords, useTimeline } from "../api/queries";
import { useSetPageTitle } from "../lib/pageTitle";
import { DocCard } from "../components/DocCard";
import { Skeleton } from "../components/Skeleton";

const PANEL_FILES = 12;
const YEAR_RE = /^\d{4}$/;

function YearPanel({ year, count }: { year: number; count: number }) {
  const { data, isLoading } = useRecords({ year: String(year), limit: PANEL_FILES }, { enabled: true });
  const decade = Math.floor(year / 10) * 10;
  return (
    <section
      id={`year-${year}`}
      aria-label={`${year} sightings`}
      className="mb-[14px] scroll-mt-[76px] rounded-2xl border border-line2 bg-surface p-[14px]"
      style={{ animation: "fadeup .25s ease both" }}
    >
      <div className="mb-3 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="font-pixel text-[15px] text-signal">{year}</h2>
          <div className="mt-1 font-mono text-[10px] uppercase tracking-[.6px] text-faint">
            {count} file{count === 1 ? "" : "s"}
          </div>
        </div>
        <Link
          to="/timeline"
          aria-label="Close year panel"
          className="px-1 font-mono text-[14px] text-faint hover:text-ink"
        >
          ✕
        </Link>
      </div>
      {isLoading ? (
        <Skeleton cards rows={4} />
      ) : (data?.records?.length ?? 0) === 0 ? (
        <p className="py-2 font-mono text-[11px] text-faint">No files listed for this year.</p>
      ) : (
        <div className="grid grid-flow-row-dense grid-cols-2 gap-3">
          {(data?.records ?? []).map((r) => (
            <DocCard key={r.id} record={r} variant="grid" />
          ))}
        </div>
      )}
      <Link to={`/decade/${decade}s`} className="mt-3 inline-block font-mono text-[11px] text-signal hover:underline">
        See all in the {decade}s →
      </Link>
    </section>
  );
}

export function TimelineScreen() {
  const { year: yearParam } = useParams();
  // The selected year lives in the URL (/timeline/:year) so every year bar is
  // a real, shareable link. A malformed :year bounces back to /timeline.
  const selected = yearParam != null && YEAR_RE.test(yearParam) ? Number(yearParam) : null;

  useSetPageTitle(
    "SIGHTINGS TIMELINE",
    "Year-by-year sightings from the archive",
    selected != null ? `${selected} UAP sightings` : undefined
  );

  const { data, isLoading } = useTimeline();

  // Deep link (/timeline/1947): bring the year's panel into view on arrival
  // and when hopping between years.
  useEffect(() => {
    if (selected != null) document.getElementById(`year-${selected}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selected]);

  const years = data?.years ?? [];
  const byYear = useMemo(() => new Map(years.map((y) => [y.year, y.count])), [years]);
  // Math.max(1, ...) keeps the divisor safe whether the array is empty or
  // every count happens to be 0 (same guard as Map's decade chart).
  const maxCount = Math.max(1, ...years.map((y) => y.count));
  const peakYear = data?.peak?.year ?? null;

  // Decade groups, oldest first; every decade in range renders all ten years
  // (missing years are zero-count nubs) so the timeline reads continuously.
  const decades = useMemo(() => {
    if (!years.length) return [];
    const minD = Math.floor(years[0].year / 10) * 10;
    const maxD = Math.floor(years[years.length - 1].year / 10) * 10;
    const groups: { decade: number; cells: { year: number; count: number }[]; total: number }[] = [];
    for (let d = minD; d <= maxD; d += 10) {
      const cells = Array.from({ length: 10 }, (_, i) => {
        const year = d + i;
        return { year, count: byYear.get(year) ?? 0 };
      });
      const total = cells.reduce((s, c) => s + c.count, 0);
      if (total > 0) groups.push({ decade: d, cells, total });
    }
    return groups;
  }, [years, byYear]);

  const tiles = [
    { label: "Dated records", value: data ? data.dated.toLocaleString() : "—", color: "var(--signal)" },
    {
      label: data?.peak ? `Peak year · ${data.peak.year}` : "Peak year",
      value: data?.peak ? data.peak.count.toLocaleString() : "—",
      color: "var(--cyan)",
    },
    {
      label: "Year span",
      value: data?.min != null && data?.max != null ? `${data.min}–${data.max}` : "—",
      color: "var(--amber)",
    },
    { label: "Undated records", value: data ? data.undated.toLocaleString() : "—", color: "var(--violet)" },
  ];

  const selectedCount = selected != null ? byYear.get(selected) ?? 0 : 0;

  if (yearParam != null && selected == null) return <Navigate to="/timeline" replace />;

  return (
    <div data-screen="timeline" style={{ animation: "fadeup .35s ease both" }}>
      <p className="mb-3 text-[13px] leading-[1.55] text-dim">
        Every dated sighting in the archive, year by year. Open a year to see its files — each year has its own
        shareable link.
      </p>

      {/* Stat tiles — same shape as Map's STAT_TILES. */}
      <div data-grid className="mb-5 grid grid-cols-2 gap-[10px] min-[900px]:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-[13px] border border-line bg-surface p-[14px]">
            <div className="font-pixel text-[15px]" style={{ color: tile.color }}>
              {tile.value}
            </div>
            <div className="mt-2 font-mono text-[9px] uppercase tracking-[.6px] text-faint">{tile.label}</div>
          </div>
        ))}
      </div>

      {isLoading ? (
        <Skeleton rows={8} />
      ) : decades.length === 0 ? (
        <p className="py-8 text-center font-mono text-[12px] text-faint">No dated sightings in the archive yet.</p>
      ) : (
        <>
          {selected != null && <YearPanel year={selected} count={selectedCount} />}
          {decades.map(({ decade, cells, total }) => (
            <div key={decade} className="mb-6">
              <div className="mx-0.5 mb-3 font-pixel text-[9px] tracking-[1px] text-faint">
                ◆ {decade}s · {total.toLocaleString()}
              </div>
              <div className="flex h-[120px] items-end gap-[4px]" role="group" aria-label={`${decade}s sightings by year`}>
                {cells.map(({ year, count }) => {
                  const active = selected === year;
                  const isPeak = peakYear === year;
                  return (
                    <Link
                      key={year}
                      to={active ? "/timeline" : `/timeline/${year}`}
                      aria-current={active ? "page" : undefined}
                      aria-label={`${year}: ${count} files`}
                      title={`${year} · ${count} files — ${active ? "close" : "open"} year link`}
                      className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-[6px] rounded-sm py-1 hover:bg-surface"
                    >
                      <span className="font-mono text-[8.5px] text-dim">{count > 0 ? count : ""}</span>
                      <div
                        className="w-full rounded-t"
                        style={{
                          height: `calc(${(count / maxCount) * 72}% + ${count > 0 ? 5 : 2}px)`,
                          background: isPeak
                            ? "linear-gradient(to top, var(--amber-dim, #7a5b1e), var(--amber))"
                            : "linear-gradient(to top, var(--signal-dim), var(--signal))",
                          boxShadow: active ? "0 0 0 2px var(--ink), 0 0 14px 3px var(--signal)" : undefined,
                          opacity: count === 0 ? 0.25 : 1,
                        }}
                      />
                      <span className="font-mono text-[7.5px] text-faint">{String(year).slice(2)}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
          <p className="mt-2 font-mono text-[9px] text-faint">
            Years are parsed from each file's incident date; {data?.undated.toLocaleString() ?? "—"} files have no
            parseable date and aren't charted.
          </p>
        </>
      )}
    </div>
  );
}

export default TimelineScreen;
