// Media inspection tools for the Doc media panel (images and video),
// uapbrowser-style: brightness / contrast / saturation sliders, Enhance /
// Invert IR / B&W presets, thermal false-colour palettes, sharpen, rotate /
// flip, frame zoom, and a zoom lens (LensLayer, shared with VideoTools).
// CSS + SVG filters and a background-image lens for images, so no canvas
// (and no CORS dependency on the CDN).
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { PointerEvent as ReactPointerEvent, ReactNode, RefObject } from "react";
import { SlidersHorizontal } from "lucide-react";
import { DEFAULT_VIEW, centreOn, pointToUV } from "../lib/mediaView";
import type { MediaView } from "../lib/mediaView";
import type { MediaSkin } from "../lib/mediaSkin";
import type { VideoCtl } from "../lib/useVideoTransport";
import { MediaConsole } from "./console/MediaConsole";

export type Palette = "none" | "ironbow" | "rainbow";

export interface ImageAdjust {
  brightness: number; // percent, 100 = unchanged
  contrast: number;
  saturate: number;
  gamma: number; // "Shadows", percent: > 100 lifts dark areas (SVG gamma curve, see gammaExponent)
  invert: boolean;
  gray: boolean;
  palette: Palette; // false colour by luminance (SVG filter, see MediaFilters)
  sharpen: boolean;
}

export const DEFAULT_ADJUST: ImageAdjust = {
  brightness: 100,
  contrast: 100,
  saturate: 100,
  gamma: 100,
  invert: false,
  gray: false,
  palette: "none",
  sharpen: false,
};

// URL form of an adjustment (Doc keeps it in the query so it carries to the
// next file and survives a share): only non-defaults are written.
const ADJUST_PARAMS = ["br", "ct", "sat", "gam", "inv", "bw", "pal", "sharp"];
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
    gamma: pct("gam"),
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
  if (a.gamma !== 100) sp.set("gam", String(a.gamma));
  if (a.invert) sp.set("inv", "1");
  if (a.gray) sp.set("bw", "1");
  if (a.palette !== "none") sp.set("pal", a.palette);
  if (a.sharpen) sp.set("sharp", "1");
}

// Presets, palettes and sliders now live with the console bodies
// (components/console/): SimpleBody, DjBody, WalkmanBody share effects.ts.

/** Shadows % → gamma exponent: 100 → 1, 200 → ~0.37 (lifted), 0 → ~2.7 (crushed). */
export const gammaExponent = (g: number) => +Math.pow(2, (100 - g) / 70).toFixed(3);

export const LENS_MAGS = [2, 3, 5, 8];

/** CSS `filter` for an adjustment; "" when nothing is changed. */
export function adjustFilter(a: ImageAdjust): string {
  const f: string[] = [];
  if (a.brightness !== 100) f.push(`brightness(${a.brightness / 100})`);
  if (a.contrast !== 100) f.push(`contrast(${a.contrast / 100})`);
  if (a.saturate !== 100) f.push(`saturate(${a.saturate / 100})`);
  if (a.gamma !== 100) f.push("url(#ru-gamma)"); // exponent lives in MediaFilters
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
export function MediaFilters({ gamma = 100 }: { gamma?: number }) {
  const e = gammaExponent(gamma);
  return (
    <svg aria-hidden="true" width="0" height="0" className="absolute">
      <filter id="ru-gamma" colorInterpolationFilters="sRGB">
        <feComponentTransfer>
          <feFuncR type="gamma" exponent={e} />
          <feFuncG type="gamma" exponent={e} />
          <feFuncB type="gamma" exponent={e} />
        </feComponentTransfer>
      </filter>
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

/** Draw region `r` of `src` with the filter, rotation and flip applied, encoded as PNG. */
export function renderPng(src: CanvasImageSource, r: { x: number; y: number; w: number; h: number }, filter: string, view: MediaView): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const c = document.createElement("canvas");
    [c.width, c.height] = view.rot % 180 ? [r.h, r.w] : [r.w, r.h];
    const ctx = c.getContext("2d");
    if (!ctx) return reject(new Error("no canvas"));
    ctx.filter = filter || "none"; // ignored by Safari < 18 → unfiltered capture
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate((view.rot * Math.PI) / 180);
    if (view.flip) ctx.scale(-1, 1);
    ctx.drawImage(src, r.x, r.y, r.w, r.h, -r.w / 2, -r.h / 2, r.w, r.h);
    c.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/png");
  });
}

