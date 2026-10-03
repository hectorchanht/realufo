// Feed screen. Ported from realufo-handoff/RealUFO.dc.html lines 112-164
// (the `showFeed` branch of `data-screenpad`) minus the LIVE ticker: "◆ Trending
// threads" ThreadRow list + "all boards ›" (moved to the top), the "◆ Hot right now"
// DocCard grid, and the "91,808 FILES · 15 ARCHIVES" archive CTA card.
//
// This component renders ONLY that screen content — AppShell (Task 14) owns
// the app frame, AppBar, and nav, and mounts this inside its `<Outlet/>`
// (itself inside `data-screenpad`); the router wires `/` -> Feed (router.tsx).
//
// Data: `useBootstrap()` for `ticker` (+ `stats` for the archive CTA's file
// count), `useFeed()` for `featured`/`hot`. Both default to `[]` when the
// query hasn't resolved yet (or errored) so nothing here ever indexes into
// `undefined` — see FRONTEND-CONTEXT.md's query-hooks contract.
//
// Loading: the section headers/CTA are always-rendered static markup (so the
// screen never looks structurally empty); the grid shows card-sized
// placeholders and the thread list row-sized placeholders while
// `useFeed()`'s *initial* fetch is still in flight (`isLoading` — true only before the first settle, so a failed
// fetch still falls through to the graceful "map over an empty array"
// branch instead of loading forever).
//
// Grid: the prototype's responsive `[data-grid]` columns
// ([data-device=mobile] -> `1fr 1fr`, [data-device=desktop] -> auto-fill
// minmax(210px,1fr) — lines 48/53) aren't backed by a `data-device` attribute
// anywhere in this app (AppShell picks layout via `useMediaQuery`, not a data
// attribute+global CSS selector) — reproduced here as literal Tailwind
// classes at the same 900px breakpoint AppShell itself uses, with the
// `data-grid` attribute kept for markup parity.
import { Link } from "react-router-dom";
import { useBootstrap, useFeed, useHubs } from "../api/queries";
import type { HubSummary, Short } from "../api/types";
import { DocCard } from "../components/DocCard";
import { LoadError } from "../components/LoadError";
import { ShortsRow, shortHref } from "../components/ShortsRow";
import { ThreadRow } from "../components/ThreadRow";
import { useSetPageTitle } from "../lib/pageTitle";

// Neutral copy shown until bootstrap's `stats` resolve (no fake numbers).
const FALLBACK_STATS_LINE = "◆ THE DECLASSIFIED ARCHIVE";

function statsLine(stats?: { records?: number; archives?: number }): string {
  if (!stats || stats.records == null || stats.archives == null) return FALLBACK_STATS_LINE;
  return `◆ ${stats.records.toLocaleString()} FILES · ${stats.archives.toLocaleString()} ARCHIVES`;
}

// Hub entry points on the home page: every release, then the biggest
// agencies and locations. Hidden until /api/hubs answers (or if it's empty).
function BrowseStrip() {
  const hubs = useHubs().data?.hubs ?? [];
  const top = (kind: HubSummary["kind"], n: number) =>
    hubs.filter((h) => h.kind === kind).sort((a, b) => b.count - a.count).slice(0, n);
  const chips = [...hubs.filter((h) => h.kind === "release"), ...top("agency", 4), ...top("location", 4)];
  if (!chips.length) return null;
  return (
    <section aria-labelledby="feed-browse" className="mb-[26px]">
      <div className="mx-0.5 mb-3 flex items-baseline justify-between">
        <h2 id="feed-browse" className="font-pixel text-[9px] font-normal uppercase tracking-[1px] text-faint">
          ◆ Browse the files
        </h2>
        <Link to="/browse" className="font-mono text-[11px] text-signal">
          see all ›
        </Link>
      </div>
      <div className="flex flex-wrap gap-[7px]">
        {chips.map((h) => (
          <Link
            key={`${h.kind}/${h.slug}`}
            to={`/${h.kind}/${h.slug}`}
            className="rounded-[7px] border border-line px-[9px] py-1 font-mono text-[10px] text-dim hover:text-signal"
          >
            {/* "Release 06 · 18 Sep 2026" → "Release 06": the date makes six release chips stack one per row on phones */}
            {h.kind === "release" ? h.label.split(" · ")[0] : h.label} · {h.count}
          </Link>
        ))}
      </div>
    </section>
  );
}

// "Short clips" row: the 9:16 Shorts we post to social (showcase Shorts first,
// title already burned in), muted + looping, each playing only while ≥60% on
// screen; a tap opens the Shorts player. Hidden once the feed has answered with no clips.
function ClipCarousel({ clips, loading }: { clips: Short[]; loading: boolean }) {
  if (!loading && !clips.length) return null;
  return (
    <section aria-labelledby="feed-clips" className="mb-[26px]">
      <div className="mx-0.5 mb-3 flex items-baseline justify-between">
        <h2 id="feed-clips" className="font-pixel text-[9px] font-normal uppercase tracking-[1px] text-faint">
          ◆ Short clips
        </h2>
        <Link to="/archive?type=video" className="font-mono text-[11px] text-signal">
          all videos ›
        </Link>
      </div>
      <ShortsRow shorts={clips} loading={loading} href={(s) => shortHref(s)} />
    </section>
  );
}

