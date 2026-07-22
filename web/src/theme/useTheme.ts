import { createContext, useContext } from "react";

export type ThemeMode = "dark" | "light";
export type Accent = "phosphor" | "cyan" | "amber" | "violet";

export interface ThemeContextValue {
  theme: ThemeMode;
  accent: Accent;
  scanlines: boolean;
  setTheme: (theme: ThemeMode) => void;
  setAccent: (accent: Accent) => void;
  setScanlines: (scanlines: boolean) => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}
