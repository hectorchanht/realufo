// Media inspection tools for the Doc media panel (images and video),
// uapbrowser-style: brightness / contrast / saturation sliders, Enhance /
// Invert IR / B&W presets, thermal false-colour palettes, sharpen, rotate /
// flip, frame zoom, and a zoom lens (LensLayer, shared with VideoTools).
// CSS + SVG filters and a background-image lens for images, so no canvas
// (and no CORS dependency on the CDN).
import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { DEFAULT_VIEW, pointToUV } from "../lib/mediaView";
import type { MediaView } from "../lib/mediaView";

export type Palette = "none" | "ironbow" | "rainbow";

export interface ImageAdjust {
  brightness: number; // percent, 100 = unchanged
  contrast: number;
  saturate: number;
  invert: boolean;
  gray: boolean;
  palette: Palette; // false colour by luminance (SVG filter, see MediaFilters)
  sharpen: boolean;
}

export const DEFAULT_ADJUST: ImageAdjust = {
  brightness: 100,
  contrast: 100,
  saturate: 100,
  invert: false,
  gray: false,
  palette: "none",
  sharpen: false,
};

// Presets set the tone controls only; palette + sharpen stay as they are.
const PRESETS: { label: string; adj: Partial<ImageAdjust> }[] = [
  { label: "Enhance", adj: { brightness: 110, contrast: 140, saturate: 120 } },
  { label: "Invert IR", adj: { invert: true } },
  { label: "B&W", adj: { contrast: 120, gray: true } },
];
const TONE = { brightness: 100, contrast: 100, saturate: 100, invert: false, gray: false };

const PALETTES: { key: Exclude<Palette, "none">; label: string }[] = [
  { key: "ironbow", label: "Ironbow" },
  { key: "rainbow", label: "Rainbow" },
];

const SLIDERS: { key: "brightness" | "contrast" | "saturate"; label: string }[] = [
  { key: "brightness", label: "Brightness" },
  { key: "contrast", label: "Contrast" },
  { key: "saturate", label: "Saturation" },
];

export const LENS_MAGS = [2, 3, 5, 8];

/** CSS `filter` for an adjustment; "" when nothing is changed. */
export function adjustFilter(a: ImageAdjust): string {
  const f: string[] = [];
  if (a.brightness !== 100) f.push(`brightness(${a.brightness / 100})`);
  if (a.contrast !== 100) f.push(`contrast(${a.contrast / 100})`);
  if (a.saturate !== 100) f.push(`saturate(${a.saturate / 100})`);
  if (a.gray) f.push("grayscale(1)");
  if (a.invert) f.push("invert(1)");
  if (a.sharpen) f.push("url(#ru-sharpen)");
  if (a.palette !== "none") f.push(`url(#ru-${a.palette})`); // last: maps the final luminance
  return f.join(" ");
}

/** Luminance → colour ramp (evenly spaced stops per channel). */
function Ramp({ id, r, g, b }: { id: string; r: string; g: string; b: string }) {
  return (
    <filter id={id} colorInterpolationFilters="sRGB">
      <feColorMatrix type="matrix" values="0.2126 0.7152 0.0722 0 0  0.2126 0.7152 0.0722 0 0  0.2126 0.7152 0.0722 0 0  0 0 0 1 0" />
      <feComponentTransfer>
        <feFuncR type="table" tableValues={r} />
        <feFuncG type="table" tableValues={g} />
        <feFuncB type="table" tableValues={b} />
      </feComponentTransfer>
    </filter>
  );
}

