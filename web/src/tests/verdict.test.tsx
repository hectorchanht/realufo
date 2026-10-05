import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { VerdictBar } from "../components/VerdictBar";

const mutate = vi.fn();
const toast = vi.fn();
vi.mock("../api/queries", () => ({ useCastVerdict: () => ({ mutate, isPending: false }) }));
vi.mock("../overlays/OverlayProvider", () => ({ useOverlay: () => ({ toast }) }));

beforeEach(() => {
  mutate.mockReset();
  toast.mockReset();
});

describe("VerdictBar", () => {
  it("teases the meter before anybody voted", () => {
    render(<VerdictBar recordId="r1" state={{ mine: null, total: 0 }} />);
    // the visible "WTF-METER" title is hidden; the section keeps its accessible name
    expect(screen.getByRole("region", { name: "WTF-meter" })).toBeTruthy();
    expect(screen.queryByText("WTF-METER")).toBeNull();
    const tease = screen.getByText(/Judge it to reveal the crowd/);
    expect(tease).toHaveTextContent(/^\? \? \? Judge it to reveal the crowd$/);
    expect(screen.getByText("? ? ?").getAttribute("aria-hidden")).toBe("true");
  });

  it("hides the split before voting (count shown) and casts on tap", () => {
    render(<VerdictBar recordId="r1" state={{ mine: null, total: 7 }} />);
    expect(screen.getByText(/Judge it to reveal the crowd/)).toHaveTextContent(/^\? \? \? Judge it to reveal the crowd · 7 verdicts$/);
    expect(screen.queryByRole("img")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "NEED MORE DATA" }));
    expect(mutate).toHaveBeenCalledWith("more_data", expect.any(Object));
  });

  it("under 5 verdicts: early-days line, split still shown, no big number", () => {
    render(
      <VerdictBar recordId="r1" state={{ mine: "unexplained", total: 4, tally: { explained: 1, unexplained: 2, more_data: 1 } }} />
    );
    expect(screen.getByRole("button", { name: "UNEXPLAINED" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe("explained 25%, unexplained 50%, need more data 25%");
    expect(screen.getByText("Early days — 4 verdicts")).toBeTruthy();
    expect(screen.queryByText(/% UNEXPLAINED/)).toBeNull();
  });

  it("5+ verdicts: big unexplained percentage above the split", () => {
    render(
      <VerdictBar recordId="r1" state={{ mine: "explained", total: 24, tally: { explained: 5, unexplained: 17, more_data: 2 } }} />
    );
    expect(screen.getByText("71% UNEXPLAINED").closest("[aria-live]")?.getAttribute("aria-live")).toBe("polite");
    expect(screen.getByText("24 verdicts")).toBeTruthy();
  });

  it("toasts the server message on error", () => {
    mutate.mockImplementation((_v, opts) => opts.onError(new Error("slow down — too many votes")));
    render(<VerdictBar recordId="r1" state={{ mine: null, total: 0 }} />);
    fireEvent.click(screen.getByRole("button", { name: "EXPLAINED" }));
    expect(toast).toHaveBeenCalledWith("slow down — too many votes");
  });

  it("ignores a quick double-tap on the same option (would otherwise clear the vote)", () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1000);
    render(<VerdictBar recordId="r1" state={{ mine: null, total: 0 }} />);
    const btn = screen.getByRole("button", { name: "EXPLAINED" });
    fireEvent.click(btn);
    now.mockReturnValue(1200);
    fireEvent.click(btn);
    expect(mutate).toHaveBeenCalledTimes(1);
    now.mockReturnValue(2000);
    fireEvent.click(btn);
    expect(mutate).toHaveBeenCalledTimes(2);
    now.mockRestore();
  });
});
