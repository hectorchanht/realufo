// Desktop (>=900px) top nav bar. Ported from realufo-handoff/RealUFO.dc.html
// lines 80-96: brand block (saucer + REALUFO wordmark) | nav items | online
// indicator + login button. Nav buttons are react-router `Link`s (not the
// prototype's onClick handlers) so the URL bar / back-forward / open-in-tab
// all work for free.
import { Link } from "react-router-dom";
import { Saucer } from "./Saucer";
import { NAV_ITEMS, type NavTab } from "./navItems";

export interface TopNavProps {
  activeTab: NavTab;
  /** Online-visitor count (line 93). Real value wired in a later task once bootstrap data reaches AppShell. */
  onlineNow?: number;
  /** Login/account button label (line 94). Real auth wiring lands in Task 16/23. */
  meLabel?: string;
  onLogin?: () => void;
}

export function TopNav({ activeTab, onlineNow = 0, meLabel = "GUEST", onLogin }: TopNavProps) {
  return (
    <nav
      data-topnav
      className="flex flex-none items-center gap-5 border-b border-line bg-bg2 px-[26px] py-3"
    >
      <div className="flex flex-none items-center gap-[11px] border-r border-line pr-1.5">
        <div className="flex-none">
          <Saucer />
        </div>
        <div className="pr-3.5 leading-[1.1]">
          <div className="font-pixel text-[11px] text-ink">
            REAL<span className="text-signal">UFO</span>
          </div>
          <div className="mt-[5px] font-mono text-[8.5px] tracking-[1px] text-faint">
            DECLASSIFIED ARCHIVE
          </div>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-1">
        {NAV_ITEMS.map((item) => {
          const active = activeTab === item.tab;
          return (
            <Link
              key={item.tab}
              to={item.path}
              aria-current={active ? "page" : undefined}
              className="flex min-h-[44px] flex-none items-center gap-[9px] rounded-[11px] px-3.5 py-2 font-mono text-[13px] font-medium hover:bg-surface"
              style={{
                color: active ? "var(--signal)" : "var(--dim)",
                background: active ? "var(--signal-dim)" : "transparent",
              }}
            >
              <span className="text-center text-[15px]">{item.glyph}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>

      <div className="flex flex-none items-center gap-4">
        <div className="flex items-center gap-2 whitespace-nowrap font-mono text-[11px] text-dim">
          <span className="h-[7px] w-[7px] animate-[blink_1.6s_infinite] rounded-full bg-signal" />
          {onlineNow} online
        </div>
        <button
          type="button"
          onClick={onLogin}
          className="flex-none whitespace-nowrap rounded-[10px] border border-line2 px-4 py-2 font-mono text-xs text-ink hover:border-signal hover:text-signal"
        >
          {meLabel}
        </button>
      </div>
    </nav>
  );
}

export default TopNav;