/** Load a same-origin copy of an image (so the canvas isn't tainted) and render it as PNG. */
export function grabImage(src: string, filter: string, view: MediaView): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error("load failed"));
    img.onload = () => renderPng(img, { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight }, filter, view).then(resolve, reject);
    img.src = src;
  });
}

// 36px tall for fingers, 32px with a mouse (WCAG 2.2 target size, room for 8 in a phone row)
export const chip = "inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-[8px] border px-2 font-mono text-[11px] active:scale-[.96] [@media(pointer:fine)]:h-8 [@media(pointer:fine)]:min-w-8";
/** Lucide icon size/stroke for chips. */
export const ico = { size: 18, strokeWidth: 1.75, "aria-hidden": true } as const;
export const on = "border-signal text-signal";
export const off = "border-line2 text-dim";

const ADJUST_OPEN_KEY = "ru:console-open";

/** Adjust panel open state, lifted so a parent can host the button elsewhere
 *  (the video transport row). Persists per browser: once opened, stays open. */
export function useAdjustOpen() {
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
  return [open, setOpen] as const;
}

/** The sliders button that opens the Adjust panel. Highlighted while open or
 *  while any filter/look is changed. */
export function AdjustButton({ open, onToggle, changed }: { open: boolean; onToggle: (open: boolean) => void; changed: boolean }) {
  return (
    <button
      type="button"
      aria-label="Adjust"
      aria-expanded={open}
      title="Adjust"
      onClick={() => onToggle(!open)}
      className={`${chip} ${open || changed ? on : off}`}
    >
      <SlidersHorizontal {...ico} />
    </button>
  );
}

export function MediaToolbar({
  media,
  skin,
  onSkin,
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
  onMomentLink,
  onSave,
  ruler,
  onRuler,
  motion,
  onMotion,
  compare,
  onCompare,
  help,
  video,
  open,
  onToggleOpen,
  showAdjustButton = true,
}: {
  /** "image" or "video": which bodies and pads render. */
  media: "image" | "video";
  /** Console style; the visitor picks it with the Palette button. */
  skin: MediaSkin;
  onSkin(s: MediaSkin): void;
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
  /** Copy a link to this view (images). */
  onLink?: () => void;
  /** Copy a link to the current moment (video pads). */
  onMomentLink?: () => void;
  /** Save the picture as seen, as PNG (images). */
  onSave?: () => Promise<void>;
  ruler: boolean;
  onRuler: (on: boolean) => void;
  /** Video motion highlight (absent for images). */
  motion: boolean;
  onMotion?: (on: boolean) => void;
  /** Hold-to-compare: true while the unfiltered picture shows. */
  compare: boolean;
  onCompare: (on: boolean) => void;
  /** The "how to use" chip (MediaHelp), last in the Simple tool row. */
  help?: ReactNode;
  /** Video transport state for the console deck (null for images). */
  video: VideoCtl | null;
  /** Controlled open state (Doc lifts it so the video transport can host the Adjust button). */
  open: boolean;
  onToggleOpen: (open: boolean) => void;
  /** Render the Adjust button in the toolbar row; false when the parent renders it (video transport). */
  showAdjustButton?: boolean;
}) {
  const changed = adjustFilter(adjust) !== "";
  if (!showAdjustButton && !open) return null;
  return (
    <div className="mb-3.5">
      {showAdjustButton && (
        <div className="flex flex-wrap items-center gap-2">
          <AdjustButton open={open} onToggle={onToggleOpen} changed={changed} />
        </div>
      )}
      {open && (
        // relative: MediaHelp's tooltip panel spans this box
        <div className={`relative rounded-xl border border-line bg-surface px-3.5 py-3 ${showAdjustButton ? "mt-3" : ""}`}>
          <MediaConsole
            media={media}
            skin={skin}
            onSkin={onSkin}
            adjust={adjust}
            onAdjust={onAdjust}
            lens={lens}
            onLens={onLens}
            mag={mag}
            onMag={onMag}
            view={view}
            onView={onView}
            onZoom={onZoom}
            ruler={ruler}
            onRuler={onRuler}
            motion={motion}
            onMotion={onMotion}
            compare={compare}
            onCompare={onCompare}
            onLink={onLink}
            onMomentLink={onMomentLink}
            onSave={onSave}
            video={video}
            help={help}
          />
        </div>
      )}
    </div>
  );
}


