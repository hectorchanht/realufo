// Media inspection tools for the Doc media panel (images and video),
// uapbrowser-style: brightness / contrast / saturation sliders, Enhance /
// Invert IR / B&W presets, thermal false-colour palettes, sharpen, rotate /
// flip, frame zoom, and a zoom lens (LensLayer, shared with VideoTools).
// CSS + SVG filters and a background-image lens for images, so no canvas
// (and no CORS dependency on the CDN).
import { useEffect, useEffectEvent, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ReactNode, RefObject } from "react";
import { Contrast, DropletOff, Eye, Droplet, Flame, FlipHorizontal2, Focus, Keyboard, Link, Rainbow, RotateCcw, RotateCw, Search, Shrink, SlidersHorizontal, Sun, SunMoon, WandSparkles, X, ZoomIn, ZoomOut } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { DEFAULT_VIEW, MAX_ZOOM, pointToUV } from "../lib/mediaView";
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

// URL form of an adjustment (Doc keeps it in the query so it carries to the
// next file and survives a share): only non-defaults are written.
const ADJUST_PARAMS = ["br", "ct", "sat", "inv", "bw", "pal", "sharp"];
/** Every media-tool query param (adjust + lens), for carrying them onto other links. */
export const TOOL_PARAMS = [...ADJUST_PARAMS, "lens", "mag"];

/** Parse an adjustment off the URL; bad values fall back to the default. */
export function adjustFromParams(sp: URLSearchParams): ImageAdjust {
  const pct = (k: string) => {
    const s = sp.get(k);
    const n = Number(s);
    return s && Number.isFinite(n) ? Math.min(200, Math.max(0, Math.round(n))) : 100;
  };
  const pal = sp.get("pal");
  return {
    brightness: pct("br"),
    contrast: pct("ct"),
    saturate: pct("sat"),
    invert: sp.get("inv") === "1",
    gray: sp.get("bw") === "1",
    palette: pal === "ironbow" || pal === "rainbow" ? pal : "none",
    sharpen: sp.get("sharp") === "1",
  };
}

/** Write an adjustment into `sp` (in place). */
export function adjustToParams(sp: URLSearchParams, a: ImageAdjust) {
  for (const k of ADJUST_PARAMS) sp.delete(k);
  if (a.brightness !== 100) sp.set("br", String(a.brightness));
  if (a.contrast !== 100) sp.set("ct", String(a.contrast));
  if (a.saturate !== 100) sp.set("sat", String(a.saturate));
  if (a.invert) sp.set("inv", "1");
  if (a.gray) sp.set("bw", "1");
  if (a.palette !== "none") sp.set("pal", a.palette);
  if (a.sharpen) sp.set("sharp", "1");
}

// Presets set the tone controls only; palette + sharpen stay as they are.
const PRESETS: { label: string; Icon: LucideIcon; adj: Partial<ImageAdjust> }[] = [
  { label: "Enhance", Icon: WandSparkles, adj: { brightness: 110, contrast: 140, saturate: 120 } },
  { label: "Invert IR", Icon: SunMoon, adj: { invert: true } },
  { label: "B&W", Icon: DropletOff, adj: { contrast: 120, gray: true } },
];
const TONE = { brightness: 100, contrast: 100, saturate: 100, invert: false, gray: false };

const PALETTES: { key: Exclude<Palette, "none">; label: string; Icon: LucideIcon }[] = [
  { key: "ironbow", label: "Ironbow", Icon: Flame },
  { key: "rainbow", label: "Rainbow", Icon: Rainbow },
];

