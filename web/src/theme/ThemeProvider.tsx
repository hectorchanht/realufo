import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ThemeContext, type Accent, type ThemeMode } from "./useTheme";

const STORAGE_KEY = "ufo_theme";

interface StoredTheme {
  theme: ThemeMode;
  accent: Accent;
  scanlines: boolean;
}

function readStoredTheme(): StoredTheme | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredTheme>;
    if (parsed.theme !== "dark" && parsed.theme !== "light") return null;
    const accent: Accent =
      parsed.accent === "cyan" ||
      parsed.accent === "amber" ||
      parsed.accent === "violet" ||
      parsed.accent === "phosphor"
        ? parsed.accent
        : "phosphor";
    const scanlines = typeof parsed.scanlines === "boolean" ? parsed.scanlines : true;
    return { theme: parsed.theme, accent, scanlines };
  } catch {
    return null;
  }
}

function getPreferredTheme(): ThemeMode {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "dark";
  }
  // Default is dark; only fall back to light when the system explicitly
  // prefers light (i.e. prefers-color-scheme: dark does NOT match).
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function initialState(): StoredTheme {
  const stored = readStoredTheme();
  if (stored) return stored;
  return { theme: getPreferredTheme(), accent: "phosphor", scanlines: true };
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StoredTheme>(initialState);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = state.theme;
    // phosphor is the :root default green signal — no data-accent attribute.
    if (state.accent === "phosphor") {
      delete root.dataset.accent;
    } else {
      root.dataset.accent = state.accent;
    }
    root.dataset.scanlines = String(state.scanlines);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // localStorage unavailable (private mode, quota, etc.) — theme still
      // applies for this session, just isn't persisted.
    }
  }, [state]);

  const value = useMemo(
    () => ({
      theme: state.theme,
      accent: state.accent,
      scanlines: state.scanlines,
      setTheme: (theme: ThemeMode) => setState((s) => ({ ...s, theme })),
      setAccent: (accent: Accent) => setState((s) => ({ ...s, accent })),
      setScanlines: (scanlines: boolean) => setState((s) => ({ ...s, scanlines })),
    }),
    [state],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
