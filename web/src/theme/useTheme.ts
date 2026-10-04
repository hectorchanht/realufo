import { createContext, useContext } from "react";

export type ThemeMode = "dark" | "light";
export type Accent = "phosphor" | "cyan" | "amber" | "violet";
/** Site-wide text size, % of the browser default (html font-size). */
export const TEXT_SCALES = [50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 175, 200, 225, 250, 275, 300] as const;
export type TextScale = (typeof TEXT_SCALES)[number];

export interface ThemeContextValue {
  theme: ThemeMode;
  accent: Accent;
  scanlines: boolean;
  textScale: TextScale;
  setTheme: (theme: ThemeMode) => void;
  setAccent: (accent: Accent) => void;
  setScanlines: (scanlines: boolean) => void;
  setTextScale: (textScale: TextScale) => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}