/** SVG filter defs that adjustFilter's url(#ru-*) refers to. Render once per page. */
export function MediaFilters() {
  return (
    <svg aria-hidden="true" width="0" height="0" className="absolute">
      <filter id="ru-sharpen" colorInterpolationFilters="sRGB">
        <feConvolveMatrix order="3" kernelMatrix="0 -1 0 -1 5 -1 0 -1 0" preserveAlpha="true" />
      </filter>
      {/* thermal camera "ironbow": black → indigo → magenta → orange → yellow → white */}
      <Ramp id="ru-ironbow" r="0 0.15 0.55 0.85 0.98 1 1" g="0 0 0.02 0.2 0.5 0.8 1" b="0 0.45 0.6 0.25 0.05 0.2 1" />
      {/* "jet" rainbow: navy → blue → cyan → yellow → red → maroon */}
      <Ramp
        id="ru-rainbow"
        r="0 0 0 0 0.5 1 1 1 0.5"
        g="0 0 0.5 1 1 1 0.5 0 0"
        b="0.5 1 1 1 0.5 0 0 0 0"
      />
    </svg>
  );
}

export const chip = "rounded-[7px] border px-[9px] py-1 font-mono text-[10px] active:scale-[.96]";
export const on = "border-signal text-signal";
export const off = "border-line2 text-dim";

