// Sticky compact header shown at the top of the scroll area on mobile
// (<900px). Ported from realufo-handoff/RealUFO.dc.html lines 100-108:
// optional back button, optional brand saucer, title/subtitle block, theme
// toggle (in place of the prototype's dead login button).
//
// Title/sub (line 104/105's `{{ headerTitle }}`/`{{ headerSub }}`) come from
// the PageTitleProvider context (Task 23b — lib/pageTitle.tsx), not props:
// the AppShell-mounted provider is the single source of truth screens push
// their contextual title into, and AppBar just reads it.
import { ArrowLeft } from "lucide-react";
import { Saucer } from "./Saucer";
import { usePageTitle } from "../lib/pageTitle";
import { ThemeToggle } from "./ThemeToggle";

export interface AppBarProps {
  canBack?: boolean;
  onBack?: () => void;
  showBrand?: boolean;
  /** Slid up out of view (AppShell's scroll-down auto-hide). Keyboard focus brings it back. */
  hidden?: boolean;
}

export function AppBar({
  canBack = false,
  onBack,
  showBrand = true,
  hidden = false,
}: AppBarProps) {
  const { title: headerTitle, sub: headerSub } = usePageTitle();
  return (
    <div
      data-appbar
      data-hidden={hidden || undefined}
      className={
        "sticky top-0 z-30 flex items-center gap-3 border-b border-line px-[18px] pb-[11px] pt-[max(11px,env(safe-area-inset-top))] backdrop-blur-[22px] backdrop-saturate-[1.6] transition-transform duration-300 ease-[cubic-bezier(.32,.72,0,1)] focus-within:translate-y-0 motion-reduce:transition-none" +
        (hidden ? " -translate-y-full" : "")
      }
      style={{ background: "color-mix(in srgb, var(--bg) 72%, transparent)" }}
    >
      {canBack && (
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="-ml-[10px] grid h-[34px] w-[34px] flex-none place-items-center rounded-[8px] text-ink active:scale-[.94]"
        >
          <ArrowLeft size={19} strokeWidth={2} aria-hidden="true" />
        </button>
      )}
      {showBrand && (
        <div className="flex-none">
          <Saucer />
        </div>
      )}
      <div className="min-w-0 flex-1 leading-[1.15]">
        <div className="overflow-hidden text-ellipsis whitespace-nowrap font-pixel text-[10px] text-ink">
          {/* the brand wordmark looks the same everywhere: UFO in the signal colour (TopNav, SiteFooter) */}
          {headerTitle === "REALUFO" ? <>REAL<span className="text-signal">UFO</span></> : headerTitle}
        </div>
        <div className="mt-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[9.5px] tracking-[.5px] text-faint">
          {headerSub}
        </div>
      </div>
      <ThemeToggle className="h-[34px] w-[34px]" />
    </div>
  );
}

export default AppBar;
