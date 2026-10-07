// iPod-style click wheel (茶盤: round = turn). The ring scrubs — video:
// one frame per 12°; image: zoom ×= exp(Δ°/180) — and the four press points
// plus the centre button are real buttons. A tap that doesn't slide counts
// as a press; a slide of more than 6° is a scrub. Phones that support it get
// a 5ms haptic tick per step. role="slider": arrow keys step too.
import { useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { LucideIcon } from "lucide-react";

export interface WheelPress {
  label: string;
  title: string;
  Icon: LucideIcon;
  onPress(): void;
  active?: boolean;
}

const STEP_DEG = 12; // one video frame per 12° of ring travel

export function ClickWheel({
  press,
  onScrub,
  valueText,
  label,
}: {
  press: { center: WheelPress; top: WheelPress; right: WheelPress; bottom: WheelPress; left: WheelPress };
  /** Ring slid by one step: +1 clockwise, −1 counter-clockwise. */
  onScrub(dir: 1 | -1): void;
  valueText: string; // aria: timecode or zoom
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const track = useRef<{ id: number; last: number; acc: number } | null>(null);

  function angle(e: ReactPointerEvent) {
    const r = ref.current!.getBoundingClientRect();
    return (Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180) / Math.PI;
  }
  function wrap(d: number) {
    if (d > 180) return d - 360;
    if (d < -180) return d + 360;
    return d;
  }
  function tick() {
    try {
      navigator.vibrate?.(5);
    } catch {
      /* no haptics here */
    }
  }

  const points: [WheelPress, string][] = [
    [press.top, "left-1/2 top-[5px] -translate-x-1/2"],
    [press.right, "right-[5px] top-1/2 -translate-y-1/2"],
    [press.bottom, "bottom-[5px] left-1/2 -translate-x-1/2"],
    [press.left, "left-[5px] top-1/2 -translate-y-1/2"],
  ];

  return (
    <div
      ref={ref}
      role="slider"
      aria-label={label}
      aria-valuetext={valueText}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowUp") {
          onScrub(1);
          e.preventDefault();
        } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
          onScrub(-1);
          e.preventDefault();
        }
      }}
      onPointerDown={(e) => {
        if ((e.target as Element).closest("button")) return; // press points handle themselves
        ref.current?.setPointerCapture?.(e.pointerId);
        track.current = { id: e.pointerId, last: angle(e), acc: 0 };
      }}
      onPointerMove={(e) => {
        const tr = track.current;
        if (!tr || e.pointerId !== tr.id) return;
        const a = angle(e);
        tr.acc += wrap(a - tr.last);
        tr.last = a;
        while (Math.abs(tr.acc) >= STEP_DEG) {
          const dir = (tr.acc > 0 ? 1 : -1) as 1 | -1;
          onScrub(dir);
          tick();
          tr.acc -= dir * STEP_DEG;
        }
      }}
      onPointerUp={(e) => {
        if (track.current?.id === e.pointerId) track.current = null;
      }}
      onPointerCancel={(e) => {
        if (track.current?.id === e.pointerId) track.current = null;
      }}
      className="relative size-[132px] flex-none touch-none select-none rounded-full border border-line2 bg-surface outline-none focus-visible:border-signal"
    >
      {/* hairline ticks, Junghans-max-bill quiet face */}
      <svg aria-hidden="true" viewBox="0 0 132 132" className="absolute inset-0 h-full w-full text-faint">
        {Array.from({ length: 24 }, (_, i) => {
          const a = (i * 15 * Math.PI) / 180;
          const r1 = 58;
          const r2 = i % 6 === 0 ? 52 : 55;
          return (
            <line
              key={i}
              x1={66 + r1 * Math.sin(a)}
              y1={66 - r1 * Math.cos(a)}
              x2={66 + r2 * Math.sin(a)}
              y2={66 - r2 * Math.cos(a)}
              stroke="currentColor"
              strokeWidth={i % 6 === 0 ? 1.5 : 1}
            />
          );
        })}
      </svg>
      {points.map(([p, pos]) => (
        <button
          key={p.label}
          type="button"
          aria-label={p.label}
          title={p.title}
          aria-pressed={p.active}
          onClick={p.onPress}
          className={`absolute grid size-9 place-items-center rounded-full border text-dim transition-transform duration-150 ease-out active:scale-95 motion-reduce:transition-none ${
            p.active ? "border-signal bg-[var(--signal-dim)] text-signal" : "border-transparent"
          } ${pos}`}
        >
          <p.Icon size={18} strokeWidth={1.75} aria-hidden="true" />
        </button>
      ))}
      <button
        type="button"
        aria-label={press.center.label}
        title={press.center.title}
        aria-pressed={press.center.active}
        onClick={press.center.onPress}
        className={`absolute left-1/2 top-1/2 grid size-[52px] place-items-center rounded-full border transition-all duration-150 ease-out active:scale-95 motion-reduce:transition-none ${
          press.center.active
            ? "-translate-x-1/2 translate-y-[calc(-50%+2px)] border-signal bg-[var(--signal-dim)] text-signal"
            : "-translate-x-1/2 -translate-y-1/2 border-line2 bg-bg text-dim"
        }`}
      >
        <press.center.Icon size={20} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </div>
  );
}
