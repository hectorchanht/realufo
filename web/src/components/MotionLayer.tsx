// Motion highlight for the Doc video panel: each new frame is compared with
// one ~0.1 s earlier; still areas go dim, changed pixels glow in the signal
// colour, so a small mover stands out from a still sky (and a camera pan
// lights up everything). Reads pixels, so the <video> must be same-origin:
// Doc swaps it to /api/file/<id> while this is on. Redraws whenever the
// frame changes: playing, frame-stepping or seeking.
import { useEffect, useRef } from "react";
import type { CSSProperties, RefObject } from "react";
import type { VideoCrop } from "../lib/recordMedia";

const MOTION_W = 480; // analysis width, px (enough to spot a dot, cheap per frame)
const LAG = 0.09; // s back to compare against: 3 frames at 30 fps (0.1 minus float slack)
const MAX_GAP = 0.6; // s: a frame further away is a seek, not motion
const FLOOR = 10; // luminance change (0–255) treated as sensor noise
const GAIN = 4;

const lum = (d: Uint8ClampedArray, i: number) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];

/** Motion map of `cur` vs `prev` (RGBA, same size) into `out`: 30% grey, blended to `rgb` by change. */
export function motionMap(cur: Uint8ClampedArray, prev: Uint8ClampedArray | null, out: Uint8ClampedArray, rgb: [number, number, number]) {
  for (let i = 0; i < cur.length; i += 4) {
    const l = lum(cur, i);
    const base = l * 0.3;
    const a = prev ? Math.min(1, (Math.max(0, Math.abs(l - lum(prev, i)) - FLOOR) * GAIN) / 255) : 0;
    out[i] = base + (rgb[0] - base) * a;
    out[i + 1] = base + (rgb[1] - base) * a;
    out[i + 2] = base + (rgb[2] - base) * a;
    out[i + 3] = 255;
  }
}

function signalRgb(el: Element): [number, number, number] {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(getComputedStyle(el).getPropertyValue("--signal").trim());
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [77, 240, 166];
}

export function MotionLayer({ videoRef, crop, style }: { videoRef: RefObject<HTMLVideoElement | null>; crop: VideoCrop | null; style?: CSSProperties }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const v = videoRef.current;
    const out = ref.current;
    const work = document.createElement("canvas");
    const wctx = work.getContext("2d", { willReadFrequently: true });
    const octx = out?.getContext("2d");
    if (!v || !out || !wctx || !octx) return;
    const rgb = signalRgb(out);
    let frames: { t: number; d: Uint8ClampedArray }[] = [];
    let lastT = -1;
    let raf = 0;

    function draw() {
      const src = crop ?? { x: 0, y: 0, w: v!.videoWidth, h: v!.videoHeight };
      if (!src.w || v!.readyState < 2) return;
      const s = Math.min(1, MOTION_W / src.w);
      const w = Math.round(src.w * s);
      const h = Math.round(src.h * s);
      if (work.width !== w || work.height !== h) {
        work.width = out!.width = w;
        work.height = out!.height = h;
        frames = [];
      }
      wctx!.drawImage(v!, src.x, src.y, src.w, src.h, 0, 0, w, h);
      let cur: Uint8ClampedArray;
      try {
        cur = wctx!.getImageData(0, 0, w, h).data;
      } catch {
        return; // still the cross-origin source (swap in progress): unreadable
      }
      const t = v!.currentTime;
      frames = frames.filter((f) => Math.abs(t - f.t) < MAX_GAP);
      const prev = frames.findLast((f) => Math.abs(t - f.t) >= LAG);
      const img = octx!.createImageData(w, h);
      motionMap(cur, prev?.d ?? null, img.data, rgb);
      octx!.putImageData(img, 0, 0);
      frames.push({ t, d: cur });
      if (frames.length > 12) frames.shift();
    }

    // ponytail: polls currentTime per animation frame; requestVideoFrameCallback if exact frame timing matters
    const tick = () => {
      if (v.currentTime !== lastT) {
        lastT = v.currentTime;
        draw();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const redraw = () => {
      lastT = -1; // new source / seek: draw even at the same time
    };
    v.addEventListener("loadeddata", redraw);
    v.addEventListener("seeked", redraw);
    return () => {
      cancelAnimationFrame(raf);
      v.removeEventListener("loadeddata", redraw);
      v.removeEventListener("seeked", redraw);
    };
  }, [videoRef, crop]);

  return <canvas ref={ref} data-motion aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full object-contain" style={style} />;
}
