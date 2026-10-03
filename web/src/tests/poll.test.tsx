import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PollCard } from "../components/PollCard";
import type { PollState } from "../api/types";

const mutate = vi.fn();
const toast = vi.fn();
let data: PollState | undefined;
vi.mock("../api/queries", () => ({
  usePoll: () => ({ data }),
  useCastPoll: () => ({ mutate, isPending: false }),
}));
vi.mock("../overlays/OverlayProvider", () => ({ useOverlay: () => ({ toast }) }));

const BASE = { q: "Balloon or craft?", opts: ["Balloon", "Drone", "Unknown craft", "Need more data"], social: [] };
beforeEach(() => {
  mutate.mockReset();
  toast.mockReset();
  data = undefined;
});

describe("PollCard", () => {
  it("renders nothing without a poll (404 / loading)", () => {
    const { container } = render(<PollCard slug="s" />);
    expect(container.innerHTML).toBe("");
  });

  it("before voting: question, tease with count, no percentages; tap casts", () => {
    data = { ...BASE, mine: null, total: 7 };
    render(<PollCard slug="s" />);
    expect(screen.getByText("CROWD POLL")).toBeTruthy();
    expect(screen.getByText("Balloon or craft?")).toBeTruthy();
    expect(screen.getByText(/Vote to reveal the crowd/)).toHaveTextContent(/^\? \? \? Vote to reveal the crowd · 7 votes$/);
    expect(screen.queryByText(/%/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Drone/ }));
    expect(mutate).toHaveBeenCalledWith(1, expect.any(Object));
  });

  it("under 5 votes: early days, mine pressed, no percentages", () => {
    data = { ...BASE, mine: 0, total: 3, tally: [2, 1, 0, 0] };
    render(<PollCard slug="s" />);
    expect(screen.getByRole("button", { name: /Balloon/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Early days — 3 votes")).toBeTruthy();
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it("5+ votes: percentage per option, total in a live region", () => {
    data = { ...BASE, mine: 2, total: 20, tally: [10, 5, 4, 1] };
    render(<PollCard slug="s" />);
    expect(screen.getByRole("button", { name: /Balloon/ })).toHaveTextContent("50%");
    expect(screen.getByRole("button", { name: /Need more data/ })).toHaveTextContent("5%");
    expect(screen.getByText("20 votes").closest("[aria-live]")?.getAttribute("aria-live")).toBe("polite");
  });

  it("social line shows the top option on X, before voting too; (final) when closed", () => {
    data = { ...BASE, mine: null, total: 0, social: [{ platform: "x", counts: [71, 20, 5, 4], total: 100, closed: true }] };
    render(<PollCard slug="s" />);
    expect(screen.getByText("On X: 71% Balloon · 100 votes (final)")).toBeTruthy();
  });

  it("toasts the server message on error; ignores a quick double-tap", () => {
    data = { ...BASE, mine: null, total: 0 };
    mutate.mockImplementation((_o, opts) => opts.onError(new Error("slow down — too many votes")));
    const now = vi.spyOn(Date, "now").mockReturnValue(1000);
    render(<PollCard slug="s" />);
    const btn = screen.getByRole("button", { name: /Balloon/ });
    fireEvent.click(btn);
    now.mockReturnValue(1200);
    fireEvent.click(btn);
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith("slow down — too many votes");
    now.mockRestore();
  });
});
