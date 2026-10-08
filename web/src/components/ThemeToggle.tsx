// Dark/light switch for TopNav (desktop) and AppBar (mobile). Theme state +
// persistence live in ThemeProvider; this is just the reachable control.
import { Sun, Moon } from "lucide-react";
import { useTheme } from "../theme/useTheme";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      className={
        "grid flex-none place-items-center rounded-[10px] border border-line2 text-[15px] text-ink active:scale-[.94] hover:border-signal hover:text-signal " +
        className
      }
    >
      {theme === "dark" ? <Sun size={15} strokeWidth={2} aria-hidden="true" /> : <Moon size={15} strokeWidth={2} aria-hidden="true" />}
    </button>
  );
}