const MINI = 88; // minimap's long side, px

/**
 * Overview of the whole picture while zoomed, the visible area boxed; press
 * or drag on it to pan there. `data-no-pan` keeps the panel's own pan /
 * swipe / double-tap / lens off it.
 */
export function Minimap({
  src,
  view,
  box,
  pic,
  onView,
}: {
  src?: string;
  view: MediaView;
  box: { w: number; h: number } | null;
  pic: { w: number; h: number } | null;
  onView: (v: MediaView) => void;
}) {
  if (view.z <= 1 || !box || !pic) return null;
  const [mw, mh] = pic.w >= pic.h ? [MINI, (MINI * pic.h) / pic.w] : [(MINI * pic.w) / pic.h, MINI];
  const [ow, oh] = view.rot % 180 ? [mh, mw] : [mw, mh];
  const a = pointToUV(box, 0, 0, pic, view);
  const b = pointToUV(box, box.w, box.h, pic, view);
  const c = (n: number) => Math.min(1, Math.max(0, n));
  const [u0, u1, v0, v1] = [c(Math.min(a.u, b.u)), c(Math.max(a.u, b.u)), c(Math.min(a.v, b.v)), c(Math.max(a.v, b.v))];
  function go(e: ReactPointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const p = pointToUV({ w: r.width, h: r.height }, e.clientX - r.left, e.clientY - r.top, pic!, { ...DEFAULT_VIEW, rot: view.rot, flip: view.flip });
    onView(centreOn(view, box!, pic!, p.u, p.v));
  }
  return (
    <div
      data-minimap
      data-no-pan
      aria-hidden="true"
      className="absolute bottom-2 right-2 z-[5] touch-none overflow-hidden rounded-md border border-white/50 bg-black/70 shadow-[0_2px_10px_rgba(0,0,0,.5)]"
      style={{ width: ow, height: oh }}
      onPointerDown={(e) => {
        e.stopPropagation(); // not a swipe on the panel
        e.currentTarget.setPointerCapture?.(e.pointerId);
        go(e);
      }}
      onPointerMove={(e) => e.currentTarget.hasPointerCapture?.(e.pointerId) && go(e)}
      onPointerUp={(e) => e.stopPropagation()}
    >
      <div
        className="absolute"
        style={{ width: mw, height: mh, left: (ow - mw) / 2, top: (oh - mh) / 2, transform: view.rot || view.flip ? `rotate(${view.rot}deg)${view.flip ? " scaleX(-1)" : ""}` : undefined }}
      >
        {src && <img src={src} alt="" draggable={false} className="h-full w-full opacity-80" />}
        <div
          data-minimap-view
          className="absolute border-[1.5px] border-signal shadow-[0_0_0_999px_rgba(0,0,0,.35)]"
          style={{ left: `${u0 * 100}%`, top: `${v0 * 100}%`, width: `${(u1 - u0) * 100}%`, height: `${(v1 - v0) * 100}%` }}
        />
      </div>
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

type PointerLike = { clientX: number; clientY: number; pointerType: string; target?: EventTarget | null };

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
    if ((e.target as Element | null)?.closest?.("[data-no-pan]")) return show(null); // over the minimap
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
