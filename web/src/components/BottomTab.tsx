// Mobile (<900px) bottom tab bar. Ported from
// realufo-handoff/RealUFO.dc.html lines 393-400 (the prototype's fake
// home-indicator strip, line 401, is dropped — real phones draw their own). Nav buttons are react-router `Link`s (see TopNav.tsx for
// why). Each tab has a 44px min-height tap target per the task requirement.
import type { Ref } from "react";
import { Link, useLocation } from "react-router-dom";
import { MoreMenu } from "./MoreMenu";
import { TextSizeBadge, biteMask } from "./TextSizer";
import { retapTab, tabHref, useNavItems, type NavTab } from "./navItems";

export interface BottomTabProps {
  activeTab: NavTab;
  /** Slid down out of view (AppShell's scroll-down auto-hide). Keyboard focus brings it back. */
  hidden?: boolean;
  /** Wrapper ref — AppShell measures it to publish --bnav-h. */
  ref?: Ref<HTMLDivElement>;
}

// Overlays the bottom of the shell (absolute) rather than sitting in flow, so
// sliding it out never resizes the scroll container — see AppShell.
const BITE_RIGHT = 22; // bite / badge centre, px in from the bar's right edge, on its top border
const BAR_BITE = biteMask(`calc(100% - ${BITE_RIGHT}px)`, "0px");

export function BottomTab({ activeTab, hidden = false, ref }: BottomTabProps) {
  // Four icon tabs + More; only the active one shows its label.
  const { tabs, more } = useNavItems();
  const here = useLocation();
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
        style={{ background: "color-mix(in srgb, var(--bg) 78%, transparent)", ...BAR_BITE }}
      >
        {tabs.map((item) => {
          const active = activeTab === item.tab;
          const href = tabHref(item, activeTab);
          const Icon = item.icon;
          return (
            <Link
              key={item.tab}
              to={href}
              onClick={active ? () => retapTab(href, here) : undefined}
              aria-current={active ? "page" : undefined}
              className="flex min-h-[44px] flex-1 flex-col items-center justify-center gap-1 px-0.5 py-[5px] active:scale-90"
              style={{ color: active ? "var(--signal)" : "var(--dim)" }}
            >
              <Icon size={22} aria-hidden="true" />
              <span className={active ? "font-mono text-[9px] font-medium tracking-[.3px]" : "sr-only"}>{item.label}</span>
            </Link>
          );
        })}
        <MoreMenu sheet items={more} activeTab={activeTab} />
      </div>
      {/* Text size "Aa" sits in an Apple-logo bite out of the bar's top-right corner. */}
      <TextSizeBadge up style={{ left: `calc(100% - ${BITE_RIGHT}px)`, top: 0 }} />
    </div>
  );
}

export default BottomTab;
