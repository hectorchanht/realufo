// "Resume where you left off" for the installed PWA.
//
// Even with in-window PDF navigation (lib/pwaNav.ts), Android can still kill
// the PWA process while the (heavy) PDF viewer is in the foreground — or the
// user can swipe the app away from the PDF view. Without this, every cold
// start lands on start_url ("/") and the record page context is lost.
import { isStandalone } from "./install";

const KEY = "realufo:lastRoute";
// Only resume a *recent* visit: a genuinely fresh launch (hours later)
// should still land on the homepage.
const TTL_MS = 15 * 60 * 1000;

/** Remember the current SPA route. Visiting "/" clears it (nothing to resume). */
export function saveLastRoute(path: string): void {
  try {
    if (path === "/") {
      localStorage.removeItem(KEY);
      return;
    }
    localStorage.setItem(KEY, JSON.stringify({ path, ts: Date.now() }));
  } catch {
    // Private mode / storage disabled: resume silently unavailable.
  }
}

/** The saved route if it is well-formed and fresh, else null. */
export function readLastRoute(now: number = Date.now()): string | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { path, ts } = parsed as { path?: unknown; ts?: unknown };
    if (typeof path !== "string" || !path.startsWith("/") || typeof ts !== "number") return null;
    if (now - ts > TTL_MS) return null;
    return path;
  } catch {
    return null;
  }
}

export interface RestoreDeps {
  loc?: { pathname: string; search: string };
  hist?: { replaceState: History["replaceState"] };
  standalone?: boolean;
}

/**
 * Call once, BEFORE the router is created (it snapshots window.location):
 * a cold start at "/" in the installed PWA jumps straight to the last
 * visited page instead of the homepage. Deep links and shared URLs win —
 * only a bare start_url launch is rewritten. Deps are injectable for tests.
 */
export function restoreLastRoute(deps?: RestoreDeps): void {
  if (typeof window === "undefined") return;
  const { loc = window.location, hist = window.history, standalone = isStandalone() } = deps ?? {};
  if (!standalone) return;
  if (loc.pathname !== "/" || loc.search) return;
  const path = readLastRoute();
  if (path && path !== "/") hist.replaceState(null, "", path);
}
