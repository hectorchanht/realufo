// App frame: CRT background layers + responsive nav + the react-router
// <Outlet/> for screen content.
//
// Background layers ported from realufo-handoff/RealUFO.dc.html lines 68-70:
//   - radial-glow gradient (line 68) — added here (not in theme.css) per the
//     task brief; the other two layers reuse Task 12's `.crt-grain`/`.crt-scan`
//     classes from theme.css.
//   - `.crt-grain` (line 69) — always rendered.
//   - `.crt-scan` (line 70) — conditional on ThemeProvider's `scanlines` state
//     (the prototype wires this to the same toggle via `sc-if`).
//
// Nav layering matches the prototype exactly: `data-topnav` (line 80) and
// `data-bottomtab` (line 393) ARE device-gated (isDesktop/isMobile), but
// `data-appbar` (line 100) has NO `sc-if` of its own — it renders on every
// device size, inside `<main data-scroll>`, above the screen content. On
// desktop it sits as a secondary sticky bar under TopNav carrying the back
// button + per-screen title (needed since TopNav itself has no back
// affordance for detail screens like /doc/:id).
//
// `<PageTitleProvider>` (Task 23b — lib/pageTitle.tsx) wraps AppBar + the
// Outlet screens together, right here, so it's an ancestor of both: AppBar
// reads the live `{title,sub}` from context, and whichever screen the
// router mounts into `<Outlet/>` pushes its own contextual value into that
// same context via `useSetPageTitle`. This replaces the old purely
// path-based `headerForPath`/`documentTitleForPath` lookup (navItems.ts),
// which had no way to reflect a detail screen's actually-loaded data (every
// /doc/:id showed the same generic "FILE", regardless of record).
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useMediaQuery } from "../lib/useMediaQuery";
import { useTheme } from "../theme/useTheme";
import { PageTitleProvider } from "../lib/pageTitle";
import { TopNav } from "./TopNav";
import { AppBar } from "./AppBar";
import { BottomTab } from "./BottomTab";
import { activeTabForPath, canBackForPath } from "./navItems";

export function AppShell() {
  const isDesktop = useMediaQuery("(min-width:900px)");
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { scanlines } = useTheme();

  const activeTab = activeTabForPath(pathname);
  // canBack ports the prototype's `hist.length>0` (back only on detail
  // screens — switching top-level tabs resets its history) — see
  // navItems.ts's canBackForPath doc comment.
  const canBack = canBackForPath(pathname);

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
          <PageTitleProvider>
            <AppBar canBack={canBack} onBack={() => navigate(-1)} showBrand={!canBack} />

            <div data-screenpad className="relative px-4 pb-10 pt-[18px]">
              <Outlet />
            </div>
          </PageTitleProvider>
        </main>

        {!isDesktop && <BottomTab activeTab={activeTab} />}
      </div>
    </div>
  );
}

export default AppShell;
