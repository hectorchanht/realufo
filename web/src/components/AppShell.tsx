// App frame: CRT background layers + responsive nav (TopNav on desktop,
// AppBar+BottomTab on mobile) + the react-router <Outlet/> for screen content.
//
// Background layers ported from realufo-handoff/RealUFO.dc.html lines 68-70:
//   - radial-glow gradient (line 68) — added here (not in theme.css) per the
//     task brief; the other two layers reuse Task 12's `.crt-grain`/`.crt-scan`
//     classes from theme.css.
//   - `.crt-grain` (line 69) — always rendered.
//   - `.crt-scan` (line 70) — conditional on ThemeProvider's `scanlines` state
//     (the prototype wires this to the same toggle via `sc-if`).
//
// Divergence from the raw prototype worth flagging: in RealUFO.dc.html the
// `data-appbar` block (line 100) has no `sc-if` of its own, i.e. literally it
// renders on every device size, with only `data-topnav`/`data-bottomtab`
// gated by isDesktop/isMobile. This task's brief is explicit that AppShell
// should show *either* TopNav *or* AppBar+BottomTab based on the 900px
// breakpoint, which is what's implemented below — desktop gets the full
// TopNav only, no secondary AppBar underneath it.
import { useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useMediaQuery } from "../lib/useMediaQuery";
import { useTheme } from "../theme/useTheme";
import { TopNav } from "./TopNav";
import { AppBar } from "./AppBar";
import { BottomTab } from "./BottomTab";
import { activeTabForPath, documentTitleForPath, headerForPath } from "./navItems";

export function AppShell() {
  const isDesktop = useMediaQuery("(min-width:900px)");
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { scanlines } = useTheme();

  const activeTab = activeTabForPath(pathname);
  const { title: headerTitle, sub: headerSub } = headerForPath(pathname);
  const canBack = pathname !== "/";

  useEffect(() => {
    document.title = documentTitleForPath(pathname);
  }, [pathname]);

  return (
    <div data-app-shell className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-bg">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(1200px 500px at 78% -8%, var(--signal-dim), transparent 60%), radial-gradient(900px 500px at 10% 108%, rgba(70,223,255,.06), transparent 55%)",
        }}
      />
      <div aria-hidden="true" className="crt-grain" />
      {scanlines && <div aria-hidden="true" className="crt-scan" />}

      <div data-shell className="relative z-10 flex min-h-0 flex-1 flex-col">
        {isDesktop && <TopNav activeTab={activeTab} />}

        <main
          data-scroll
          className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {!isDesktop && (
            <AppBar
              canBack={canBack}
              onBack={() => navigate(-1)}
              showBrand={!canBack}
              headerTitle={headerTitle}
              headerSub={headerSub}
            />
          )}

          <div data-screenpad className="relative px-4 pb-10 pt-[18px]">
            <Outlet />
          </div>
        </main>

        {!isDesktop && <BottomTab activeTab={activeTab} />}
      </div>
    </div>
  );
}

export default AppShell;