const SLIDERS: { key: "brightness" | "contrast" | "saturate"; label: string; Icon: LucideIcon }[] = [
  { key: "brightness", label: "Brightness", Icon: Sun },
  { key: "contrast", label: "Contrast", Icon: Contrast },
  { key: "saturate", label: "Saturation", Icon: Droplet },
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

export const chip = "inline-flex items-center gap-1 rounded-[7px] border px-[9px] py-1 font-mono text-[10px] active:scale-[.96]";
/** Lucide icon size/stroke for chips. */
export const ico = { size: 14, strokeWidth: 1.75, "aria-hidden": true } as const;
export const on = "border-signal text-signal";
export const off = "border-line2 text-dim";

/** Keyboard chip: hover shows the shortcut list; click pins it open (outside click / Esc closes). */
function ShortcutsTip({ help }: { help: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <span ref={ref} className="group relative">
      <button
        type="button"
        aria-label="Keyboard shortcuts"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className={`${chip} ${open ? on : off}`}
      >
        <Keyboard {...ico} />
      </button>
      {/* pt (not mt) keeps the gap inside the hover area, so the pointer can travel into the list */}
      <div id={id} role="tooltip" className={`absolute left-0 top-full z-30 pt-1.5 ${open ? "block" : "hidden group-hover:block group-focus-within:block"}`}>
        <ul className="w-max max-w-[300px] rounded-lg border border-line2 bg-bg2 px-3 py-2 font-mono text-[10px] leading-[1.75] text-dim shadow-[0_6px_24px_rgba(0,0,0,.45)]">
          {help
            .split(/\n| · /)
            .filter(Boolean)
            .map((line) => (
              <li key={line}>{line}</li>
            ))}
        </ul>
      </div>
    </span>
  );
}

const ADJUST_OPEN_KEY = "ru:adjust-open";

export function MediaToolbar({
  adjust,
  onAdjust,
  lens,
  onLens,
  mag,
  onMag,
  view,
  onView,
  onZoom,
  onLink,
  compare,
  onCompare,
  keysHelp,
  panelSlot,
}: {
  adjust: ImageAdjust;
  onAdjust: (a: ImageAdjust) => void;
  lens: boolean;
  onLens: (on: boolean) => void;
  mag: number;
  onMag: (m: number) => void;
  view: MediaView;
  onView: (v: MediaView) => void;
  /** Frame zoom by a factor around the panel centre. */
  onZoom: (f: number) => void;
  /** Copy a link to this view (images; video has its own moment link). */
  onLink?: () => void;
  /** Hold-to-compare: true while the unfiltered picture shows. */
  compare: boolean;
  onCompare: (on: boolean) => void;
  /** Keyboard/mouse shortcuts, shown as a hover tooltip. */
  keysHelp?: string;
  /** Top row of the Adjust panel, for controls another component portals in (video speed/loop). */
  panelSlot?: (el: HTMLDivElement | null) => void;
}) {
  // Closed by default; once a visitor opens it, it stays open on later pages.
  const [open, setOpenState] = useState(() => {
    try {
      return localStorage.getItem(ADJUST_OPEN_KEY) === "1";
    } catch {
      return false;
    }
  });
  function setOpen(next: boolean) {
    setOpenState(next);
    try {
      localStorage.setItem(ADJUST_OPEN_KEY, next ? "1" : "0");
    } catch {
      /* private mode etc.: the choice lasts for this page only */
    }
  }
  const changed = adjustFilter(adjust) !== "";
  const nextMag = LENS_MAGS[(LENS_MAGS.indexOf(mag) + 1) % LENS_MAGS.length];
  return (
    <div className="mb-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-label="Adjust"
          aria-expanded={open}
          title="Adjust"
          onClick={() => setOpen(!open)}
          className={`${chip} ${open || changed ? on : off}`}
        >
          <SlidersHorizontal {...ico} />
        </button>
        <button type="button" aria-label="Lens" aria-pressed={lens} onClick={() => onLens(!lens)} title="Lens (L)" className={`${chip} ${lens ? on : off}`}>
          <Search {...ico} />
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
        <button type="button" aria-label="Zoom out" title="Zoom out" disabled={view.z <= 1} onClick={() => onZoom(1 / 1.5)} className={`${chip} ${off} disabled:opacity-40`}>
          <ZoomOut {...ico} />
        </button>
        <button type="button" aria-label="Zoom in" title="Zoom in" disabled={view.z >= MAX_ZOOM} onClick={() => onZoom(1.5)} className={`${chip} ${off} disabled:opacity-40`}>
          <ZoomIn {...ico} />
        </button>
        <button
          type="button"
          aria-label="Rotate 90°"
          title="Rotate 90° (R)"
          onClick={() => onView({ ...DEFAULT_VIEW, flip: view.flip, rot: ((view.rot + 90) % 360) as MediaView["rot"] })}
          className={`${chip} ${view.rot ? on : off}`}
        >
          <RotateCw {...ico} />
          {view.rot ? `${view.rot}°` : ""}
        </button>
        <button
          type="button"
          aria-label="Flip"
          aria-pressed={view.flip}
          title="Flip (F)"
          onClick={() => onView({ ...view, flip: !view.flip })}
          className={`${chip} ${view.flip ? on : off}`}
        >
          <FlipHorizontal2 {...ico} />
        </button>
        {view.z > 1 && (
          <button type="button" aria-label="Reset zoom" title="Reset zoom (0)" onClick={() => onView({ ...view, z: 1, x: 0, y: 0 })} className={`${chip} ${on}`}>
            <Shrink {...ico} />
            {view.z.toFixed(1)}×
            <X {...ico} size={12} />
          </button>
        )}
        {onLink && (
          <button type="button" aria-label="Copy link to this view" title="Copy link to this view" onClick={onLink} className={`${chip} ${off}`}>
            <Link {...ico} />
          </button>
        )}
        {keysHelp && <ShortcutsTip help={keysHelp} />}
        {changed && (
          // press and hold (pointer, or Space/Enter on the focused chip): see the file as it is, no filters
          <button
            type="button"
            aria-label="Hold to see the original"
            aria-pressed={compare}
            title="Hold to see the original (\)"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture?.(e.pointerId);
              onCompare(true);
            }}
            onPointerUp={() => onCompare(false)}
            onPointerCancel={() => onCompare(false)}
            onLostPointerCapture={() => onCompare(false)}
            onKeyDown={(e) => (e.key === " " || e.key === "Enter") && onCompare(true)}
            onKeyUp={() => onCompare(false)}
            onBlur={() => onCompare(false)}
            onContextMenu={(e) => e.preventDefault()}
            className={`${chip} ${compare ? on : off} touch-none select-none`}
          >
            <Eye {...ico} />
          </button>
        )}
        {changed && (
          <button type="button" aria-label="Reset filters" title="Reset filters" onClick={() => onAdjust(DEFAULT_ADJUST)} className={`${chip} ${off} ml-auto`}>
            <RotateCcw {...ico} />
          </button>
        )}
      </div>
      {open && (
        <div className="mt-3 rounded-xl border border-line bg-surface px-3.5 py-3">
          {panelSlot && <div ref={panelSlot} className="mb-2.5 flex flex-wrap items-center gap-2 empty:hidden" />}
          <div className="mb-2.5 flex flex-wrap items-center gap-2">
            {PRESETS.map((p) => {
              const preset = { ...adjust, ...TONE, ...p.adj };
              const active = adjustFilter(preset) === adjustFilter(adjust);
              return (
                <button
                  key={p.label}
                  type="button"
                  aria-label={p.label}
                  aria-pressed={active}
                  title={p.label}
                  onClick={() => onAdjust(active ? { ...adjust, ...TONE } : preset)}
                  className={`${chip} ${active ? on : off}`}
                >
                  <p.Icon {...ico} />
                </button>
              );
            })}
            <span className="mx-1 h-4 w-px bg-line2" aria-hidden="true" />
            {PALETTES.map((p) => (
              <button
                key={p.key}
                type="button"
                aria-label={p.label}
                aria-pressed={adjust.palette === p.key}
                title={p.label}
                onClick={() => onAdjust({ ...adjust, palette: adjust.palette === p.key ? "none" : p.key })}
                className={`${chip} ${adjust.palette === p.key ? on : off}`}
              >
                <p.Icon {...ico} />
              </button>
            ))}
            <button
              type="button"
              aria-label="Sharpen"
              aria-pressed={adjust.sharpen}
              title="Sharpen"
              onClick={() => onAdjust({ ...adjust, sharpen: !adjust.sharpen })}
              className={`${chip} ${adjust.sharpen ? on : off}`}
            >
              <Focus {...ico} />
            </button>
          </div>
          <div className="grid gap-x-5 gap-y-2 min-[600px]:grid-cols-3">
            {SLIDERS.map((s) => (
              <label key={s.key} title={s.label} className="flex items-center gap-2.5 font-mono text-[9.5px] tracking-[.4px] text-faint">
                <s.Icon {...ico} className="flex-none" />
                <input
                  type="range"
                  aria-label={s.label}
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
  x: number; // bubble top-left, viewport px (the bubble is position: fixed)
  y: number;
  u: number; // pointer, 0–1 across the picture's own axes
  v: number;
  rw: number; // picture's on-screen size along its own axes, px
  rh: number;
  mag: number;
  rot: number;
  flip: boolean;
}

/** Rotate/flip a lens layer to match the panel view (around the bubble centre). */
export const lensTurn = (h: LensHit) => (h.rot || h.flip ? `rotate(${h.rot}deg)${h.flip ? " scaleX(-1)" : ""}` : undefined);

type PointerLike = { clientX: number; clientY: number; pointerType: string };

const GAP = 8;
/** Bubble top-left in viewport px (see LensLayer). */
export function bubbleAt(e: PointerLike, box: { top: number; bottom: number }) {
  const half = LENS_PX / 2;
  if (e.pointerType !== "touch") return { x: e.clientX - half, y: e.clientY - half };
  const x = Math.min(Math.max(GAP, e.clientX - half), window.innerWidth - LENS_PX - GAP);
  if (box.bottom + GAP + LENS_PX <= window.innerHeight) return { x, y: box.bottom + GAP };
  if (box.top - GAP - LENS_PX >= 0) return { x, y: box.top - GAP - LENS_PX };
  // panel fills the screen: sit above the finger, or below it near the top
  const finger = 64; // clearance, px
  const above = e.clientY - finger - LENS_PX;
  return { x, y: above >= 0 ? above : e.clientY + finger };
}

/**
 * Magnifier bubble over the media panel; `children` paints the zoomed view.
 * `clickThrough` (mouse): the layer ignores clicks so the media's own
 * controls / tap-to-open keep working, and tracks the pointer on the panel
 * underneath. Otherwise (touch) it covers the panel and captures drags.
 * The cursor hides while the bubble shows; `deadBottom` px at the bottom
 * (a video's control bar) get no lens. The bubble is portalled to <body>
 * so the panel's overflow-hidden doesn't clip it at the edges. Mouse: the
 * bubble centres on the cursor. Touch: it docks just outside the panel
 * (below, else above) and slides with the finger, so the finger never
 * covers it.
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
    show({ ...p, ...bubbleAt(e, box), mag, rot: view.rot, flip: view.flip });
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
      {hit &&
        createPortal(
          <div
            aria-hidden="true"
            className="pointer-events-none fixed z-[75] overflow-hidden rounded-full bg-black shadow-[0_0_0_2px_rgba(255,255,255,.8),0_6px_24px_rgba(0,0,0,.6)]"
            style={{ width: LENS_PX, height: LENS_PX, left: hit.x, top: hit.y }}
          >
            {children(hit)}
          </div>,
          document.body,
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
