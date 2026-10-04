// Pixel ruler over the Doc media panel: drag a line, read its length in the
// file's own pixels, as a share of the frame width, and its angle (0° = right,
// 90° = up, in the picture's own axes). No metres: the files carry no scale.
// Ends are kept in picture coords, so the line stays on the same spot through
// zoom / pan / rotate. `data-no-pan` keeps the panel's pan / swipe / lens off it.
import { useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { pointToUV, uvToPoint } from "../lib/mediaView";
import type { MediaView } from "../lib/mediaView";

type UV = { u: number; v: number };
type Size = { w: number; h: number };

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function MediaRuler({ view, pic }: { view: MediaView; pic: Size | null }) {
  const [line, setLine] = useState<{ a: UV; b: UV } | null>(null);
  const [box, setBox] = useState<Size | null>(null);
  const dragging = useRef(false);

  function at(e: ReactPointerEvent<HTMLDivElement>): UV | null {
    if (!pic) return null;
    const r = e.currentTarget.getBoundingClientRect();
    setBox({ w: r.width, h: r.height });
    const p = pointToUV({ w: r.width, h: r.height }, e.clientX - r.left, e.clientY - r.top, pic, view);
    return { u: clamp01(p.u), v: clamp01(p.v) };
  }

  let label = "";
  let ends: { x: number; y: number }[] = [];
  if (line && pic) {
    const dx = (line.b.u - line.a.u) * pic.w;
    const dy = (line.b.v - line.a.v) * pic.h;
    const len = Math.hypot(dx, dy);
    label = `${Math.round(len)} px · ${((len / pic.w) * 100).toFixed(1)}% W · ${Math.round((Math.atan2(-dy, dx) * 180) / Math.PI) || 0}°`;
    if (box) ends = [uvToPoint(box, line.a.u, line.a.v, pic, view), uvToPoint(box, line.b.u, line.b.v, pic, view)];
  }
  const mid = ends.length ? { x: (ends[0].x + ends[1].x) / 2, y: (ends[0].y + ends[1].y) / 2 } : null;

  return (
    <div
      data-ruler
      data-no-pan
      className="absolute inset-0 cursor-crosshair touch-none"
      onPointerDown={(e) => {
        e.stopPropagation(); // not a swipe on the panel
        const p = at(e);
        if (!p) return;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        dragging.current = true;
        setLine({ a: p, b: p });
      }}
      onPointerMove={(e) => {
        if (!line || !dragging.current) return;
        const p = at(e);
        if (p) setLine({ ...line, b: p });
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        if (line && dragging.current) {
          const p = at(e); // moves get coalesced: the release point is the true end
          if (p) setLine({ ...line, b: p });
        }
        dragging.current = false;
      }}
      onPointerCancel={() => (dragging.current = false)}
    >
      {ends.length === 2 && (
        <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full">
          <line x1={ends[0].x} y1={ends[0].y} x2={ends[1].x} y2={ends[1].y} stroke="rgba(0,0,0,.7)" strokeWidth={4} />
          <line x1={ends[0].x} y1={ends[0].y} x2={ends[1].x} y2={ends[1].y} stroke="var(--signal)" strokeWidth={1.5} />
          {ends.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={4} fill="var(--signal)" stroke="rgba(0,0,0,.7)" />
          ))}
        </svg>
      )}
      {label && (
        <span
          data-testid="ruler-label"
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-[calc(100%+8px)] whitespace-nowrap rounded-md px-2 py-1 font-mono text-[10px] text-white"
          style={{ left: mid?.x ?? 60, top: mid?.y ?? 30, background: "rgba(0,0,0,.75)" }}
        >
          {label}
        </span>
      )}
    </div>
  );
}
