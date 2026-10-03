// useAutoplayInView: plays videos ≥60% on screen. Stubs IntersectionObserver
// (jsdom has none) to record observed targets and fire the callback by hand.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { useMemo, useState } from "react";
import { useAutoplayInView } from "../lib/useAutoplayInView";

let observed: Element[] = [];
let fire: IntersectionObserverCallback = () => {};
vi.stubGlobal(
  "IntersectionObserver",
  class {
    constructor(cb: IntersectionObserverCallback) {
      fire = cb;
    }
    observe(t: Element) {
      observed.push(t);
    }
    disconnect() {}
  }
);
afterEach(() => {
  observed = [];
  vi.restoreAllMocks();
});

// The list stays the same array while the container mounts later — the Shorts
// player's "cached list, loader first" path.
function LateRoot() {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [on, setOn] = useState(false);
  const list = useMemo(() => [1], []);
  useAutoplayInView(el, [list]);
  return (
    <>
      <button onClick={() => setOn(true)}>mount</button>
      {on && (
        <div ref={setEl}>
          <video data-testid="v" />
        </div>
      )}
    </>
  );
}

describe("useAutoplayInView", () => {
  it("observes videos of a container that mounts after the list is already known", () => {
    render(<LateRoot />);
    fireEvent.click(screen.getByText("mount"));
    expect(observed).toContain(screen.getByTestId("v"));
  });

  it("an unmuted video the browser won't autoplay falls back to muted and plays", async () => {
    render(<LateRoot />);
    fireEvent.click(screen.getByText("mount"));
    const v = screen.getByTestId("v") as HTMLVideoElement;
    v.muted = false;
    const play = vi.spyOn(HTMLMediaElement.prototype, "play")
      .mockRejectedValueOnce(new DOMException("blocked", "NotAllowedError"))
      .mockResolvedValue(undefined);
    await act(async () => {
      fire([{ target: v, isIntersecting: true } as unknown as IntersectionObserverEntry], {} as IntersectionObserver);
    });
    expect(play).toHaveBeenCalledTimes(2);
    expect(v.muted).toBe(true);
  });
});
