import { useEffect, useRef } from "react";

// Plays each <video> under `root` while ≥60% on screen, pauses it otherwise.
// `root` is the element itself (from a useState ref setter), so a container
// that mounts after the list is known still gets observed.
// Plays even under prefers-reduced-motion: Android reports that for "animation
// scale 0" (a common battery/speed tweak), which left clips frozen on phones.
// An unmuted play() without a tap on that element can be refused (iOS): fall
// back to muted rather than leave the poster frozen.
export function useAutoplayInView(root: HTMLElement | null, deps: unknown[], onShow?: (v: HTMLVideoElement) => void) {
  const show = useRef(onShow);
  show.current = onShow;
  useEffect(() => {
    if (!root || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const v = e.target as HTMLVideoElement;
          if (e.isIntersecting) {
            v.play().catch(() => {
              if (v.muted) return;
              v.muted = true;
              return v.play().catch(() => {});
            });
            show.current?.(v);
          } else v.pause();
        }
      },
      { threshold: 0.6 }
    );
    root.querySelectorAll("video").forEach((v) => io.observe(v));
    return () => io.disconnect();
  }, [root, ...deps]);
}
