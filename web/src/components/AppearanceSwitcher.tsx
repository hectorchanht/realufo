// Accent + scanlines controls, shown in the SiteFooter bottom bar. Dark/light stays
// a one-click ThemeToggle in the header. State + persistence live in ThemeProvider.
import { useTheme, type Accent } from "../theme/useTheme";

const ACCENTS: Accent[] = ["phosphor", "cyan", "amber", "violet"];

// Swatches use the base accent tokens (theme-aware, never re-aliased by
// `[data-accent]`), NOT `var(--signal)`/`var(--grn)`, which follow whichever
// accent is active. Phosphor has no un-aliased token, so it keeps the raw
// theme.css values (dark #4df0a6 / light #00673e).
const ACCENT_SWATCH: Record<Accent, string> = {
  phosphor: "#4df0a6",
  cyan: "var(--cyan)",
  amber: "var(--amber)",
  violet: "var(--violet)",
};

export function AppearanceSwitcher() {
  const { theme, accent, scanlines, setAccent, setScanlines } = useTheme();
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-2" data-appearance-switcher>
      <li className="flex gap-2">
        {ACCENTS.map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => setAccent(a)}
            aria-pressed={accent === a}
            aria-label={a}
            title={a}
            className="h-5 w-5 rounded-full border-2"
            style={{ borderColor: accent === a ? "var(--ink)" : "var(--line2)", background: a === "phosphor" && theme === "light" ? "#00673e" : ACCENT_SWATCH[a] }}
          />
        ))}
      </li>
      <li>
        <button
          type="button"
          onClick={() => setScanlines(!scanlines)}
          aria-pressed={scanlines}
          aria-label="Scanlines"
          className="text-dim hover:text-ink"
        >
          Scanlines: {scanlines ? "on" : "off"}
        </button>
      </li>
    </ul>
  );
}
