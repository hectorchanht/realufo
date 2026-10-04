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
import { useState } from "react";
import { Link } from "react-router-dom";
import type { ThreadCard } from "../api/types";
import { smallThumb } from "../lib/recordMedia";
import { VoteButton } from "./VoteButton";
import { StanceTag } from "./StanceTag";
import { dataInk } from "../lib/dataInk";

export interface ThreadRowProps {
  thread: ThreadCard;
  /** Override for "have I voted on this thread"; omit to use this browser's
   * stored vote (see VoteButton's file header). */
  voted?: boolean;
}

// Left slot = the thread's image (no slot when it has none or it fails to
// load); the vote pill sits at the bottom-right of the meta row.
export function ThreadRow({ thread, voted }: ThreadRowProps) {
  // 0 = try the 400px WebP sibling, 1 = it failed: full image, 2 = give up.
  const [imgFails, setImgFails] = useState(0);
  const small = thread.thumb ? smallThumb(thread.thumb) : null;
  const src = small && imgFails === 0 ? small : thread.thumb;
  const showImg = !!thread.thumb && imgFails < (small ? 2 : 1);
  const to = `/thread/${thread.id}`;
  return (
    <div
      data-thread-row
      className="flex gap-3 rounded-[14px] border border-line bg-surface px-[14px] py-[13px] hover:border-line2"
    >
      {showImg && (
        <Link to={to} tabIndex={-1} aria-hidden="true" className="flex-none">
          <img
            src={src!.replace(/ /g, "%20")}
            alt=""
            loading="lazy"
            onError={() => setImgFails((n) => n + 1)}
            className="block h-[72px] w-[72px] rounded-[10px] border border-line bg-bg2 object-cover"
            style={{ filter: "contrast(1.05) saturate(.92)" }}
          />
        </Link>
      )}
      <div className="min-w-0 flex-1">
        <Link to={to} className="block text-left">
          <div className="mb-1.5 flex flex-wrap items-center gap-[7px]">
            <span className="font-mono text-[9.5px] font-bold" style={{ color: dataInk(thread.accent) }}>
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
        </Link>
        <div className="mt-2 flex items-center gap-2">
          <Link to={to} className="flex min-w-0 flex-1 items-center gap-[14px] font-mono text-[10px] text-dim">
            <span>💬 {thread.reply_count}</span>
            <span>🖼 {thread.img_count}</span>
            <StanceTag stance={thread.stance} />
          </Link>
          <VoteButton row targetType="thread" targetId={thread.id} votes={thread.votes} voted={voted} />
        </div>
      </div>
    </div>
  );
}

export default ThreadRow;
