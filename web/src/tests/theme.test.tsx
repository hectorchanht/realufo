import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, afterEach } from "vitest";
import { ThemeProvider } from "../theme/ThemeProvider";
import { useTheme } from "../theme/useTheme";
import { ThemeToggle } from "../components/ThemeToggle";
import { AppearanceSwitcher } from "../components/AppearanceSwitcher";
import { TextSizeBadge, TextSizer } from "../components/TextSizer";
import { MemoryRouter } from "react-router-dom";

afterEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.accent;
  delete document.documentElement.dataset.scanlines;
  document.documentElement.style.fontSize = "";
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

describe("text sizer", () => {
  it("steps html font-size up from 100%, stops at 300%, persists", () => {
    render(
      <ThemeProvider>
        <TextSizer />
      </ThemeProvider>,
    );
    const html = document.documentElement;
    expect(html.style.fontSize).toBe("100%");
    const up = screen.getByRole("button", { name: "Larger text" });
    act(() => up.click());
    expect(html.style.fontSize).toBe("110%");
    for (let n = 0; n < 13; n++) act(() => up.click());
    expect(html.style.fontSize).toBe("300%");
    expect(up).toBeDisabled();
    expect(JSON.parse(localStorage.getItem("ufo_theme")!).textScale).toBe(300);
  });

  it("restores a stored size and steps down to 80%", () => {
    localStorage.setItem("ufo_theme", JSON.stringify({ theme: "dark", accent: "phosphor", scanlines: true, textScale: 90 }));
    render(
      <ThemeProvider>
        <TextSizer />
      </ThemeProvider>,
    );
    const down = screen.getByRole("button", { name: "Smaller text" });
    act(() => down.click());
    expect(document.documentElement.style.fontSize).toBe("80%");
    expect(down).toBeDisabled();
  });

  it("ignores a bogus stored size", () => {
    localStorage.setItem("ufo_theme", JSON.stringify({ theme: "dark", accent: "phosphor", scanlines: true, textScale: 999 }));
    render(
      <ThemeProvider>
        <TextSizer />
      </ThemeProvider>,
    );
    expect(document.documentElement.style.fontSize).toBe("100%");
  });
});

describe("text size badge", () => {
  it("the Aa badge opens the sizer", () => {
    render(
      <MemoryRouter>
        <ThemeProvider>
          <TextSizeBadge up style={{ left: 0, top: 0 }} />
        </ThemeProvider>
      </MemoryRouter>,
    );
    expect(screen.queryByRole("button", { name: "Larger text" })).toBeNull();
    act(() => screen.getByRole("button", { name: "Text size" }).click());
    act(() => screen.getByRole("button", { name: "Larger text" }).click());
    expect(document.documentElement.style.fontSize).toBe("110%");
  });
});
