// The "▲ N" vote pillar shared by ThreadRow (board/feed thread rows, prototype
// lines 143/245) and any future post/comment vote control (doc-comment vote,
// line 380). Colors/logic port `voteBg`/`voteBorder`/`voteColor` exactly
// (lines 586-588 of realufo-handoff/RealUFO.dc.html):
//   voted:  border/background var(--signal), text #04140c (dark-on-signal)
//   unvoted: border var(--line2), background transparent, text var(--dim)
//
// `useVote()` does the *authoritative* optimistic cache patch and records the
// vote in a localStorage map; `isVotedLocally` reads that map, so it is the
// truth for "voted" across re-renders and reloads. The local overlay only
// bridges the gap until the cache patch lands (it is dropped when `votes`
// changes), so the pillar flips instantly on tap.
import { useEffect, useState } from "react";
import { ApiError } from "../api/client";
import { isVotedLocally, useVote } from "../api/queries";
import { useOverlay } from "../overlays/OverlayProvider";
import type { VoteTargetType } from "../api/types";

export interface VoteButtonProps {
  targetType: VoteTargetType;
  targetId: string;
  votes: number;
  voted?: boolean;
}

export function VoteButton({ targetType, targetId, votes, voted }: VoteButtonProps) {
  const vote = useVote();
  const { toast } = useOverlay();
  const [overlay, setOverlay] = useState<{ voted: boolean; votes: number } | null>(null);

  // Props caught up with our optimistic guess (parent re-rendered from the
  // query cache) -> drop the local overlay and trust props again.
  useEffect(() => {
    setOverlay(null);
  }, [voted, votes]);

  const baseVoted = voted ?? isVotedLocally(targetType, targetId);
  const isVoted = overlay?.voted ?? baseVoted;
  const displayVotes = overlay?.votes ?? votes;

  function handleClick() {
    const nextVoted = !isVoted;
    setOverlay({ voted: nextVoted, votes: displayVotes + (nextVoted ? 1 : -1) });
    navigator.vibrate?.(5);
    vote.mutate(
      { target_type: targetType, target_id: targetId },
      {
        onError: (err) =>
          toast(
            err instanceof ApiError && err.status === 429
              ? "slow down — too many votes"
              : "Vote didn't go through — try again",
          ),
      },
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={isVoted}
      aria-label={`vote (${displayVotes})`}
      data-vote-button
      className="flex min-h-[44px] min-w-[46px] flex-none flex-col items-center justify-center gap-0.5 rounded-[10px] border px-2 py-0.5 active:scale-[.93]"
      style={{
        borderColor: isVoted ? "var(--signal)" : "var(--line2)",
        background: isVoted ? "var(--signal)" : "transparent",
        color: isVoted ? "#04140c" : "var(--dim)",
      }}
    >
      <span className="text-[13px] leading-none">▲</span>
      <span className="font-mono text-[11px] font-bold">{displayVotes}</span>
    </button>
  );
}

export default VoteButton;
