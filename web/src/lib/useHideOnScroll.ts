// Scroll-linked nav hide: a 0..1 progress (0 = fully shown, 1 = fully hidden)
// that tracks scroll *distance*, not a threshold toggle (Hector, 2026-10-08/14:
// hide gradually in proportion to scrolling). Scrolling down moves progress
// toward 1 over RANGE px of travel; scrolling up brings the bars back over
// the same distance; near the top they are always fully shown. AppShell
// feeds the progress to AppBar/BottomTab (mobile) and TopNav (desktop) as
// partial translateY transforms, and derives --bnav-y from it so sticky
// bottom bars follow the tab bar's visible height.
//
// scrollTop is clamped to [0, max] so iOS rubber-band overshoot at either
// end doesn't read as travel. Progress changes under STEP are accumulated
// against the last *reported* value (progressRef), not dropped, so slow
// scrolls still move the bars and React doesn't re-render on every pixel.
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

const TOP = 56; // always show navs within this many px of the top
const RANGE = 72; // px of scroll travel that moves progress 0 -> 1 (or back)
const STEP = 0.02; // don't re-render for progress changes smaller than this

export interface NavHide {
  /** 0 = navs fully shown, 1 = fully hidden; partial while scrolling. */
  progress: number;
  /** True once progress has (essentially) reached 1. */
  hidden: boolean;
}

export function useHideOnScroll(ref: RefObject<HTMLElement | null>, enabled: boolean, resetKey?: unknown): NavHide {
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(0);

  const apply = useCallback((p: number) => {
    const next = Math.min(1, Math.max(0, p));
    if (next !== 0 && next !== 1 && Math.abs(next - progressRef.current) < STEP) return;
    if (next === progressRef.current) return;
    progressRef.current = next;
    setProgress(next);
  }, []);

  // New route = new content: bring the navs back.
  useEffect(() => {
    progressRef.current = 0;
    setProgress(0);
  }, [resetKey]);

  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return;
    let last = el.scrollTop;
    const onScroll = () => {
      const max = el.scrollHeight - el.clientHeight;
      const y = Math.min(Math.max(el.scrollTop, 0), Math.max(max, 0));
      if (y < TOP) {
        apply(0);
      } else {
        apply(progressRef.current + (y - last) / RANGE);
      }
      last = y;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
    // resetKey: re-baseline `last` on a new route (its scroll was just restored)
  }, [ref, enabled, resetKey, apply]);

  return { progress: enabled ? progress : 0, hidden: enabled && progress >= 0.999 };
}
