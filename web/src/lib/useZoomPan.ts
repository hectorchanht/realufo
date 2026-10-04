// Frame zoom + pan for the Doc media panel. Ctrl/⌘+wheel (also what a
// trackpad pinch sends) or a two-finger pinch zooms around the pointer;
// zoomBy (toolbar chips) zooms around the centre; a double tap/click zooms
// 2.5× there (or back out); a
// drag pans while zoomed; Shift+wheel goes to `onShiftWheel` (lens
// magnification). Native listeners so the wheel can be non-passive.
import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { clampView, zoomAt } from "./mediaView";
import type { MediaView } from "./mediaView";

type Size = { w: number; h: number };
type Pt = { x: number; y: number };

const DOUBLE_MS = 300;
const DOUBLE_PX = 30;
const DOUBLE_ZOOM = 2.5;

export function useZoomPan(
  panel: HTMLElement | null, // via a callback ref: the panel mounts after the loading state
  view: MediaView,
  setView: Dispatch<SetStateAction<MediaView>>,
  pic: Size | null,
  { deadBottom = 0, onShiftWheel }: { deadBottom?: number; onShiftWheel?: (dir: 1 | -1) => void },
) {
  const [box, setBox] = useState<Size | null>(null);
  // true once the current pointer sequence zoomed or panned, so the panel's
  // swipe-to-next-file and the click that ends a drag are skipped
  const gestured = useRef(false);

  useEffect(() => {
    const el = panel;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [panel]);

  const wheel = useEffectEvent((e: WheelEvent) => {
    const el = panel;
    if (!el || !pic) return;
    if (e.shiftKey && onShiftWheel) {
      e.preventDefault();
      onShiftWheel((e.deltaY || e.deltaX) < 0 ? 1 : -1);
      return;
    }
    if (!e.ctrlKey && !e.metaKey) return; // plain wheel scrolls the page
    e.preventDefault();
    const r = el.getBoundingClientRect();
    const b = { w: r.width, h: r.height };
    // trackpad pinches send small deltas; cap a mouse notch (~100) at ~1.35×
    const f = Math.exp(-Math.max(-30, Math.min(30, e.deltaY)) * 0.01);
    setView((v) => zoomAt(v, b, pic, f, e.clientX - r.left, e.clientY - r.top));
  });

  const pointers = useRef(new Map<number, Pt>());
  const start = useRef<{ v: MediaView; pts: Pt[] } | null>(null);
  const moved = useRef(false);
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
  /** Date.now() of the last double-tap zoom, so a delayed tap-to-open can stand down. */
  const doubleAt = useRef(0);

  function tapped(e: PointerEvent) {
    const el = panel;
    // controls inside the panel (prev/next, links, the touch lens) aren't picture taps
    if (!el || !pic || (e.target as Element).closest?.("a, input, [data-zoom-lens], button:not([data-tap-zoom])")) {
      lastTap.current = null;
      return;
    }
    const now = Date.now();
    const p = lastTap.current;
    if (!p || now - p.t > DOUBLE_MS || Math.hypot(e.clientX - p.x, e.clientY - p.y) > DOUBLE_PX) {
      lastTap.current = { t: now, x: e.clientX, y: e.clientY };
      return;
    }
    lastTap.current = null;
    doubleAt.current = now;
    gestured.current = true; // swallows this tap's click
    const r = el.getBoundingClientRect();
    const b = { w: r.width, h: r.height };
    setView((v) => (v.z > 1 ? { ...v, z: 1, x: 0, y: 0 } : zoomAt(v, b, pic, DOUBLE_ZOOM, e.clientX - r.left, e.clientY - r.top)));
  }

  const down = useEffectEvent((e: PointerEvent) => {
    const el = panel;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (pointers.current.size === 0) {
      gestured.current = false;
      moved.current = false;
    }
    if (deadBottom && e.clientY - r.top > r.height - deadBottom) return; // video control bar
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    start.current = { v: view, pts: [...pointers.current.values()] };
  });

  const move = useEffectEvent((e: PointerEvent) => {
    const el = panel;
    const s = start.current;
    if (!el || !s || !pic || !pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    const r = el.getBoundingClientRect();
    const b = { w: r.width, h: r.height };
    if (pts.length >= 2 && s.pts.length >= 2) {
      const d = (p: Pt[]) => Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      const mid = (p: Pt[]) => ({ x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 });
      const m0 = mid(s.pts);
      const m1 = mid(pts);
      const z = zoomAt(s.v, b, pic, d(pts) / d(s.pts), m0.x - r.left, m0.y - r.top);
      setView(clampView({ ...z, x: z.x + m1.x - m0.x, y: z.y + m1.y - m0.y }, b, pic));
      gestured.current = true;
      return;
    }
    if (s.v.z <= 1 || pts.length !== 1) return;
    const dx = pts[0].x - s.pts[0].x;
    const dy = pts[0].y - s.pts[0].y;
    if (!moved.current && Math.hypot(dx, dy) < 4) return; // still a tap
    if (!moved.current) {
      moved.current = true;
      el.setPointerCapture?.(e.pointerId); // only now, so plain taps still click their target
    }
    gestured.current = true;
    setView(clampView({ ...s.v, x: s.v.x + dx, y: s.v.y + dy }, b, pic));
  });

  const up = useEffectEvent((e: PointerEvent) => {
    const tap = pointers.current.size === 1 && pointers.current.has(e.pointerId) && !gestured.current && !moved.current;
    pointers.current.delete(e.pointerId);
    if (tap && e.type === "pointerup") tapped(e);
    start.current = pointers.current.size ? { v: view, pts: [...pointers.current.values()] } : null;
  });

  useEffect(() => {
    const el = panel;
    if (!el) return;
    const w = (e: WheelEvent) => wheel(e);
    const d = (e: PointerEvent) => down(e);
    const m = (e: PointerEvent) => move(e);
    const u = (e: PointerEvent) => up(e);
    // the click that ends a drag/pinch must not hit prev/next or tap-to-open
    const c = (e: MouseEvent) => {
      if (gestured.current) {
        e.stopPropagation();
        e.preventDefault();
      }
    };
    el.addEventListener("wheel", w, { passive: false });
    el.addEventListener("pointerdown", d);
    el.addEventListener("pointermove", m);
    el.addEventListener("pointerup", u);
    el.addEventListener("pointercancel", u);
    el.addEventListener("click", c, true);
    // a double click zooms the picture, not the video into native fullscreen
    const dc = (e: MouseEvent) => e.preventDefault();
    el.addEventListener("dblclick", dc, true);
    return () => {
      el.removeEventListener("wheel", w);
      el.removeEventListener("pointerdown", d);
      el.removeEventListener("pointermove", m);
      el.removeEventListener("pointerup", u);
      el.removeEventListener("pointercancel", u);
      el.removeEventListener("click", c, true);
      el.removeEventListener("dblclick", dc, true);
    };
  }, [panel]);

  /** Zoom by `f` around the panel centre (toolbar +/− chips). */
  function zoomBy(f: number) {
    const el = panel;
    if (!el || !pic) return;
    const r = el.getBoundingClientRect();
    setView((v) => zoomAt(v, { w: r.width, h: r.height }, pic, f, r.width / 2, r.height / 2));
  }

  return { box, gestured, zoomBy, doubleAt };
}
