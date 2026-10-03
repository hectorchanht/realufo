// Accent + scanlines controls, shown in the SiteFooter bottom bar. Dark/light stays
// a one-click ThemeToggle in the header. State + persistence live in ThemeProvider.
import { useTheme, type Accent } from "../theme/useTheme";

const ACCENTS: Accent[] = ["phosphor", "cyan", "amber", "violet"];

// Fixed swatch colors (dark-theme hex values from theme.css) — NOT the live
// `var(--signal)`/`var(--grn)` tokens, because those two get re-aliased to
// whichever accent is currently active (theme.css `[data-accent="..."]`
// blocks), so they can't represent "what would cyan/amber/violet look like"
// while a different accent is selected.
const ACCENT_SWATCH: Record<Accent, string> = {
  phosphor: "#4df0a6",
  cyan: "#46dfff",
  amber: "#ffb648",
  violet: "#b39bff",
};

export function AppearanceSwitcher() {
  const { accent, scanlines, setAccent, setScanlines } = useTheme();
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-2" data-appearance-switcher>
      <li className="flex gap-1.5">
        {ACCENTS.map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => setAccent(a)}
            aria-pressed={accent === a}
            aria-label={a}
            title={a}
            className="h-5 w-5 rounded-full border-2"
            style={{ borderColor: accent === a ? "var(--ink)" : "var(--line2)", background: ACCENT_SWATCH[a] }}
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
