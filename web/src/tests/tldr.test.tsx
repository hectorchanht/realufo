import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TldrCard } from "../components/TldrCard";

const toast = vi.fn();
vi.mock("../overlays/OverlayProvider", () => ({ useOverlay: () => ({ toast }) }));

const T = {
  bullets: ["CIA cable, July 2008, Harare, Zimbabwe, location unspecified.", "Airport staff watch a light hover 20 min", "No official conclusion in the file"],
  oneLiner: "Even the redactions look nervous.",
  cardUrl: null,
};

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

  it("facts become chips, the report is the headline, no joke", () => {
    render(<TldrCard tldr={T} title="t" onBoring={() => {}} />);
    expect(["CIA cable", "July 2008", "Harare", "Zimbabwe"].map((t) => screen.getByText(t))).toHaveLength(4);
    expect(screen.queryByText(/unspecified/)).toBeNull();
    expect(screen.getByText("Airport staff watch a light hover 20 min")).toHaveClass("text-ink");
    expect(screen.queryByText(/redactions/)).toBeNull();
    expect(screen.getByText("No official conclusion")).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).toBeNull();
    expect(screen.getByText("AI-written with facts")).toBeInTheDocument();
  });

  it("a stated conclusion shows as the finding", () => {
    render(<TldrCard tldr={{ ...T, bullets: [T.bullets[0], T.bullets[1], "Conclusion: AARO found no anomalous performance"] }} title="t" onBoring={() => {}} />);
    expect(screen.getByText("Finding")).toBeInTheDocument();
    expect(screen.getByText("AARO found no anomalous performance")).toBeInTheDocument();
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
    await waitFor(() => expect(share).toHaveBeenCalledWith({ title: "GIMBAL", text: T.bullets[1], url: location.href }));
  });

  it("stamps the card version on the shared link so chat apps re-fetch a re-rendered card", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    (navigator as any).share = share;
    history.pushState(null, "", "/doc/CIA-UAP-003?p=2&v=old");
    const tldr = { ...T, cardUrl: "https://assets.realufo.org/cards/CIA-UAP-003-en-4f1f587a-r2.png" };
    render(<TldrCard tldr={tldr} title="t" onBoring={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /share/i }));
    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(share.mock.calls[0][0].url).toBe(`${location.origin}/doc/CIA-UAP-003?p=2&v=4f1f587a-r2`);
    history.pushState(null, "", "/");
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

  it("the conclusion line starts blurred and reveals on tap", () => {
    render(<TldrCard tldr={{ ...T, bullets: [T.bullets[0], T.bullets[1], "Conclusion: AARO found no anomalous performance"] }} title="t" onBoring={() => {}} />);
    const el = screen.getByText("AARO found no anomalous performance");
    expect(el).toHaveClass("blur-[3px]");
    fireEvent.click(el);
    expect(el).not.toHaveClass("blur-[3px]");
  });

  it("the no-official-conclusion chip is not blurred", () => {
    render(<TldrCard tldr={T} title="t" onBoring={() => {}} />);
    const chip = screen.getByText("No official conclusion");
    expect(chip.className).not.toMatch(/blur/);
  });
});
