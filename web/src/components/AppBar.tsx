// Sticky compact header shown at the top of the scroll area on mobile
// (<900px). Ported from realufo-handoff/RealUFO.dc.html lines 100-108:
// optional back button, optional brand saucer, title/subtitle block, compact
// login button.
import { Saucer } from "./Saucer";

export interface AppBarProps {
  canBack?: boolean;
  onBack?: () => void;
  showBrand?: boolean;
  headerTitle: string;
  headerSub: string;
  onLogin?: () => void;
  /** Compact login label (line 107's `{{ meShort }}`). Real auth wiring lands in Task 16/23. */
  meShort?: string;
}

export function AppBar({
  canBack = false,
  onBack,
  showBrand = true,
  headerTitle,
  headerSub,
  onLogin,
  meShort = "GUEST",
}: AppBarProps) {
  return (
    <div
      data-appbar
      className="sticky top-0 z-30 flex items-center gap-3 border-b border-line px-[18px] py-[11px] backdrop-blur-[22px] backdrop-saturate-[1.6]"
      style={{ background: "color-mix(in srgb, var(--bg) 72%, transparent)" }}
    >
      {canBack && (
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="grid h-[34px] w-[34px] flex-none place-items-center rounded-[10px] border border-line2 text-[17px] text-ink active:scale-[.94]"
        >
          ‹
        </button>
      )}
      {showBrand && (
        <div className="flex-none">
          <Saucer />
        </div>
      )}
      <div className="min-w-0 flex-1 leading-[1.15]">
        <div className="overflow-hidden text-ellipsis whitespace-nowrap font-pixel text-[10px] text-ink">
          {headerTitle}
        </div>
        <div className="mt-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[9.5px] tracking-[.5px] text-faint">
          {headerSub}
        </div>
      </div>
      <button
        type="button"
        onClick={onLogin}
        className="flex flex-none items-center gap-1.5 rounded-[9px] border border-line2 px-2.5 py-1.5 font-mono text-[11px] text-ink active:scale-[.96]"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-signal" />
        {meShort}
      </button>
    </div>
  );
}

export default AppBar;
