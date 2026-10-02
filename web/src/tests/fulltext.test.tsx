import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import FullText from "../components/FullText";

describe("FullText", () => {
  it("image with only an AI visual description: labelled AI section, no FULL TEXT tab", () => {
    render(<FullText data={{ pages: [], truncated: false, total_pages: 0, aiSummary: "A grayscale infrared frame." }} kind="image" onOpenOriginal={() => {}} />);
    expect(screen.getByRole("heading", { name: "AI VISUAL DESCRIPTION" })).toBeInTheDocument();
    expect(screen.getByText("A grayscale infrared frame.")).toBeInTheDocument();
    expect(screen.getByText(/AI-generated from the image · may contain errors/)).toBeInTheDocument();
    expect(screen.queryByText("FULL TEXT")).toBeNull();
  });
  it("nothing at all without pages or an AI summary", () => {
    const { container } = render(<FullText data={{ pages: [], truncated: false, total_pages: 0, aiSummary: null }} kind="image" onOpenOriginal={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
