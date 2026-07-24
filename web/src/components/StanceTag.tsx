// Colored dot + label for a post/thread/comment's declared "stance". Ported
// from the `stanceC` map (realufo-handoff/RealUFO.dc.html line 584) and its
// use as the "● {{ stance }}" chip in the thread meta rows (lines 151/250)
// and the doc-comment author color (line 377's `c.stanceColor`).
//
// Colors use the Tailwind aliases from tailwind.config.ts (grn/amber/cyan/dim
// all resolve to the matching `var(--x)` token from theme.css), which is the
// same convention TopNav/AppBar/BottomTab already use for theme-driven color.
import type { Stance } from "../api/types";

type ResolvedStance = "believer" | "skeptic" | "analyst" | "neutral";

const STANCE_CLASS: Record<ResolvedStance, string> = {
  believer: "text-grn",
  skeptic: "text-amber",
  analyst: "text-cyan",
  neutral: "text-dim",
};

export interface StanceTagProps {
  stance: Stance;
  className?: string;
}

export function StanceTag({ stance, className = "" }: StanceTagProps) {
  const resolved: ResolvedStance =
    stance === "believer" || stance === "skeptic" || stance === "analyst" ? stance : "neutral";

  return (
    <span
      data-stance-tag
      className={`inline-flex items-center gap-1 font-mono text-[10px] font-semibold ${STANCE_CLASS[resolved]} ${className}`}
    >
      <span aria-hidden="true">●</span>
      {resolved}
    </span>
  );
}

export default StanceTag;
