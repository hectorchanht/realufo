import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import FullText from "../components/FullText";

const data = { pages: [{ n: 1, text: "one" }, { n: 2, text: "two" }], truncated: true, total_pages: 9, aiSummary: "summary" };
const never = () => new Promise<never>(() => {});

describe("FullText paginated view", () => {
  it("?p=N opens the text view on that page only", () => {
    render(<FullText id="X" data={data} page={2} load={never} onOpenOriginal={() => {}} />);
    expect(screen.queryByText("summary")).toBeNull();
    expect(screen.getByText("two")).toBeInTheDocument();
    expect(screen.queryByText("one")).toBeNull();
    expect(screen.getByText("PAGE 2 / 9")).toBeInTheDocument();
  });

  it("prev/next turn pages and report the page number", () => {
    const onPage = vi.fn();
    render(<FullText id="X" data={data} page={1} load={never} onPageChange={onPage} onOpenOriginal={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByText("two")).toBeInTheDocument();
    expect(onPage).toHaveBeenLastCalledWith(2);
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Previous page" }));
    expect(screen.getByText("one")).toBeInTheDocument();
  });

  it("Markdown is the default; JSON shows the current page as data", () => {
    render(<FullText id="X" data={data} page={2} load={never} onOpenOriginal={() => {}} />);
    expect(screen.getByRole("button", { name: "MD" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "JSON" }));
    expect(screen.getByText(/"n": 2/)).toBeInTheDocument();
    expect(screen.getByText(/"text": "two"/)).toBeInTheDocument();
  });

  it("loads every page of the file and drops the capped-text notice", async () => {
    const all = [{ n: 1, text: "one" }, { n: 2, text: "two" }, { n: 3, text: "three", src: "ocr" }];
    const load = vi.fn().mockResolvedValue(all);
    render(<FullText id="NASA 1.pdf" data={data} page={1} load={load} onOpenOriginal={() => {}} />);
    await act(async () => {});
    expect(load).toHaveBeenCalledWith("NASA 1.pdf");
    expect(screen.getByText("PAGE 1 / 3")).toBeInTheDocument();
    expect(screen.queryByText(/Text continues in the original file/)).toBeNull();
  });

  it("links the whole text as Markdown and JSON", () => {
    render(<FullText id="NASA 1.pdf" data={data} page={1} load={never} onOpenOriginal={() => {}} />);
    expect(screen.getByRole("link", { name: /\.md/ })).toHaveAttribute("href", "/doc/NASA%201.pdf/text");
    expect(screen.getByRole("link", { name: /\.json/ })).toHaveAttribute("href", "/doc/NASA%201.pdf/text?format=json");
  });

  it("a page beyond the extracted text offers the original file", () => {
    const open = vi.fn();
    render(<FullText id="X" data={data} page={7} load={never} onOpenOriginal={open} />);
    screen.getByText(/Page 7 isn't in the extracted text/).click();
    expect(open).toHaveBeenCalled();
  });

  it("a ?p=N link scrolls the block into view; turning pages doesn't", () => {
    const into = vi.fn();
    Element.prototype.scrollIntoView = into;
    const { rerender } = render(<FullText id="X" data={data} page={2} load={never} onOpenOriginal={() => {}} />);
    expect(into).toHaveBeenCalledTimes(1);
    const onPage = vi.fn();
    rerender(<FullText id="X" data={data} page={2} load={never} onPageChange={onPage} onOpenOriginal={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Previous page" }));
    rerender(<FullText id="X" data={data} page={1} load={never} onPageChange={onPage} onOpenOriginal={() => {}} />);
    expect(into).toHaveBeenCalledTimes(1);
  });

  it("a new page starts at the top of the text box", () => {
    render(<FullText id="X" data={data} page={1} load={never} onOpenOriginal={() => {}} />);
    const box = screen.getByLabelText("Full text page");
    box.scrollTop = 300;
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByLabelText("Full text page").scrollTop).toBe(0);
  });

  it("MD view renders the lossless formatting: headings, bold labels, line breaks", () => {
    const memo = { ...data, pages: [{ n: 1, text: "ESTIMATE OF THE SITUATION\nALDRIN Yes, we saw it.\nShort line\nNext short" }] };
    render(<FullText id="X" data={memo} page={1} load={never} onOpenOriginal={() => {}} />);
    expect(screen.getByRole("heading", { name: "ESTIMATE OF THE SITUATION" })).toBeInTheDocument();
    expect(screen.getByText("ALDRIN").tagName).toBe("STRONG");
    const box = screen.getByLabelText("Full text page");
    expect(box.querySelectorAll("br").length).toBeGreaterThan(0);
    expect(box.textContent).not.toContain("**");
  });
});
