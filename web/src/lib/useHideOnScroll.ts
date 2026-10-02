// Mobile nav auto-hide: true while the user scrolls DOWN a scroll container,
// false as soon as they scroll back up (or are near the top). Used by
// AppShell to slide the AppBar/BottomTab out of the way on mobile.
//
// scrollTop is clamped to [0, max] so iOS rubber-band overshoot at either end
// doesn't read as a direction change, and tiny jitters under DELTA are
// ignored (accumulated, not dropped, since `last` only moves on a decision).
import { useEffect, useState, type RefObject } from "react";

const TOP = 56; // always show navs within this many px of the top
const DELTA = 6;

export function useHideOnScroll(ref: RefObject<HTMLElement | null>, enabled: boolean, resetKey?: unknown): boolean {
  const [hidden, setHidden] = useState(false);

  // New route = new content: bring the navs back.
  useEffect(() => setHidden(false), [resetKey]);

  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return;
    let last = el.scrollTop;
    const onScroll = () => {
      const max = el.scrollHeight - el.clientHeight;
      const y = Math.min(Math.max(el.scrollTop, 0), Math.max(max, 0));
      if (y < TOP) {
        setHidden(false);
      } else if (Math.abs(y - last) < DELTA) {
        return;
      } else {
        setHidden(y > last);
      }
      last = y;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
    // resetKey: re-baseline `last` on a new route (its scroll was just restored)
  }, [ref, enabled, resetKey]);

  return enabled && hidden;
}
