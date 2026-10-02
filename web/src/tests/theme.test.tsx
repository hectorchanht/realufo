import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, afterEach } from "vitest";
import { ThemeProvider } from "../theme/ThemeProvider";
import { useTheme } from "../theme/useTheme";
import { ThemeToggle } from "../components/ThemeToggle";
import { AppearanceSwitcher } from "../components/AppearanceSwitcher";

afterEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.accent;
  delete document.documentElement.dataset.scanlines;
});

function Probe() {
  const { accent, theme, setAccent, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="accent">{accent}</span>
      <button onClick={() => setAccent("cyan")}>{accent}</button>
      <button onClick={() => setTheme("light")}>set-light</button>
    </div>
  );
}

describe("ThemeProvider", () => {
  it("defaults to phosphor (no data-accent) and updates html data-accent on setAccent", () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    // phosphor = default green = NO data-accent attribute on <html>
    expect(document.documentElement.hasAttribute("data-accent")).toBe(false);
    expect(screen.getByTestId("accent").textContent).toBe("phosphor");

    act(() => screen.getByRole("button", { name: "phosphor" }).click());
    expect(document.documentElement.getAttribute("data-accent")).toBe("cyan");
  });

  it("updates html data-theme on setTheme", () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    act(() => screen.getByRole("button", { name: "set-light" }).click());
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });
});

describe("ThemeToggle", () => {
  it("flips html data-theme between dark and light", () => {
    localStorage.setItem("ufo_theme", JSON.stringify({ theme: "dark", accent: "phosphor", scanlines: true }));
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    act(() => screen.getByRole("button", { name: "Switch to light mode" }).click());
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    act(() => screen.getByRole("button", { name: "Switch to dark mode" }).click());
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });
});

describe("AppearanceSwitcher", () => {
  it("sets html data-accent and data-scanlines", () => {
    localStorage.setItem("ufo_theme", JSON.stringify({ theme: "dark", accent: "phosphor", scanlines: true }));
    render(
      <ThemeProvider>
        <AppearanceSwitcher />
      </ThemeProvider>,
    );
    act(() => screen.getByRole("button", { name: "amber" }).click());
    expect(document.documentElement.getAttribute("data-accent")).toBe("amber");
    expect(screen.getByRole("button", { name: "amber" })).toHaveAttribute("aria-pressed", "true");
    const scan = screen.getByRole("button", { name: "Scanlines" });
    expect(scan).toHaveAttribute("aria-pressed", "true");
    act(() => scan.click());
    expect(scan).toHaveAttribute("aria-pressed", "false");
  });
});
