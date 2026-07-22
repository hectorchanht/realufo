// Tiny matchMedia hook used by AppShell to pick TopNav (desktop) vs
// AppBar+BottomTab (mobile) at the 900px breakpoint (see
// docs/superpowers/FRONTEND-CONTEXT.md "Routing (Task 14)").
//
// SSR/test-safe: `window.matchMedia` doesn't exist during server rendering, and
// jsdom's implementation (or absence of one, depending on version) always reports
// `matches: false` since it never measures a real viewport — both cases fall back
// to `false` (mobile layout), which is what the shell test relies on.
import { useEffect, useState } from "react";

function getMatches(query: string): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(query).matches;
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => getMatches(query));

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const mql = window.matchMedia(query);
    const listener = (event: MediaQueryListEvent) => setMatches(event.matches);

    setMatches(mql.matches);

    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", listener);
      return () => mql.removeEventListener("change", listener);
    }
    // Safari <14 fallback — addListener/removeListener are deprecated but still
    // the only API on older WebKit.
    mql.addListener(listener);
    return () => mql.removeListener(listener);
  }, [query]);

  return matches;
}
