// Board list row (Boards screen). Ported from
// realufo-handoff/RealUFO.dc.html lines 218-228: accent-tinted slug tile,
// name + slug, description, thread count + online count, trailing chevron.
//
// `board.slug` arrives from the API pre-wrapped in slashes (e.g. "/uap/" —
// see db/.seed.sql's `boards` inserts), which is exactly what the prototype
// displays verbatim in the tile/label. For the route target, the slashes are
// stripped so `/board/${slug}` resolves to a clean "/board/uap" instead of
// "/board//uap/" (react-router's `/board/:slug` route expects a single bare
// segment).
import { Link } from "react-router-dom";
import type { Board } from "../api/types";

export interface BoardRowProps {
  board: Board;
}

function slugPath(slug: string): string {
  return slug.replace(/^\/+|\/+$/g, "");
}

export function BoardRow({ board }: BoardRowProps) {
  return (
    <Link
      to={`/board/${slugPath(board.slug)}`}
      data-board-row
      className="flex items-center gap-[13px] rounded-[14px] border border-line bg-surface p-[14px] hover:border-line2 active:scale-[.99]"
    >
      <div
        className="grid h-11 w-11 flex-none place-items-center rounded-xl font-pixel text-[11px]"
        style={{ background: board.accent, color: "#04140c", boxShadow: `0 0 22px -6px ${board.accent}` }}
      >
        {board.slug}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-[15px] font-bold text-ink">{board.name}</span>
          <span className="font-mono text-[10px]" style={{ color: board.accent }}>
            {board.slug}
          </span>
        </div>
        <div className="mt-[3px] text-[12px] leading-[1.4] text-dim">{board.desc}</div>
        <div className="mt-[7px] flex gap-[14px] font-mono text-[9.5px] text-faint">
          <span>{(board.thread_count ?? 0).toLocaleString()} threads</span>
        </div>
      </div>
      <span aria-hidden="true" className="flex-none text-[18px] text-faint">
        ›
      </span>
    </Link>
  );
}

export default BoardRow;
