// Site-wide text size, pinned bottom-right over every screen (AppShell). It rides
// above the mobile BottomTab (--bnav-y) and the Thread reply bar. Sized in px so
// the control itself stays put while the text it sets (html font-size %) grows.
import { AArrowDown, AArrowUp } from "lucide-react";
import { TEXT_SCALES, useTheme } from "../theme/useTheme";

export function TextSizer({ lift = "0px" }: { lift?: string }) {
  const { textScale, setTextScale } = useTheme();
  const i = TEXT_SCALES.indexOf(textScale);
  const step = (label: string, to: number, Icon: typeof AArrowUp) => (
    <button
      type="button"
      onClick={() => setTextScale(TEXT_SCALES[to])}
      disabled={!TEXT_SCALES[to]}
      aria-label={label}
      title={`${label} (${textScale}%)`}
      className="grid h-[34px] w-[34px] place-items-center text-dim hover:text-signal active:scale-90 disabled:opacity-35 disabled:hover:text-dim"
    >
      <Icon size={17} aria-hidden />
    </button>
  );
  return (
    <div
      role="group"
      aria-label="Text size"
      data-text-sizer
      className="absolute right-[12px] z-40 flex divide-x divide-line2 rounded-full border border-line2 transition-[bottom] duration-300 ease-[cubic-bezier(.32,.72,0,1)] motion-reduce:transition-none"
      style={{
        bottom: `calc(var(--bnav-y, 0px) + 12px + ${lift})`,
        background: "color-mix(in srgb, var(--bg2) 88%, transparent)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      {step("Smaller text", i - 1, AArrowDown)}
      {step("Larger text", i + 1, AArrowUp)}
    </div>
  );
}
