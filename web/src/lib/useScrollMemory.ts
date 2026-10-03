// Remembers the scroll position of every URL shown in the shell's scroll
// container (session memory, gone on reload) and puts it back when that URL
// shows again — tab switches and back/forward land where the user left off.
// Content may still be growing (query data arriving), so the restore retries
// as the content resizes until it reaches the target, the user touches the
// page, or RESTORE_MS passes. Positions aren't saved while restoring, so a
// half-loaded page's clamped scrollTop never overwrites the real one.
import { useLayoutEffect, type RefObject } from "react";
import { TOOL_PARAMS } from "../components/ImageTools";

const saved = new Map<string, number>();
const RESTORE_MS = 1500;

/** Scroll-memory key for a URL: media-tool params (?br=, ?lens=, …) only restyle
 * the file page, so they must not count as a new page. */
export function scrollKey(pathname: string, search: string): string {
  const sp = new URLSearchParams(search);
  for (const k of TOOL_PARAMS) sp.delete(k);
  const qs = sp.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/** Forget a URL's scroll so it next opens at the top (tab re-tap). */
export function forgetScroll(key: string): void {
  saved.delete(key);
}

export function useScrollMemory(ref: RefObject<HTMLElement | null>, key: string): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const target = saved.get(key) ?? 0;
    let restoring = true;
    let ro: ResizeObserver | undefined;
    const stop = () => {
      restoring = false;
      ro?.disconnect();
      clearTimeout(timer);
    };
    const apply = () => {
      el.scrollTop = target;
      if (Math.abs(el.scrollTop - target) < 2) stop();
    };
    const onScroll = () => {
      if (!restoring) saved.set(key, el.scrollTop);
    };
    const timer = setTimeout(stop, RESTORE_MS);
    apply();
    if (restoring && typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(apply);
      for (const child of el.children) ro.observe(child);
    }
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("touchstart", stop, { passive: true });
    el.addEventListener("wheel", stop, { passive: true });
    return () => {
      stop();
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("touchstart", stop);
      el.removeEventListener("wheel", stop);
    };
  }, [ref, key]);
}
