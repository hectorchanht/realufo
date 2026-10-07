// VideoTransport: compact grouped mobile layout + busy spinners.
// - Controls sit in two labeled pills (Playback / Tools) so the row takes
//   at most two rows on narrow screens: [play][timecode] | [◀][Fnnn][▶]
//   then [mute][full][download][adjust][link][capture][post].
// - The frame stepper [◀][Fnnn][▶] stays together as one non-wrapping unit.
// - Both capture buttons (save + post to discussion) show a spinner while
//   the frame grab is busy.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { VideoTransport } from "../components/VideoTools";
import type { VideoCtl } from "../lib/useVideoTransport";

function mockCtl(over: Partial<VideoCtl> = {}): VideoCtl {
  return {
    t: 8.82,
    dur: 19.23,
    playing: false,
    rate: 1,
    loop: false,
    muted: true,
    ab: null,
    capture: "idle",
    full: false,
    frame: 264,
    abLabel: "Loop A–B: set A",
    now: () => 8.82,
    togglePlay: vi.fn(),
    stepFrame: vi.fn(),
    seek: vi.fn(),
    setRate: vi.fn(),
    cycleRate: vi.fn(),
    toggleLoop: vi.fn(),
    markAb: vi.fn(),
    toggleMute: vi.fn(),
    toggleFull: vi.fn(),
    download: vi.fn(),
    grab: vi.fn(async () => {}),
    ...over,
  };
}

function setup(over: Partial<VideoCtl> = {}) {
  const ctl = mockCtl(over);
  render(
    <VideoTransport
      ctl={ctl}
      keys={false}
      onShare={vi.fn()}
      adjustOpen={false}
      onToggleAdjust={vi.fn()}
      adjustChanged={false}
    />,
  );
  return ctl;
}

describe("VideoTransport layout", () => {
  it("groups controls into two labeled, non-wrapping pills", () => {
    setup();
    for (const label of ["Playback", "Tools"]) {
      const g = screen.getByRole("group", { name: label });
      expect(g.className).toContain("inline-flex");
      expect(g.className).toContain("flex-nowrap");
    }
  });

  it("frame stepper keeps [prev][F-count][next] together inside the Playback pill", () => {
    const ctl = setup();
    const group = screen.getByRole("group", { name: "Playback" });
    const prev = screen.getByRole("button", { name: "Previous frame" });
    const next = screen.getByRole("button", { name: "Next frame" });
    expect(group.contains(prev)).toBe(true);
    expect(group.contains(next)).toBe(true);
    // the F-count sits between the two arrows inside the same pill
    expect(group.textContent).toMatch(/F\d+/);
    fireEvent.click(prev);
    expect(ctl.stepFrame).toHaveBeenCalledWith(-1);
    fireEvent.click(next);
    expect(ctl.stepFrame).toHaveBeenCalledWith(1);
  });

  it("both capture buttons show a spinner while the grab is busy", () => {
    setup({ capture: "busy" });
    const saveBtn = screen.getByRole("button", { name: "Capture frame" });
    const postBtn = screen.getByRole("button", { name: "Post frame to discussion" });
    expect(saveBtn).toBeDisabled();
    expect(postBtn).toBeDisabled();
    // Lucide LoaderCircle renders an svg with the animate-spin class
    for (const btn of [saveBtn, postBtn]) {
      const svg = btn.querySelector("svg");
      expect(svg?.className.baseVal ?? String(svg?.getAttribute("class"))).toContain("animate-spin");
    }
  });

  it("capture buttons show their normal icons when idle", () => {
    setup({ capture: "idle" });
    expect(screen.getByRole("button", { name: "Capture frame" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Post frame to discussion" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Post frame to discussion" }).querySelector("svg")?.getAttribute("class")).not.toContain("animate-spin");
  });
});
