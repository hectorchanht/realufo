// Site-wide text size row in the More menu (phone sheet + desktop dropdown).
// Sets html font-size % (ThemeProvider textScale); every CSS font-size is rem
// (postcss.config.js pxToRem), so all text follows.
import { AArrowDown, AArrowUp } from "lucide-react";
import { TEXT_SCALES, useTheme } from "../theme/useTheme";

export function TextSizer({ className = "", iconSize = 17 }: { className?: string; iconSize?: number }) {
  const { textScale, setTextScale } = useTheme();
  const i = TEXT_SCALES.indexOf(textScale);
  const step = (label: string, to: number, Icon: typeof AArrowUp) => (
    <button
      type="button"
      onClick={() => setTextScale(TEXT_SCALES[to])}
      disabled={!TEXT_SCALES[to]}
      aria-label={label}
      title={label}
      className="grid h-[36px] w-[36px] flex-none place-items-center rounded-lg border border-line2 hover:border-signal hover:text-signal active:scale-90 disabled:opacity-35 disabled:hover:border-line2 disabled:hover:text-ink"
    >
      <Icon size={iconSize} aria-hidden />
    </button>
  );
  return (
    <div role="group" aria-label="Text size" data-text-sizer className={className} style={{ color: "var(--ink)" }}>
      {step("Smaller text", i - 1, AArrowDown)}
      <span className="flex-1 text-center tabular-nums text-dim">{textScale}%</span>
      {step("Larger text", i + 1, AArrowUp)}
    </div>
  );
}
