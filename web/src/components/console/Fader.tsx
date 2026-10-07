// A vertical fader (茶盤: long = slide). Native <input type="range">, so it
// stays accessible; double-click / double-tap sends it back to 100.
import type { CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";

export function Fader({
  label,
  Icon,
  value,
  onChange,
  onReset,
}: {
  label: string;
  Icon: LucideIcon;
  value: number;
  onChange(v: number): void;
  onReset(): void;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <input
        type="range"
        aria-label={`${label} (double-click to reset)`}
        min={0}
        max={200}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onDoubleClick={onReset}
        title={`${label} — double-click to reset`}
        // vertical-lr + rtl: max at the top, like a mixer fader.
        // w-10: a 40px grab strip — 24px is too thin for thumbs.
        style={{ writingMode: "vertical-lr", direction: "rtl", height: 128 } as CSSProperties}
        className="w-10 cursor-ns-resize accent-[var(--signal)]"
      />
      <Icon size={16} strokeWidth={1.75} aria-hidden="true" className="text-faint" />
      <span className="font-mono text-[9px] tabular-nums text-dim">{value}%</span>
    </div>
  );
}
