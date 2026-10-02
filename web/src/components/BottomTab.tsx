// Mobile (<900px) bottom tab bar. Ported from
// realufo-handoff/RealUFO.dc.html lines 393-400 (the prototype's fake
// home-indicator strip, line 401, is dropped — real phones draw their own). Nav buttons are react-router `Link`s (see TopNav.tsx for
// why). Each tab has a 44px min-height tap target per the task requirement.
import type { Ref } from "react";
import { Link } from "react-router-dom";
import { NAV_ITEMS, tabHref, type NavTab } from "./navItems";

export interface BottomTabProps {
  activeTab: NavTab;
  /** Slid down out of view (AppShell's scroll-down auto-hide). Keyboard focus brings it back. */
  hidden?: boolean;
  /** Wrapper ref — AppShell measures it to publish --bnav-h. */
  ref?: Ref<HTMLDivElement>;
}

// Overlays the bottom of the shell (absolute) rather than sitting in flow, so
// sliding it out never resizes the scroll container — see AppShell.
export function BottomTab({ activeTab, hidden = false, ref }: BottomTabProps) {
  return (
    <div
      ref={ref}
      data-hidden={hidden || undefined}
      className={
        "absolute inset-x-0 bottom-0 z-30 transition-transform duration-300 ease-[cubic-bezier(.32,.72,0,1)] focus-within:translate-y-0 motion-reduce:transition-none" +
        (hidden ? " translate-y-full" : "")
      }
    >
      <div
        data-bottomtab
        className="relative z-30 flex flex-none justify-around border-t border-line px-2 pb-1 pt-2 backdrop-blur-[22px] backdrop-saturate-[1.6]"
        style={{ background: "color-mix(in srgb, var(--bg) 78%, transparent)" }}
      >
        {NAV_ITEMS.map((item) => {
          const active = activeTab === item.tab;
          return (
            <Link
              key={item.tab}
              to={tabHref(item, activeTab)}
              aria-current={active ? "page" : undefined}
              className="flex min-h-[44px] flex-1 flex-col items-center gap-1 px-0.5 py-[5px] active:scale-90"
              style={{ color: active ? "var(--signal)" : "var(--dim)" }}
            >
              <span className="text-[19px] leading-none">{item.glyph}</span>
              <span className="font-mono text-[8.5px] font-medium tracking-[.3px]">
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default BottomTab;
