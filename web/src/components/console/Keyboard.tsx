// The Wakeman keyboard: white keys = effects, black keys = tools, reduced
// to the essential forms per 茶盤 (flat, site tokens, both themes). A key
// that is on stays pressed down (sunk 2px, accent). Every key ≥ 36px: the
// keyboard grows rather than the keys shrinking. `hold` keys (Original) are
// momentary: held = on.
import type { PointerEvent as ReactPointerEvent } from "react";
import type { LucideIcon } from "lucide-react";

export interface KeyDef {
  id: string;
  label: string;
  title: string;
  Icon: LucideIcon;
  active: boolean;
  /** Tap, or (hold keys) the held state. */
  onTap(held?: boolean): void;
  hold?: boolean;
}

const WHITE_H = "h-[76px]";
const BLACK_W = 34;
const BLACK_H = 46;

function WhiteKey({ k }: { k: KeyDef }) {
  const holdProps = k.hold
    ? {
        onPointerDown: (e: ReactPointerEvent) => {
          e.currentTarget.setPointerCapture?.(e.pointerId);
          k.onTap(true);
        },
        onPointerUp: () => k.onTap(false),
        onPointerCancel: () => k.onTap(false),
        onLostPointerCapture: () => k.onTap(false),
        onKeyDown: (e: React.KeyboardEvent) => (e.key === " " || e.key === "Enter") && k.onTap(true),
        onKeyUp: () => k.onTap(false),
        onBlur: () => k.onTap(false),
        onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
      }
    : { onClick: () => k.onTap() };
  return (
    <button
      type="button"
      aria-label={k.hold ? `${k.label} (hold)` : k.label}
      aria-pressed={k.hold ? undefined : k.active}
      title={k.title}
      {...holdProps}
      className={`flex min-h-[44px] min-w-[36px] flex-1 flex-col items-center justify-end gap-1 rounded-b-[8px] rounded-t-[4px] border pb-2 pt-1 transition-all duration-150 ease-out active:translate-y-[2px] motion-reduce:transition-none ${
        k.active
          ? "translate-y-[2px] border-signal bg-[var(--signal-dim)] text-signal"
          : "border-line2 bg-bg text-dim"
      } ${WHITE_H} ${k.hold ? "touch-none select-none" : ""}`}
    >
      <k.Icon size={18} strokeWidth={1.75} aria-hidden="true" />
    </button>
  );
}

export function WakemanKeyboard({ white, black }: { white: KeyDef[]; black: KeyDef[] }) {
  return (
    <div className="relative">
      <div className="flex items-stretch gap-[3px]">
        {white.map((k) => (
          <WhiteKey key={k.id} k={k} />
        ))}
      </div>
      {/* black keys sit on the boundaries between white keys, top half */}
      {black.map((k, i) => (
        <button
          key={k.id}
          type="button"
          aria-label={k.label}
          aria-pressed={k.active}
          title={k.title}
          onClick={() => k.onTap()}
          style={{ left: `calc(${((i + 1) * 100) / white.length}% - ${BLACK_W / 2}px)`, width: BLACK_W, height: BLACK_H }}
          className={`absolute top-0 z-10 grid place-items-center rounded-b-[8px] border transition-all duration-150 ease-out active:translate-y-[2px] motion-reduce:transition-none ${
            k.active
              ? "translate-y-[2px] border-signal bg-[var(--signal-dim)] text-signal"
              : "border-line2 bg-bg2 text-dim"
          }`}
        >
          <k.Icon size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
