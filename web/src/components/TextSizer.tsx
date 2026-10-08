// Site-wide text size: the A-/A+ row inside the More menu. Sets html font-size
// % (ThemeProvider textScale); every CSS font-size is rem (postcss.config.js
// pxToRem), so all text follows. TextSizeBadge (the floating "Aa" popover
// trigger) is currently unused in the nav — kept for tests only.
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { AArrowDown, AArrowUp, ALargeSmall } from "lucide-react";
import { TEXT_SCALES, useTheme } from "../theme/useTheme";
import { useDismiss } from "../lib/useDismiss";

// px on purpose: the badge doesn't follow the text size it sets.
const BADGE = 18;
const BITE = BADGE / 2 + 2; // badge + a 2px gap

/** Mask style that bites a BITE-radius circle centred at (x, y) out of an element. */
export function biteMask(x: string, y: string): CSSProperties {
  const m = `radial-gradient(circle at ${x} ${y}, transparent ${BITE}px, #000 ${BITE + 0.5}px)`;
  return { maskImage: m, WebkitMaskImage: m };
}

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

/** The "Aa" badge, centred on `style`'s left/top (the bite centre); pops the sizer
 *  above itself (`up`, phone tab bar / desktop floater) or below. */
export function TextSizeBadge({ style, up = false, size = BADGE }: { style: CSSProperties; up?: boolean; size?: number }) {
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<DOMRect | null>(null);
  const { pathname } = useLocation();
  useEffect(() => setOpen(null), [pathname]);
  const close = useRef(() => setOpen(null)).current;
  useDismiss(!!open, close, btn, pop);
  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-label="Text size"
        title="Text size"
        aria-expanded={!!open}
        onClick={() => setOpen(open ? null : btn.current!.getBoundingClientRect())}
        className="absolute z-[31] grid -translate-x-1/2 shadow-lg -translate-y-1/2 place-items-center rounded-full font-mono font-bold leading-none active:scale-90 before:absolute before:-inset-[8px] before:content-['']"
        style={{ ...style, width: size, height: size, background: "var(--signal)", color: "var(--bg)" }}
      >
        <ALargeSmall size={size / 2.2} strokeWidth={2.25} aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <div
            ref={pop}
            // px throughout (inline font-size skips pxToRem): the popover mustn't grow
            // with the text size it sets, or A+ gets pushed out at 250%+.
            className="fixed z-50 w-[180px] rounded-[12px] border border-line bg-bg2 p-[6px] font-mono font-medium shadow-lg animate-[fadeup_.2s_ease_both]"
            style={{
              fontSize: 13,
              right: Math.max(8, innerWidth - open.right - 8),
              ...(up ? { bottom: innerHeight - open.top + 8 } : { top: open.bottom + 8 }),
            }}
          >
            <TextSizer className="flex items-center gap-[8px]" />
          </div>,
          document.body
        )}
    </>
  );
}