export function Feed() {
  // AppBar title — prototype's `titles.feed` (RealUFO.dc.html:566).
  useSetPageTitle("REALUFO", "Declassified UAP archive + forum");

  const { data: boot } = useBootstrap();
  const { data: feed, isLoading: feedLoading, isError, error, refetch } = useFeed();
  const feedFailed = isError && !feed;

  const featured = feed?.featured ?? [];
  const hot = feed?.hot ?? [];
  const cases = boot?.cases ?? [];

  return (
    <div data-screen="feed" className="animate-[fadeup_.4s_ease_both]">
      <div className="mx-0.5 mb-3 flex items-baseline justify-between">
        <div className="font-pixel text-[9px] uppercase tracking-[1px] text-faint">◆ Trending threads</div>
        <Link to="/boards" className="font-mono text-[11px] text-signal">
          all boards ›
        </Link>
      </div>
      {feedFailed ? null : (
        <div aria-busy={feedLoading} className="mb-[26px] flex flex-col gap-[10px]">
          {feedLoading
            ? // Row-sized placeholders (the feed returns 4): this list sits above the
              // card grid, so a one-line loader here would shove the grid down on load.
              Array.from({ length: 4 }, (_, i) => (
                <div key={i} aria-hidden="true" className="h-[136px] rounded-[14px] border border-line bg-surface" />
              ))
            : hot.map((thread) => <ThreadRow key={thread.id} thread={thread} />)}
        </div>
      )}

      {feedFailed ? null : <ClipCarousel clips={feed?.clips ?? []} loading={feedLoading} />}

      <div className="mx-0.5 mb-3 font-pixel text-[9px] uppercase tracking-[1px] text-faint">◆ Hot right now</div>
      <div
        data-grid
        aria-busy={feedLoading}
        className="mb-[26px] grid grid-flow-row-dense grid-cols-2 gap-3 min-[900px]:grid-cols-[repeat(auto-fill,minmax(210px,1fr))]"
      >
        {feedLoading
          ? // Card-sized placeholders (the feed returns 6): reserving the grid's height
            // keeps everything below it from jumping when /api/feed lands (was CLS 0.47).
            Array.from({ length: 6 }, (_, i) => (
              <div key={i} aria-hidden="true" className="overflow-hidden rounded-[15px] border border-line bg-surface">
                <div className="aspect-[4/3] border-b border-line bg-bg2" />
                <div className="h-[100px]" />
              </div>
            ))
          : feedFailed
          ? <div className="col-span-full"><LoadError error={error} onRetry={() => void refetch()} /></div>
          : featured.map((record) => (
              // All six fit in about one phone screen and any of them can be the LCP
              // image (PageSpeed picked card 5 when only the first four were eager).
              <DocCard key={record.id} record={record} variant="feed" priority />
            ))}
      </div>

      <BrowseStrip />

      {cases.length > 0 && (
        <section aria-labelledby="feed-cases" className="mb-[26px]">
          <div className="mx-0.5 mb-3 flex items-baseline justify-between">
            <h2 id="feed-cases" className="font-pixel text-[9px] font-normal uppercase tracking-[1px] text-faint">
              ◆ Cold cases
            </h2>
            <Link to="/cases" className="font-mono text-[11px] text-signal">
              see all ›
            </Link>
          </div>
          <div className="flex flex-wrap gap-[7px]">
            {cases.slice(0, 6).map((c) => (
              <Link
                key={c.slug}
                to={`/case/${c.slug}`}
                className="rounded-[7px] border border-line px-[9px] py-1 font-mono text-[10px] text-dim hover:text-signal"
              >
                {c.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      <div
        className="mt-[26px] overflow-hidden rounded-2xl border border-line"
        style={{ background: "linear-gradient(135deg, var(--signal-dim), transparent)" }}
      >
        <div className="px-[18px] pb-4 pt-[18px]">
          <div className="mb-[10px] font-pixel text-[9px] tracking-[1px] text-signal">{statsLine(boot?.stats)}</div>
          <div className="text-[14px] font-medium leading-[1.5] text-ink">
            Every declassified record, mirrored offline. Read the file, then argue about it — anonymously or not.
          </div>
          <Link
            to="/archive"
            className="mt-[14px] inline-flex items-center gap-2 rounded-[11px] bg-signal px-4 py-[11px] font-mono text-[12px] font-bold tracking-[.5px] text-[#04140c] active:scale-[.97]"
          >
            BROWSE THE ARCHIVE →
          </Link>
        </div>
      </div>
    </div>
  );
}

export default Feed;
