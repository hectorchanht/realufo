import { render, screen, act } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ThemeProvider } from "../theme/ThemeProvider";
import { useTheme } from "../theme/useTheme";

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