export function MediaToolbar({
  adjust,
  onAdjust,
  lens,
  onLens,
  mag,
  onMag,
  view,
  onView,
}: {
  adjust: ImageAdjust;
  onAdjust: (a: ImageAdjust) => void;
  lens: boolean;
  onLens: (on: boolean) => void;
  mag: number;
  onMag: (m: number) => void;
  view: MediaView;
  onView: (v: MediaView) => void;
}) {
  const [open, setOpen] = useState(true);
  const changed = adjustFilter(adjust) !== "";
  const nextMag = LENS_MAGS[(LENS_MAGS.indexOf(mag) + 1) % LENS_MAGS.length];
  return (
    <div className="mb-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className={`${chip} ${open || changed ? on : off}`}>
          ◐ ADJUST
        </button>
        <button type="button" aria-pressed={lens} onClick={() => onLens(!lens)} title="L" className={`${chip} ${lens ? on : off}`}>
          ⌕ LENS
        </button>
        {lens && (
          <button
            type="button"
            aria-label={`Lens magnification ${mag}×`}
            onClick={() => onMag(nextMag)}
            title="Shift+wheel or - / =  changes it"
            className={`${chip} ${on}`}
          >
            {mag}×
          </button>
        )}
        <button
          type="button"
          aria-label="Rotate 90°"
          title="R"
          onClick={() => onView({ ...DEFAULT_VIEW, flip: view.flip, rot: ((view.rot + 90) % 360) as MediaView["rot"] })}
          className={`${chip} ${view.rot ? on : off}`}
        >
          ⟳{view.rot ? ` ${view.rot}°` : ""}
        </button>
        <button
          type="button"
          aria-label="Flip"
          aria-pressed={view.flip}
          title="F"
          onClick={() => onView({ ...view, flip: !view.flip })}
          className={`${chip} ${view.flip ? on : off}`}
        >
          ⇋
        </button>
        {view.z > 1 && (
          <button type="button" aria-label="Reset zoom" title="0" onClick={() => onView({ ...view, z: 1, x: 0, y: 0 })} className={`${chip} ${on}`}>
            ⤢ {view.z.toFixed(1)}× ✕
          </button>
        )}
        {changed && (
          <button type="button" onClick={() => onAdjust(DEFAULT_ADJUST)} className={`${chip} ${off} ml-auto`}>
            ↺ Reset
          </button>
        )}
      </div>
      {open && (
        <div className="mt-3 rounded-xl border border-line bg-surface px-3.5 py-3">
          <div className="mb-2.5 flex flex-wrap items-center gap-2">
            {PRESETS.map((p) => {
              const preset = { ...adjust, ...TONE, ...p.adj };
              const active = adjustFilter(preset) === adjustFilter(adjust);
              return (
                <button
                  key={p.label}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onAdjust(active ? { ...adjust, ...TONE } : preset)}
                  className={`${chip} ${active ? on : off}`}
                >
                  {p.label}
                </button>
              );
            })}
            <span className="mx-1 h-4 w-px bg-line2" aria-hidden="true" />
            {PALETTES.map((p) => (
              <button
                key={p.key}
                type="button"
                aria-pressed={adjust.palette === p.key}
                onClick={() => onAdjust({ ...adjust, palette: adjust.palette === p.key ? "none" : p.key })}
                className={`${chip} ${adjust.palette === p.key ? on : off}`}
              >
                {p.label}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={adjust.sharpen}
              onClick={() => onAdjust({ ...adjust, sharpen: !adjust.sharpen })}
              className={`${chip} ${adjust.sharpen ? on : off}`}
            >
              Sharpen
            </button>
          </div>
          <div className="grid gap-x-5 gap-y-2 min-[600px]:grid-cols-3">
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
        </div>
      )}
    </div>
  );
}

export const LENS_PX = 170;

/** Where the pointer sits on the picture, for painting the lens. */
export interface LensHit {
  x: number; // pointer, box px
  y: number;
  u: number; // pointer, 0–1 across the picture's own axes
  v: number;
  rw: number; // picture's on-screen size along its own axes, px
  rh: number;
  lift: number; // touch: raise the bubble clear of the finger
  mag: number;
  rot: number;
  flip: boolean;
}

/** Rotate/flip a lens layer to match the panel view (around the bubble centre). */
export const lensTurn = (h: LensHit) => (h.rot || h.flip ? `rotate(${h.rot}deg)${h.flip ? " scaleX(-1)" : ""}` : undefined);

type PointerLike = { clientX: number; clientY: number; pointerType: string };

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
  view,
  mag,
  clickThrough,
  deadBottom = 0,
  children,
}: {
  size: () => { w: number; h: number } | null;
  view: MediaView;
  mag: number;
  clickThrough: boolean;
  deadBottom?: number;
  children: (hit: LensHit) => ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hit, setHit] = useState<LensHit | null>(null);
  const last = useRef<PointerLike | null>(null);

  function show(h: LensHit | null) {
    setHit(h);
    const panel = ref.current?.parentElement;
    if (panel) panel.toggleAttribute("data-lens-on", !!h);
  }
  function move(e: PointerLike | null) {
    last.current = e;
    const el = ref.current;
    const s = size();
    if (!e || !el || !s) return show(null);
    const box = el.getBoundingClientRect();
    const px = e.clientX - box.left;
    const py = e.clientY - box.top;
    if (deadBottom && py > box.height - deadBottom) return show(null);
    const p = pointToUV({ w: box.width, h: box.height }, px, py, s, view);
    if (p.u < 0 || p.u > 1 || p.v < 0 || p.v > 1) return show(null);
    show({ ...p, x: px, y: py, lift: e.pointerType === "touch" ? LENS_PX * 0.65 : 0, mag, rot: view.rot, flip: view.flip });
  }
  const onPanelMove = useEffectEvent((e: PointerEvent) => move(e));
  const onPanelLeave = useEffectEvent(() => move(null));
  // re-aim when the view (zoom/pan/rotate) or magnification changes under a still pointer
  const reaim = useEffectEvent(() => {
    if (last.current) move(last.current);
  });
  useEffect(() => {
    reaim();
  }, [view, mag]);

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
      onPointerLeave={() => move(null)}
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
  view,
  mag,
  clickThrough,
}: {
  src: string;
  imgRef: RefObject<HTMLImageElement | null>;
  filter: string;
  view: MediaView;
  mag: number;
  clickThrough: boolean;
}) {
  return (
    <LensLayer
      view={view}
      mag={mag}
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
            backgroundSize: `${h.rw * h.mag}px ${h.rh * h.mag}px`,
            backgroundPosition: `${LENS_PX / 2 - h.u * h.rw * h.mag}px ${LENS_PX / 2 - h.v * h.rh * h.mag}px`,
            filter: filter || undefined,
            transform: lensTurn(h),
          }}
        />
      )}
    </LensLayer>
  );
}
