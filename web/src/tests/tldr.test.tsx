import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TldrCard } from "../components/TldrCard";

const toast = vi.fn();
vi.mock("../overlays/OverlayProvider", () => ({ useOverlay: () => ({ toast }) }));

const T = { bullets: ["Navy pilots film it", "Radar for two weeks", "Still unresolved"], oneLiner: "Even the redactions look nervous.", cardUrl: null };

beforeEach(() => toast.mockReset());
afterEach(() => {
  delete (navigator as any).share;
  delete (navigator as any).clipboard;
});

describe("TldrCard", () => {
  it("renders nothing without a tldr", () => {
    const { container } = render(<TldrCard tldr={null} title="t" onBoring={() => {}} />);
    expect(container.innerHTML).toBe("");
  });

  it("shows the one-liner and three bullets", () => {
    render(<TldrCard tldr={T} title="t" onBoring={() => {}} />);
    // one-liner in ink for contrast; only the curly quotes carry the signal colour
    const p = screen.getByText("Even the redactions look nervous.");
    expect(p).toHaveTextContent(/^“Even the redactions look nervous\.”$/);
    expect(p).toHaveClass("text-ink");
    expect(screen.getByText("“")).toHaveStyle({ color: "var(--signal)" });
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText("AI-written with facts")).toBeInTheDocument();
  });

  it("share refused (not cancelled) falls back to copying the link", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    (navigator as any).share = vi.fn().mockRejectedValue(Object.assign(new Error("x"), { name: "NotAllowedError" }));
    (navigator as any).clipboard = { writeText };
    render(<TldrCard tldr={T} title="t" onBoring={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /share/i }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Link copied"));
    expect(writeText).toHaveBeenCalledWith(location.href);
  });

  it("shares with the Web Share API when present", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    (navigator as any).share = share;
    render(<TldrCard tldr={T} title="GIMBAL" onBoring={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /share/i }));
    await waitFor(() => expect(share).toHaveBeenCalledWith({ title: "GIMBAL", text: T.oneLiner, url: location.href }));
  });

  it("cancelled share sheet does nothing", async () => {
    const writeText = vi.fn();
    (navigator as any).share = vi.fn().mockRejectedValue(Object.assign(new Error("x"), { name: "AbortError" }));
    (navigator as any).clipboard = { writeText };
    render(<TldrCard tldr={T} title="t" onBoring={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /share/i }));
    await new Promise((r) => setTimeout(r, 0));
    expect(toast).not.toHaveBeenCalled();
    expect(writeText).not.toHaveBeenCalled();
  });

  it("falls back to copying the link", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    (navigator as any).clipboard = { writeText };
    render(<TldrCard tldr={T} title="t" onBoring={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /share/i }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Link copied"));
    expect(writeText).toHaveBeenCalledWith(location.href);
  });

  it("boring version calls onBoring", () => {
    const onBoring = vi.fn();
    render(<TldrCard tldr={T} title="t" onBoring={onBoring} />);
    fireEvent.click(screen.getByRole("button", { name: /boring version/i }));
    expect(onBoring).toHaveBeenCalled();
  });
});
