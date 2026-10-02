// Image inspection tools for the Doc media panel, uapbrowser-style:
// brightness / contrast / saturation sliders, Enhance / Invert IR / B&W
// presets, and a zoom lens (LensLayer, shared with VideoTools). Pure CSS
// filters + a background-image lens, so no canvas (and no CORS dependency on
// the CDN).
import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";

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

export const chip = "rounded-[7px] border px-[9px] py-1 font-mono text-[10px] active:scale-[.96]";
export const on = "border-signal text-signal";
export const off = "border-line2 text-dim";

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
  const [open, setOpen] = useState(true);
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
          PRESETS.map((p) => {
            const active = adjustFilter(p.adj) === adjustFilter(adjust);
            return (
              <button
                key={p.label}
                type="button"
                aria-pressed={active}
                onClick={() => onAdjust(active ? DEFAULT_ADJUST : p.adj)}
                className={`${chip} ${active ? on : off}`}
              >
                {p.label}
              </button>
            );
          })}
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

export const LENS_PX = 170;
export const LENS_ZOOM = 3;

/** Where the pointer sits on an `object-contain` picture of natural size w×h filling `box`. */
export interface LensHit {
  x: number; // pointer, box px
  y: number;
  u: number; // pointer, 0–1 across the drawn picture
  v: number;
  rw: number; // drawn picture size, px
  rh: number;
  lift: number; // touch: raise the bubble clear of the finger
}

type PointerLike = { clientX: number; clientY: number; pointerType: string };

function hitAt(box: DOMRect, e: PointerLike, w: number, h: number): LensHit | null {
  const scale = Math.min(box.width / w, box.height / h);
  const rw = w * scale;
  const rh = h * scale;
  const x = e.clientX - box.left;
  const y = e.clientY - box.top;
  const u = (x - (box.width - rw) / 2) / rw;
  const v = (y - (box.height - rh) / 2) / rh;
  if (u < 0 || u > 1 || v < 0 || v > 1) return null;
  return { x, y, u, v, rw, rh, lift: e.pointerType === "touch" ? LENS_PX * 0.65 : 0 };
}

/**
 * Magnifier bubble over the media panel; `children` paints the zoomed view.
 * `clickThrough` (mouse): the layer ignores clicks so the media's own
 * controls / tap-to-open keep working, and tracks the pointer on the panel
 * underneath. Otherwise (touch) it covers the panel and captures drags.
 * The cursor hides while the bubble shows; `deadBottom` px at the bottom
 * (a video's control bar) get no lens.
 */
export function LensLayer({
  size,
  clickThrough,
  deadBottom = 0,
  children,
}: {
  size: () => { w: number; h: number } | null;
  clickThrough: boolean;
  deadBottom?: number;
  children: (hit: LensHit) => ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hit, setHit] = useState<LensHit | null>(null);

  function show(h: LensHit | null) {
    setHit(h);
    const panel = ref.current?.parentElement;
    if (panel) panel.toggleAttribute("data-lens-on", !!h);
  }
  function move(e: PointerLike) {
    const el = ref.current;
    const s = size();
    if (!el || !s) return show(null);
    const box = el.getBoundingClientRect();
    if (deadBottom && e.clientY - box.top > box.height - deadBottom) return show(null);
    show(hitAt(box, e, s.w, s.h));
  }
  const onPanelMove = useEffectEvent((e: PointerEvent) => move(e));
  const onPanelLeave = useEffectEvent(() => show(null));

  useEffect(() => {
    const panel = ref.current?.parentElement;
    if (!clickThrough || !panel) return;
    const m = (e: PointerEvent) => onPanelMove(e);
    const l = () => onPanelLeave();
    panel.addEventListener("pointermove", m);
    panel.addEventListener("pointerleave", l);
    return () => {
      panel.removeEventListener("pointermove", m);
      panel.removeEventListener("pointerleave", l);
      panel.removeAttribute("data-lens-on");
    };
  }, [clickThrough]);

  useEffect(() => () => ref.current?.parentElement?.removeAttribute("data-lens-on"), []);

  return (
    <div
      ref={ref}
      data-zoom-lens
      className="absolute inset-0"
      style={clickThrough ? { pointerEvents: "none" } : { touchAction: "none" }}
      onPointerDown={(e) => {
        e.stopPropagation();
        move(e);
      }}
      onPointerUp={(e) => e.stopPropagation()}
      onPointerMove={(e) => move(e)}
      onPointerLeave={() => show(null)}
    >
      {hit && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute overflow-hidden rounded-full bg-black shadow-[0_0_0_2px_rgba(255,255,255,.8),0_6px_24px_rgba(0,0,0,.6)]"
          style={{ width: LENS_PX, height: LENS_PX, left: hit.x - LENS_PX / 2, top: hit.y - LENS_PX / 2 - hit.lift }}
        >
          {children(hit)}
        </div>
      )}
    </div>
  );
}

/** Image lens: the full image as a zoomed background (no canvas, so no CORS dependency). */
export function ZoomLens({
  src,
  imgRef,
  filter,
  clickThrough,
}: {
  src: string;
  imgRef: RefObject<HTMLImageElement | null>;
  filter: string;
  clickThrough: boolean;
}) {
  return (
    <LensLayer
      clickThrough={clickThrough}
      size={() => {
        const img = imgRef.current;
        return img?.naturalWidth ? { w: img.naturalWidth, h: img.naturalHeight } : null;
      }}
    >
      {(h) => (
        // filter on an inner layer so it doesn't recolor the lens ring
        <div
          className="h-full w-full"
          style={{
            backgroundImage: `url("${src}")`,
            backgroundRepeat: "no-repeat",
            backgroundSize: `${h.rw * LENS_ZOOM}px ${h.rh * LENS_ZOOM}px`,
            backgroundPosition: `${LENS_PX / 2 - h.u * h.rw * LENS_ZOOM}px ${LENS_PX / 2 - h.v * h.rh * LENS_ZOOM}px`,
            filter: filter || undefined,
          }}
        />
      )}
    </LensLayer>
  );
}
