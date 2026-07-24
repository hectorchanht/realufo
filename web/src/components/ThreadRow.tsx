// Board-thread row. Reconciles the prototype's two near-identical thread-row
// markups into one component (both consume the same `ThreadCard` shape from
// the API — see FRONTEND-CONTEXT.md: /api/feed's `hot[]` and
// /api/boards/:id/threads's `threads[]` are both ThreadCard[]):
//   Feed variant  -> realufo-handoff/RealUFO.dc.html lines 141-154 (Trending
//                    threads on the Feed screen): shows the board slug, no
//                    thread number, title clamped to 2 lines, no op preview.
//   Board variant -> lines 243-253 (inside a single board's thread list):
//                    shows "No.<n>", no board slug (redundant inside a
//                    board), title NOT clamped, PLUS a 2-line op-body preview.
//
// Unified superset rendered every time (no variant prop needed): board slug,
// "No.<n>", the 🔥 HOT badge, "<ago> ago", a 2-line-clamped title, AND a
// 2-line-clamped op-body preview. `ThreadCard.op_body` is populated by both
// source endpoints, so nothing needs to be omitted for the Feed case.
import { Link } from "react-router-dom";
import type { ThreadCard } from "../api/types";
import { VoteButton } from "./VoteButton";
import { StanceTag } from "./StanceTag";

export interface ThreadRowProps {
  thread: ThreadCard;
  /** "Have I voted on this thread" — no source of truth lives on ThreadCard
   * itself (see VoteButton's file header); defaults to false until a screen
   * wires in the client-side voted-map lookup. */
  voted?: boolean;
}

export function ThreadRow({ thread, voted = false }: ThreadRowProps) {
  return (
    <div
      data-thread-row
      className="flex gap-3 rounded-[14px] border border-line bg-surface px-[14px] py-[13px] hover:border-line2"
    >
      <VoteButton targetType="thread" targetId={thread.id} votes={thread.votes} voted={voted} />
      <Link to={`/thread/${thread.id}`} className="min-w-0 flex-1 text-left">
        <div className="mb-1.5 flex flex-wrap items-center gap-[7px]">
          <span className="font-mono text-[9.5px] font-bold" style={{ color: thread.accent }}>
            {thread.boardSlug}
          </span>
          <span className="font-mono text-[8.5px] text-faint">No.{thread.no}</span>
          {!!thread.hot && <span className="font-mono text-[8.5px] font-bold text-amber">🔥 HOT</span>}
          <span className="font-mono text-[9px] text-faint">{thread.ago} ago</span>
        </div>
        <div className="line-clamp-2 text-[13.5px] font-semibold leading-[1.32] text-ink">{thread.title}</div>
        {thread.op_body && (
          <div className="mt-[5px] line-clamp-2 text-[11.5px] leading-[1.45] text-dim">{thread.op_body}</div>
        )}
        <div className="mt-2 flex items-center gap-[14px] font-mono text-[10px] text-dim">
          <span>💬 {thread.reply_count}</span>
          <span>🖼 {thread.img_count}</span>
          <StanceTag stance={thread.stance} />
        </div>
      </Link>
    </div>
  );
}

export default ThreadRow;
