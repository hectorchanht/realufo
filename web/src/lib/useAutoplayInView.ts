import { useEffect, useRef, type RefObject } from "react";

// Plays each <video> under `root` while ≥60% on screen, pauses it otherwise.
// Plays even under prefers-reduced-motion: Android reports that for "animation
// scale 0" (a common battery/speed tweak), which left clips frozen on phones.
export function useAutoplayInView(root: RefObject<HTMLElement | null>, deps: unknown[], onShow?: (v: HTMLVideoElement) => void) {
  const show = useRef(onShow);
  show.current = onShow;
  useEffect(() => {
    if (!root.current || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const v = e.target as HTMLVideoElement;
          if (e.isIntersecting) {
            v.play().catch(() => {});
            show.current?.(v);
          } else v.pause();
        }
      },
      { threshold: 0.6 }
    );
    root.current.querySelectorAll("video").forEach((v) => io.observe(v));
    return () => io.disconnect();
  }, deps);
}
