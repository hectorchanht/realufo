// Magnifier strength knob (茶盤: round = turn). Tap steps 2× → 3× → 5× →
// 8×; drag up/down to turn it. Drawn like the Junghans max bill dial: a
// quiet face, hairline ticks at the steps, one thin needle, the value small
// in the middle, a wide empty margin, no numerals round the edge.
import { useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

const SWEEP = 240; // degrees, fan from -120° to +120° (12 o'clock = 0)

export function Knob({
  value,
  steps,
  onChange,
  label,
}: {
  value: number;
  steps: number[];
  onChange(m: number): void;
  label: string;
}) {
  const idx = Math.max(0, steps.indexOf(value));
  const drag = useRef<{ id: number; y: number; stepped: boolean } | null>(null);
  const R = 44;
  const C = 48;

  function step(d: 1 | -1) {
    onChange(steps[(idx + d + steps.length) % steps.length]);
  }
  function tickAngle(i: number) {
    return ((-SWEEP / 2 + (i * SWEEP) / (steps.length - 1)) * Math.PI) / 180;
  }
  const pt = (i: number, r: number): [number, number] => {
    const a = tickAngle(i);
    return [C + r * Math.sin(a), C - r * Math.cos(a)];
  };

  function down(e: ReactPointerEvent) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { id: e.pointerId, y: e.clientY, stepped: false };
  }
  function move(e: ReactPointerEvent) {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    if (d.y - e.clientY >= 28) {
      step(1);
      d.y = e.clientY;
      d.stepped = true;
    } else if (e.clientY - d.y >= 28) {
      step(-1);
      d.y = e.clientY;
      d.stepped = true;
    }
  }
  function up(e: ReactPointerEvent) {
    const d = drag.current;
    if (d && e.pointerId === d.id) {
      if (!d.stepped) step(1); // a tap steps to the next strength
      drag.current = null;
    }
  }

  const [nx, ny] = pt(idx, R - 14);

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        role="slider"
        aria-label={label}
        aria-valuemin={steps[0]}
        aria-valuemax={steps[steps.length - 1]}
        aria-valuenow={value}
        aria-valuetext={`${value}×`}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp" || e.key === "ArrowRight") {
            step(1);
            e.preventDefault();
          } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
            step(-1);
            e.preventDefault();
          }
        }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        title={`${label}: ${value}×`}
        className="touch-none select-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--signal)]"
      >
        <svg width="96" height="96" viewBox="0 0 96 96" aria-hidden="true" className="block">
          <circle cx={C} cy={C} r={R} className="fill-[var(--surface)] stroke-[var(--line2)]" strokeWidth="1.5" />
          {steps.map((_, i) => {
            const [x1, y1] = pt(i, R - 4);
            const [x2, y2] = pt(i, R - (i === idx ? 12 : 9));
            return (
              <line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                className={i === idx ? "stroke-[var(--signal)]" : "stroke-[var(--faint)]"}
                strokeWidth={i === idx ? 2 : 1}
              />
            );
          })}
          {/* the needle */}
          <line x1={C} y1={C} x2={nx} y2={ny} className="stroke-[var(--signal)]" strokeWidth="1.5" />
          <circle cx={C} cy={C} r="2.5" className="fill-[var(--signal)]" />
          <text x={C} y={C + 20} textAnchor="middle" className="fill-[var(--dim)] font-mono" fontSize="13">
            {value}×
          </text>
        </svg>
      </div>
      <span className="font-mono text-[9px] tracking-[.5px] text-faint">{label}</span>
    </div>
  );
}
