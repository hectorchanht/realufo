// Geometry for the Doc media panel: a picture/video drawn `object-contain`
// in the panel, then transformed by the view (pan, zoom, rotate, flip).
// Shared by the CSS transform, pan/zoom gestures and the zoom lens.

export interface MediaView {
  z: number; // zoom, 1–8
  x: number; // pan, px from centre
  y: number;
  rot: 0 | 90 | 180 | 270; // clockwise
  flip: boolean; // mirrored horizontally (before rotation)
}

export const DEFAULT_VIEW: MediaView = { z: 1, x: 0, y: 0, rot: 0, flip: false };
export const MAX_ZOOM = 8;

type Size = { w: number; h: number };

/** Contained size (cw×ch) and the extra scale `s` that makes a 90/270° rotation fit the box. */
function fit(box: Size, pic: Size, rot: number) {
  const c = Math.min(box.w / pic.w, box.h / pic.h);
  const cw = pic.w * c;
  const ch = pic.h * c;
  return { cw, ch, s: rot % 180 ? Math.min(box.w / ch, box.h / cw) : 1 };
}

/** CSS transform for the media element. Needs the picture size only for 90/270° fit. */
export function viewTransform(v: MediaView, box: Size | null, pic: Size | null): string {
  const s = box && pic ? fit(box, pic, v.rot).s : 1;
  if (v.z === 1 && !v.x && !v.y && !v.rot && !v.flip) return "";
  return `translate(${v.x}px, ${v.y}px) scale(${v.z * s}) rotate(${v.rot}deg)${v.flip ? " scaleX(-1)" : ""}`;
}

/**
 * Pointer at (px, py) in box coords → position on the picture (u, v: 0–1
 * across its own axes, outside the range = off the picture) and the picture's
 * on-screen size along those axes (rw × rh).
 */
export function pointToUV(box: Size, px: number, py: number, pic: Size, v: MediaView) {
  const { cw, ch, s } = fit(box, pic, v.rot);
  const k = v.z * s;
  const dx = (px - box.w / 2 - v.x) / k;
  const dy = (py - box.h / 2 - v.y) / k;
  const r = (v.rot * Math.PI) / 180;
  const cos = Math.round(Math.cos(r));
  const sin = Math.round(Math.sin(r));
  // undo the clockwise rotation, then the flip
  let ux = dx * cos + dy * sin;
  const uy = -dx * sin + dy * cos;
  if (v.flip) ux = -ux;
  return { u: 0.5 + ux / cw, v: 0.5 + uy / ch, rw: cw * k, rh: ch * k };
}

/** Keep the picture covering the box: no pan past its edges, centred at 1×. */
export function clampView(v: MediaView, box: Size, pic: Size): MediaView {
  const { cw, ch, s } = fit(box, pic, v.rot);
  const k = v.z * s;
  const [vw, vh] = v.rot % 180 ? [ch * k, cw * k] : [cw * k, ch * k];
  const mx = Math.max(0, (vw - box.w) / 2);
  const my = Math.max(0, (vh - box.h) / 2);
  return { ...v, x: Math.min(mx, Math.max(-mx, v.x)) || 0, y: Math.min(my, Math.max(-my, v.y)) || 0 }; // || 0: no -0
}

/** Zoom by `factor` keeping the point at (px, py) in box coords where it is. */
export function zoomAt(v: MediaView, box: Size, pic: Size, factor: number, px: number, py: number): MediaView {
  const z = Math.min(MAX_ZOOM, Math.max(1, v.z * factor));
  const sx = px - box.w / 2;
  const sy = py - box.h / 2;
  const f = z / v.z;
  return clampView({ ...v, z, x: sx - f * (sx - v.x), y: sy - f * (sy - v.y) }, box, pic);
}

// URL form of a view, for share links: zoom, rotation, flip and the picture
// point at the panel centre (cx/cy, 0–1), so the same spot lands in the
// middle on any screen size.
export const VIEW_PARAMS = ["z", "cx", "cy", "rot", "flip"];

/** Write a view into `sp` (in place); nothing for the default view. */
export function viewToParams(sp: URLSearchParams, v: MediaView, box: Size, pic: Size) {
  for (const k of VIEW_PARAMS) sp.delete(k);
  if (v.z > 1) {
    const c = pointToUV(box, box.w / 2, box.h / 2, pic, v);
    sp.set("z", String(+v.z.toFixed(2)));
    if (Number.isFinite(c.u + c.v)) {
      sp.set("cx", String(+c.u.toFixed(3)));
      sp.set("cy", String(+c.v.toFixed(3)));
    }
  }
  if (v.rot) sp.set("rot", String(v.rot));
  if (v.flip) sp.set("flip", "1");
}

/** Read a view off the URL for this panel; null when there is none (or it's junk). */
export function viewFromParams(sp: URLSearchParams, box: Size, pic: Size): MediaView | null {
  const n = (k: string, d: number) => {
    const x = Number(sp.get(k) ?? d);
    return Number.isFinite(x) ? x : d;
  };
  const rot = n("rot", 0);
  const v: MediaView = {
    ...DEFAULT_VIEW,
    z: Math.min(MAX_ZOOM, Math.max(1, n("z", 1))),
    rot: rot === 90 || rot === 180 || rot === 270 ? rot : 0,
    flip: sp.get("flip") === "1",
  };
  if (v.z === 1 && !v.rot && !v.flip) return null;
  // put picture point (cx, cy) at the panel centre: forward of pointToUV's undo
  const { cw, ch, s } = fit(box, pic, v.rot);
  const k = v.z * s;
  let ux = (Math.min(1, Math.max(0, n("cx", 0.5))) - 0.5) * cw;
  const uy = (Math.min(1, Math.max(0, n("cy", 0.5))) - 0.5) * ch;
  if (v.flip) ux = -ux;
  const r = (v.rot * Math.PI) / 180;
  const cos = Math.round(Math.cos(r));
  const sin = Math.round(Math.sin(r));
  return clampView({ ...v, x: -k * (ux * cos - uy * sin), y: -k * (ux * sin + uy * cos) }, box, pic);
}
