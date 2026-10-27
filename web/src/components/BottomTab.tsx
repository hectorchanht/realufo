// Mobile (<900px) bottom tab bar. Ported from
// realufo-handoff/RealUFO.dc.html lines 393-400 (the prototype's fake
// home-indicator strip, line 401, is dropped — real phones draw their own). Nav buttons are react-router `Link`s (see TopNav.tsx for
// why). Each tab has a 44px min-height tap target per the task requirement.
import { useState, type Ref } from "react";
import { Link, useLocation } from "react-router-dom";
import { MoreMenu } from "./MoreMenu";
import { retapTab, tabHref, useNavItems, type NavTab } from "./navItems";

export interface BottomTabProps {
  activeTab: NavTab;
  /** Scroll-linked hide progress 0..1 (AppShell's useHideOnScroll): the bar
   *  slides down in proportion to scroll travel. Keyboard focus brings it back. */
  hideProgress?: number;
  /** Wrapper ref — AppShell measures it to publish --bnav-h. */
  ref?: Ref<HTMLDivElement>;
}

// Overlays the bottom of the shell (absolute) rather than sitting in flow, so
// sliding it out never resizes the scroll container — see AppShell.
export function BottomTab({ activeTab, hideProgress = 0, ref }: BottomTabProps) {
  // Four icon tabs + More; only the active one shows its label.
  const { tabs, more } = useNavItems();
  const here = useLocation();
  const [focusWithin, setFocusWithin] = useState(false);
  const p = focusWithin ? 0 : hideProgress;
  return (
    <div
      ref={ref}
      data-hidden={p >= 0.999 || undefined}
      onFocusCapture={() => setFocusWithin(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusWithin(false);
      }}
      className={
        "absolute inset-x-0 bottom-0 z-30 motion-reduce:transition-none" +
        // Scroll-driven movement is transform-only (no transition — the bar
        // tracks the finger); only the focus reveal animates.
        (focusWithin ? " transition-transform duration-300 ease-[cubic-bezier(.32,.72,0,1)]" : "")
      }
      style={{ transform: p ? `translateY(${p * 100}%)` : undefined }}
    >
      <div
        data-bottomtab
        className="relative z-30 flex flex-none justify-around border-t border-line px-2 pt-2 backdrop-blur-[22px] backdrop-saturate-[1.6] pb-[max(4px,env(safe-area-inset-bottom))]"
        style={{ background: "color-mix(in srgb, var(--bg) 78%, transparent)" }}
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
    </div>
  );
}

export default BottomTab;
