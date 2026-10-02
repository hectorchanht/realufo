// Image inspection tools for the Doc media panel, uapbrowser-style:
// brightness / contrast / saturation sliders, Enhance / Invert IR / B&W
// presets, and a zoom lens. Pure CSS filters + a background-image lens, so
// no canvas (and no CORS dependency on the CDN).
import { useState } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";

export interface ImageAdjust {
  brightness: number; // percent, 100 = unchanged
  contrast: number;
  saturate: number;
  invert: boolean;
  gray: boolean;
}

export const DEFAULT_ADJUST: ImageAdjust = { brightness: 100, contrast: 100, saturate: 100, invert: false, gray: false };

const PRESETS: { label: string; adj: ImageAdjust }[] = [
  { label: "Enhance", adj: { ...DEFAULT_ADJUST, brightness: 110, contrast: 140, saturate: 120 } },
  { label: "Invert IR", adj: { ...DEFAULT_ADJUST, invert: true } },
  { label: "B&W", adj: { ...DEFAULT_ADJUST, contrast: 120, gray: true } },
];

const SLIDERS: { key: "brightness" | "contrast" | "saturate"; label: string }[] = [
  { key: "brightness", label: "Brightness" },
  { key: "contrast", label: "Contrast" },
  { key: "saturate", label: "Saturation" },
];

/** CSS `filter` for an adjustment; "" when nothing is changed. */
export function adjustFilter(a: ImageAdjust): string {
  const f: string[] = [];
  if (a.brightness !== 100) f.push(`brightness(${a.brightness / 100})`);
  if (a.contrast !== 100) f.push(`contrast(${a.contrast / 100})`);
  if (a.saturate !== 100) f.push(`saturate(${a.saturate / 100})`);
  if (a.gray) f.push("grayscale(1)");
  if (a.invert) f.push("invert(1)");
  return f.join(" ");
}

const chip = "rounded-[7px] border px-[9px] py-1 font-mono text-[10px] active:scale-[.96]";
const on = "border-signal text-signal";
const off = "border-line2 text-dim";

export function ImageToolbar({
  adjust,
  onAdjust,
  lens,
  onLens,
}: {
  adjust: ImageAdjust;
  onAdjust: (a: ImageAdjust) => void;
  lens: boolean;
  onLens: (on: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const changed = adjustFilter(adjust) !== "";
  return (
    <div className="mb-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className={`${chip} ${open || changed ? on : off}`}>
          ◐ ADJUST
        </button>
        <button type="button" aria-pressed={lens} onClick={() => onLens(!lens)} className={`${chip} ${lens ? on : off}`}>
          ⌕ LENS
        </button>
        {open &&
          PRESETS.map((p) => (
            <button key={p.label} type="button" onClick={() => onAdjust(p.adj)} className={`${chip} ${off}`}>
              {p.label}
            </button>
          ))}
        {changed && (
          <button type="button" onClick={() => onAdjust(DEFAULT_ADJUST)} className={`${chip} ${off} ml-auto`}>
            ↺ Reset
          </button>
        )}
      </div>
      {open && (
        <div className="mt-3 grid gap-x-5 gap-y-2 rounded-xl border border-line bg-surface px-3.5 py-3 min-[600px]:grid-cols-3">
          {SLIDERS.map((s) => (
            <label key={s.key} className="flex items-center gap-2.5 font-mono text-[9.5px] tracking-[.4px] text-faint">
              <span className="w-[74px] flex-none uppercase">{s.label}</span>
              <input
                type="range"
                min={0}
                max={200}
                value={adjust[s.key]}
                onChange={(e) => onAdjust({ ...adjust, [s.key]: Number(e.target.value) })}
                className="min-w-0 flex-1 accent-[var(--signal)]"
              />
              <span className="w-8 flex-none text-right text-dim">{adjust[s.key]}%</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

const LENS_PX = 170;
const LENS_ZOOM = 3;

/**
 * Magnifier over an `object-contain` <img> filling the same box. Covers the
 * panel while on (so it also replaces tap-to-open and stops swipes).
 */
export function ZoomLens({ src, imgRef, filter }: { src: string; imgRef: RefObject<HTMLImageElement | null>; filter: string }) {
  const [pos, setPos] = useState<{ x: number; y: number; bg: string; size: string; lift: number } | null>(null);

  function track(e: ReactPointerEvent<HTMLDivElement>) {
    const img = imgRef.current;
    const box = e.currentTarget.getBoundingClientRect();
    if (!img?.naturalWidth) return setPos(null);
    // where object-contain actually drew the picture inside the box
    const scale = Math.min(box.width / img.naturalWidth, box.height / img.naturalHeight);
    const rw = img.naturalWidth * scale;
    const rh = img.naturalHeight * scale;
    const x = e.clientX - box.left;
    const y = e.clientY - box.top;
    const u = (x - (box.width - rw) / 2) / rw;
    const v = (y - (box.height - rh) / 2) / rh;
    if (u < 0 || u > 1 || v < 0 || v > 1) return setPos(null);
    setPos({
      x,
      y,
      size: `${rw * LENS_ZOOM}px ${rh * LENS_ZOOM}px`,
      bg: `${LENS_PX / 2 - u * rw * LENS_ZOOM}px ${LENS_PX / 2 - v * rh * LENS_ZOOM}px`,
      lift: e.pointerType === "touch" ? LENS_PX * 0.65 : 0, // keep it clear of the finger
    });
  }

  return (
    <div
      data-zoom-lens
      className="absolute inset-0 cursor-crosshair"
      style={{ touchAction: "none" }}
      onPointerDown={(e) => {
        e.stopPropagation();
        track(e);
      }}
      onPointerUp={(e) => e.stopPropagation()}
      onPointerMove={track}
      onPointerLeave={() => setPos(null)}
    >
      {pos && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute overflow-hidden rounded-full bg-black shadow-[0_0_0_2px_rgba(255,255,255,.8),0_6px_24px_rgba(0,0,0,.6)]"
          style={{ width: LENS_PX, height: LENS_PX, left: pos.x - LENS_PX / 2, top: pos.y - LENS_PX / 2 - pos.lift }}
        >
          {/* filter on an inner layer so it doesn't recolor the lens ring */}
          <div
            className="h-full w-full"
            style={{
              backgroundImage: `url("${src}")`,
              backgroundRepeat: "no-repeat",
              backgroundSize: pos.size,
              backgroundPosition: pos.bg,
              filter: filter || undefined,
            }}
          />
        </div>
      )}
    </div>
  );
}
