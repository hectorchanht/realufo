// Feed screen. Ported from realufo-handoff/RealUFO.dc.html lines 112-164
// (the `showFeed` branch of `data-screenpad`): LIVE ticker, "◆ Hot right now"
// DocCard grid, "◆ Trending threads" ThreadRow list + "all boards ›", and the
// "91,808 FILES · 15 ARCHIVES" archive CTA card.
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
// screen never looks structurally empty), but the grid/list bodies swap to a
// small "◉ loading signal…" line while `useFeed()`'s *initial* fetch is still
// in flight (`isLoading` — true only before the first settle, so a failed
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
import { useBootstrap, useFeed } from "../api/queries";
import { DocCard } from "../components/DocCard";
import { ThreadRow } from "../components/ThreadRow";
import { Ticker } from "../components/Ticker";
import { useSetPageTitle } from "../lib/pageTitle";

// Prototype line 159's literal copy — used until bootstrap's `stats` resolve.
const FALLBACK_STATS_LINE = "◆ 91,808 FILES · 15 ARCHIVES";

function statsLine(stats?: { records: number; archives: number }): string {
  if (!stats) return FALLBACK_STATS_LINE;
  return `◆ ${stats.records.toLocaleString()} FILES · ${stats.archives.toLocaleString()} ARCHIVES`;
}

export function Feed() {
  // AppBar title — prototype's `titles.feed` (RealUFO.dc.html:566).
  useSetPageTitle("REALUFO", "Declassified UAP archive + forum");

  const { data: boot } = useBootstrap();
  const { data: feed, isLoading: feedLoading } = useFeed();

  const ticker = boot?.ticker ?? [];
  const featured = feed?.featured ?? [];
  const hot = feed?.hot ?? [];

  return (
    <div data-screen="feed" className="animate-[fadeup_.4s_ease_both]">
      <Ticker items={ticker} />

      <div className="mx-0.5 mb-3 font-pixel text-[9px] uppercase tracking-[1px] text-faint">◆ Hot right now</div>
      {feedLoading ? (
        <div className="mb-[26px] font-mono text-[11px] text-faint">◉ loading signal…</div>
      ) : (
        <div
          data-grid
          className="mb-[26px] grid grid-cols-2 gap-3 min-[900px]:grid-cols-[repeat(auto-fill,minmax(210px,1fr))]"
        >
          {featured.map((record) => (
            <DocCard key={record.id} record={record} variant="feed" />
          ))}
        </div>
      )}

      <div className="mx-0.5 mb-3 flex items-baseline justify-between">
        <div className="font-pixel text-[9px] uppercase tracking-[1px] text-faint">◆ Trending threads</div>
        <Link to="/boards" className="font-mono text-[11px] text-signal">
          all boards ›
        </Link>
      </div>
      {feedLoading ? (
        <div className="font-mono text-[11px] text-faint">◉ loading signal…</div>
      ) : (
        <div className="flex flex-col gap-[10px]">
          {hot.map((thread) => (
            <ThreadRow key={thread.id} thread={thread} />
          ))}
        </div>
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
