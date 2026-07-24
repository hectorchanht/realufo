// Boards (board list) screen. Ported from realufo-handoff/RealUFO.dc.html
// lines 208-231 (the `showBoards` branch of `data-screenpad`): an anon-post
// CTA card + "✎ NEW" tile (opens the Composer in newThread mode for the
// default 'uap' board — line 215's `onClick="{{ onNewThread }}"`), followed
// by one `<BoardRow/>` per bootstrap board (line 218's `sc-for` over
// `boardsList`, `hint-placeholder-count="7"`).
//
// This component renders ONLY that screen content — AppShell (Task 14) owns
// the app frame, AppBar, and nav, and mounts this inside its `<Outlet/>`
// (itself inside `data-screenpad`); the router wires `/boards` -> Boards
// (router.tsx). BoardRow (Task 15) already renders the accent-tinted slug
// tile, name + slug, description, thread/online counts, and the `/board/:slug`
// link (with the API's slash-wrapped slug stripped for the route target) —
// nothing here re-implements any of that.
//
// Data: useBootstrap() for `boards`, defaulting to [] while the query hasn't
// resolved yet (or errored) so this never indexes into `undefined` (same
// convention as Feed.tsx/Archive.tsx). The CTA card + "NEW" tile are static
// markup that always renders (not gated on bootstrap), so the screen never
// looks structurally empty while boards are loading — only the board-row
// list itself swaps to a small "◉ loading signal…" line during the initial
// fetch (`isLoading`).
import { useBootstrap } from "../api/queries";
import { BoardRow } from "../components/BoardRow";
import { useOverlay } from "../overlays/OverlayProvider";

// Default board a fresh anon "NEW" thread lands in — prototype line 215
// wires `onNewThread` with no per-board context (it's from the board LIST
// screen, not inside a specific board), matching Doc.tsx's own
// `DEFAULT_BOARD` fallback for the same "no board picked yet" case.
const DEFAULT_BOARD = "uap";

export function Boards() {
  const { openComposer } = useOverlay();
  const { data: boot, isLoading } = useBootstrap();

  const boards = boot?.boards ?? [];

  function handleNewThread() {
    openComposer({ mode: "newThread", boardId: DEFAULT_BOARD });
  }

  return (
    <div data-screen="boards" className="animate-[fadeup_.35s_ease_both]">
      {/* anon-post CTA + "NEW" tile — prototype lines 210-216 */}
      <div className="mb-[18px] flex items-stretch gap-[10px]">
        <div className="flex-1 rounded-[14px] border border-line bg-surface px-[15px] py-[13px]">
          <div className="font-mono text-[10px] tracking-[.5px] text-faint">POST ANONYMOUSLY · NO ACCOUNT NEEDED</div>
          <div className="mt-1.5 text-[14px] font-semibold leading-[1.4] text-ink">
            Drop a file, a photo, a theory. Or just lurk.
          </div>
        </div>
        <button
          type="button"
          onClick={handleNewThread}
          className="flex w-16 flex-none flex-col items-center justify-center gap-1 rounded-[14px] bg-signal text-[#04140c] active:scale-[.95]"
        >
          <span aria-hidden="true" className="text-[22px]">
            ✎
          </span>
          <span className="font-mono text-[8px] font-bold">NEW</span>
        </button>
      </div>

      {/* board list — prototype lines 217-229 */}
      {isLoading ? (
        <div className="font-mono text-[11px] text-faint">◉ loading signal…</div>
      ) : (
        <div className="flex flex-col gap-[10px]">
          {boards.map((b) => (
            <BoardRow key={b.id} board={b} />
          ))}
        </div>
      )}
    </div>
  );
}

export default Boards;
