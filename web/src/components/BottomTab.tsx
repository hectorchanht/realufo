// Mobile (<900px) bottom tab bar + home-indicator strip. Ported from
// realufo-handoff/RealUFO.dc.html lines 393-401 (bottom tab) and line 401
// (home indicator). Nav buttons are react-router `Link`s (see TopNav.tsx for
// why). Each tab has a 44px min-height tap target per the task requirement.
import { Link } from "react-router-dom";
import { NAV_ITEMS, type NavTab } from "./navItems";

export interface BottomTabProps {
  activeTab: NavTab;
}

export function BottomTab({ activeTab }: BottomTabProps) {
  return (
    <>
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
              to={item.path}
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
      <div
        data-homeind
        className="flex flex-none justify-center pb-[9px] pt-1.5"
        style={{ background: "color-mix(in srgb, var(--bg) 78%, transparent)" }}
      >
        <div className="h-[5px] w-32 rounded-[3px] bg-line2" />
      </div>
    </>
  );
}

export default BottomTab;
