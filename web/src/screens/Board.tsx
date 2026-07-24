// Board (single board) screen. Ported from realufo-handoff/RealUFO.dc.html
// lines 233-256 (the `curBoard` branch of `data-screenpad`): a board header
// card (accent slug tile, name, "{threads} threads · {desc}", a full-width
// "✎ START A NEW THREAD" button) followed by the board's `<ThreadRow/>` list
// (line 243's `sc-for` over `boardThreads`).
//
// This component renders ONLY that screen content — AppShell (Task 14) owns
// the app frame, AppBar, and nav, and mounts this inside its `<Outlet/>`
// (itself inside `data-screenpad`); the router wires `/board/:slug` -> Board
// (router.tsx). ThreadRow (Task 15) already renders the vote pillar, board
// slug/No./HOT badge/ago, title, op-body preview, and the `/thread/:id` link
// — nothing here re-implements any of that.
//
// slug -> board resolution: the route param is a BARE slug (e.g. "uap" —
// react-router's `/board/:slug` segment can't itself contain a literal `/`),
// while the API's `Board.slug` column is slash-WRAPPED (e.g. "/uap/" — see
// db/.seed.sql's `boards` inserts, and BoardRow.tsx's own file-header note on
// the same asymmetry). Both sides are normalized by stripping leading/
// trailing slashes before comparing, so this resolves correctly regardless
// of whether the route param ever gains/loses a slash of its own. Matching
// is done on `slug`, NOT `id` — the two are unrelated fields (a board's `id`
// is an opaque primary key, e.g. a uuid in production data), so board.id is
// only ever used AFTER resolution (as the useBoardThreads query key / the
// Composer's `boardId`), never as a shortcut for the route param itself.
//
// Loading/not-found: while bootstrap hasn't resolved yet, `board` is
// undefined the same way an unmatched slug leaves it undefined — the first
// case renders a "loading signal" line, the second (bootstrap settled, no
// match) renders a "board not found" line; neither ever indexes into
// `undefined`. `useBoardThreads` is always called (with the resolved board's
// id, or "" until resolved — its `enabled: !!boardId` guard skips the fetch)
// so hook-call order never varies between renders (rules-of-hooks).
import { useParams } from "react-router-dom";
import { useBoardThreads, useBootstrap } from "../api/queries";
import { ThreadRow } from "../components/ThreadRow";
import { useOverlay } from "../overlays/OverlayProvider";
import { useSetPageTitle } from "../lib/pageTitle";

function stripSlashes(s: string): string {
  return s.replace(/^\/+|\/+$/g, "");
}

export function Board() {
  const { slug = "" } = useParams();
  const { openComposer } = useOverlay();

  const { data: boot, isLoading: bootLoading } = useBootstrap();
  const board = boot?.boards.find((b) => stripSlashes(b.slug) === stripSlashes(slug));

  const { data: threadsData, isLoading: threadsLoading } = useBoardThreads(board?.id ?? "");
  const threads = threadsData?.threads ?? [];

  // AppBar title — prototype's board branch (RealUFO.dc.html:570): called
  // unconditionally (before the loading/not-found returns below) so hook
  // order never varies; the "BOARD" fallback matches the old path-based
  // default while `board` hasn't resolved yet.
  useSetPageTitle(board?.slug || "BOARD", board?.desc || "");

  function handleNewThread() {
    if (!board) return;
    openComposer({ mode: "newThread", boardId: board.id });
  }

  if (bootLoading) {
    return (
      <div data-screen="board" className="font-mono text-[11px] text-faint">
        ◉ loading signal…
      </div>
    );
  }

  if (!board) {
    return (
      <div data-screen="board" className="px-5 py-[60px] text-center font-mono text-[12px] text-faint">
        board not found.
      </div>
    );
  }

  return (
    <div data-screen="board" className="animate-[fadeup_.3s_ease_both]">
      {/* board header card — prototype lines 235-241 */}
      <div
        className="mb-4 rounded-2xl border border-line px-[17px] py-4"
        style={{ background: "linear-gradient(135deg, var(--surface), transparent)" }}
      >
        <div className="flex items-center gap-[11px]">
          <div
            className="grid h-10 w-10 flex-none place-items-center rounded-[11px] font-pixel text-[9px]"
            style={{ background: board.accent, color: "#04140c" }}
          >
            {board.slug}
          </div>
          <div>
            <div className="text-[17px] font-bold text-ink">{board.name}</div>
            <div className="mt-[3px] font-mono text-[10px] text-faint">
              {(board.thread_count ?? 0).toLocaleString()} threads · {board.desc}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={handleNewThread}
          className="mt-[13px] w-full rounded-[11px] border py-2.5 font-mono text-xs font-bold tracking-[.5px] active:scale-[.98]"
          style={{ borderColor: board.accent, color: board.accent }}
        >
          ✎ START A NEW THREAD
        </button>
      </div>

      {/* thread list — prototype lines 243-253 */}
      {threadsLoading ? (
        <div className="font-mono text-[11px] text-faint">◉ loading signal…</div>
      ) : (
        <div className="flex flex-col gap-[10px]">
          {threads.map((t) => (
            <ThreadRow key={t.id} thread={t} />
          ))}
          {threads.length === 0 && (
            <div className="px-5 py-[40px] text-center font-mono text-[12px] text-faint">
              no threads yet — be the first.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Board;
