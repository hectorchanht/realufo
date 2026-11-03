import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TldrCard } from "../components/TldrCard";

const T = {
  bullets: ["CIA cable, July 2008, Harare, Zimbabwe, location unspecified.", "Airport staff watch a light hover 20 min", "No official conclusion in the file"],
  oneLiner: "Even the redactions look nervous.",
  cardUrl: null,
};

describe("TldrCard", () => {
  it("renders nothing without a tldr", () => {
    const { container } = render(<TldrCard tldr={null} />);
    expect(container.innerHTML).toBe("");
  });

  it("facts become chips, the report is the headline, no joke", () => {
    render(<TldrCard tldr={T} />);
    expect(["CIA cable", "July 2008", "Harare", "Zimbabwe"].map((t) => screen.getByText(t))).toHaveLength(4);
    expect(screen.queryByText(/unspecified/)).toBeNull();
    expect(screen.getByText("Airport staff watch a light hover 20 min")).toHaveClass("text-ink");
    expect(screen.queryByText(/redactions/)).toBeNull();
    expect(screen.getByText("No official conclusion")).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).toBeNull();
    expect(screen.getByText("AI TL;DR")).toBeInTheDocument();
  });

  it("a stated conclusion shows as the finding", () => {
    render(<TldrCard tldr={{ ...T, bullets: [T.bullets[0], T.bullets[1], "Conclusion: AARO found no anomalous performance"] }} />);
    expect(screen.getByRole("button", { name: "AARO found no anomalous performance" })).toHaveAttribute("aria-expanded", "false");
  });

  it("the conclusion line starts blurred and reveals on tap", () => {
    render(<TldrCard tldr={{ ...T, bullets: [T.bullets[0], T.bullets[1], "Conclusion: AARO found no anomalous performance"] }} />);
    const el = screen.getByText("AARO found no anomalous performance");
    expect(el).toHaveClass("blur-[3px]");
    fireEvent.click(el);
    expect(el).not.toHaveClass("blur-[3px]");
    expect(el).toHaveAttribute("aria-expanded", "true");
  });

  it("the no-official-conclusion chip is not blurred", () => {
    render(<TldrCard tldr={T} />);
    const chip = screen.getByText("No official conclusion");
    expect(chip.className).not.toMatch(/blur/);
  });
});
