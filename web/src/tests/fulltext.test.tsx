import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import FullText from "../components/FullText";

const data = { pages: [{ n: 1, text: "one" }, { n: 2, text: "two" }], truncated: true, total_pages: 9, aiSummary: "summary" };

describe("FullText ?p= page deep-link", () => {
  it("opens the text view and marks the page", () => {
    const { container } = render(<FullText data={data} page={2} onOpenOriginal={() => {}} />);
    expect(screen.queryByText("summary")).toBeNull();
    expect(container.querySelector('[data-page="2"]')?.className).toContain("ring-signal");
    expect(container.querySelector('[data-page="1"]')?.className).not.toContain("ring-signal");
  });
  it("a page beyond the extracted text offers the original file", () => {
    const open = vi.fn();
    render(<FullText data={data} page={7} onOpenOriginal={open} />);
    screen.getByText(/Page 7 isn't in the extracted text/).click();
    expect(open).toHaveBeenCalled();
  });
});
