import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, act, waitFor, within } from "@testing-library/react";
import type { Short } from "../api/types";
import { renderAppAt } from "./util";

const all: Short[] = [
  { id: "A-1", title: "First", thumb: null, clip: "https://c/A-1.mp4", showcase: true },
  { id: "B 2", title: "Second", thumb: null, clip: "https://c/B%202.mp4" },
  { id: "C-3", title: "Third", thumb: null, clip: "https://c/C-3.mp4" },
];
const useShortsMock = vi.fn();
vi.mock("../api/queries", () => ({
  useBootstrap: () => ({ data: undefined, isLoading: false }),
  useHubs: () => ({ data: { hubs: [] } }),
  useShorts: (q: string, o?: { enabled?: boolean }) => useShortsMock(q, o),
}));
// jsdom has no IntersectionObserver: record the callback so a test can "swipe".
let fire: IntersectionObserverCallback = () => {};
vi.stubGlobal(
  "IntersectionObserver",
  class {
    constructor(cb: IntersectionObserverCallback) {
      fire = cb;
    }
    observe() {}
    disconnect() {}
  }
);
const scrolled: Element[] = [];
Element.prototype.scrollIntoView = function (this: Element) {
  scrolled.push(this);
};
const scrollBy = vi.fn();
Element.prototype.scrollBy = scrollBy as unknown as Element["scrollBy"];
vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});

beforeEach(() => {
  scrolled.length = 0;
  scrollBy.mockClear();
  useShortsMock.mockReset();
  useShortsMock.mockImplementation((q: string) =>
    q ? { data: all.filter((s) => s.title!.toLowerCase().includes(q)), isFetched: true } : { data: all, isFetched: true }
  );
});

// jsdom media elements have no real timeline: give one a settable clock.
const clockOn = (v: HTMLVideoElement, duration: number, paused = false) => {
  let at = 0;
  Object.defineProperty(v, "duration", { configurable: true, value: duration });
  Object.defineProperty(v, "paused", { configurable: true, get: () => paused });
  Object.defineProperty(v, "currentTime", { configurable: true, get: () => at, set: (x: number) => (at = x) });
  return (t: number) => {
    at = t;
    fireEvent(v, new Event("timeupdate"));
  };
};

describe("Shorts player", () => {
  it("each slide snaps on its own (one swipe = one Short)", async () => {
    renderAppAt("/shorts/A-1");
    const videos = await screen.findAllByTestId("short-video");
    expect(videos.every((v) => v.closest("section")!.classList.contains("snap-always"))).toBe(true);
  });

  it("progress bar follows playback and ←/→ seek 5 s", async () => {
    renderAppAt("/shorts/A-1");
    const v = (await screen.findAllByTestId("short-video"))[0] as HTMLVideoElement;
    const at = clockOn(v, 24, true);
    act(() => at(6));
    const bar = screen.getAllByRole("slider", { name: "Seek" })[0];
    expect(bar).toHaveAttribute("aria-valuetext", "0:06 of 0:24");
    expect(bar.querySelector(".bg-signal")).toHaveStyle({ width: "25%" });
    fireEvent.keyDown(bar, { key: "ArrowRight" });
    expect(v.currentTime).toBe(11);
    fireEvent.keyDown(bar, { key: "ArrowLeft" });
    fireEvent.keyDown(bar, { key: "ArrowLeft" });
    fireEvent.keyDown(bar, { key: "ArrowLeft" });
    expect(v.currentTime).toBe(0);
  });

  it("tapping a video pauses / plays it (sound stays put) and flashes the icon", async () => {
    renderAppAt("/shorts/A-1");
    const v = (await screen.findAllByTestId("short-video"))[0] as HTMLVideoElement;
    const pause = vi.mocked(HTMLMediaElement.prototype.pause);
    const play = vi.mocked(HTMLMediaElement.prototype.play);
    pause.mockClear();
    play.mockClear();
    clockOn(v, 24, false);
    fireEvent.click(v);
    expect(pause).toHaveBeenCalledTimes(1);
    expect(v.muted).toBe(true);
    clockOn(v, 24, true);
    fireEvent.click(v);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("▲ / ▼ buttons step one Short", async () => {
    renderAppAt("/shorts/A-1");
    await screen.findAllByTestId("short-video");
    Object.defineProperty(document.querySelector("[data-screen=shorts] [data-scroll]")!, "clientHeight", { configurable: true, value: 800 });
    fireEvent.click(screen.getByRole("button", { name: "Next Short" }));
    fireEvent.click(screen.getByRole("button", { name: "Previous Short" }));
    expect(scrollBy.mock.calls.map(([o]) => (o as ScrollToOptions).top)).toEqual([800, -800]);
  });

  it("renders one slide per Short, muted, each with a View file link", async () => {
    renderAppAt("/shorts/B%202");
    const videos = (await screen.findAllByTestId("short-video")) as HTMLVideoElement[];
    expect(videos).toHaveLength(3);
    expect(videos.every((v) => v.muted)).toBe(true);
    expect(screen.getAllByRole("link", { name: /view file/i })[1]).toHaveAttribute("href", "/doc/B%202");
  });

  it("sound button unmutes every slide", async () => {
    renderAppAt("/shorts/A-1");
    fireEvent.click((await screen.findAllByRole("button", { name: /unmute/i }))[0]);
    expect((screen.getAllByTestId("short-video") as HTMLVideoElement[]).every((v) => !v.muted)).toBe(true);
  });

  it("q queue when it contains :id, else all Shorts", async () => {
    renderAppAt("/shorts/C-3?q=third");
    expect(await screen.findAllByTestId("short-video")).toHaveLength(1);
  });

  it("falls back to all Shorts when :id is not in the q results", async () => {
    renderAppAt("/shorts/A-1?q=third");
    expect(await screen.findAllByTestId("short-video")).toHaveLength(3);
  });

  it("unknown id → not found with a doc link", async () => {
    renderAppAt("/shorts/NOPE");
    expect(await screen.findByText(/short not found/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open the file/i })).toHaveAttribute("href", "/doc/NOPE");
  });

  it("opens scrolled to :id and the tab title follows the Short on screen", async () => {
    renderAppAt("/shorts/B%202");
    const videos = (await screen.findAllByTestId("short-video")) as HTMLVideoElement[];
    expect(scrolled.at(-1)).toBe(videos[1].closest("section"));
    await waitFor(() => expect(document.title).toMatch(/Second/));
    act(() => fire([{ target: videos[2], isIntersecting: true } as unknown as IntersectionObserverEntry], {} as IntersectionObserver));
    await waitFor(() => expect(document.title).toMatch(/Third/));
  });

  it("arrow / j / k step one slide; with Cmd/Ctrl/Alt held they're left to the browser", async () => {
    renderAppAt("/shorts/A-1");
    await screen.findAllByTestId("short-video");
    fireEvent.keyDown(window, { key: "ArrowDown", metaKey: true });
    fireEvent.keyDown(window, { key: "j", ctrlKey: true });
    expect(scrollBy).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "j" });
    expect(scrollBy).toHaveBeenCalledTimes(1);
  });

  it("the page behind the player is inert; icon buttons are named", async () => {
    const { container } = renderAppAt("/shorts/A-1");
    await screen.findAllByTestId("short-video");
    expect(container).toHaveAttribute("inert");
    const player = within(document.querySelector("[data-screen=shorts]") as HTMLElement);
    expect(player.getByRole("button", { name: "Back" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "View file" })[0]).toHaveAttribute("href", "/doc/A-1");
    expect(screen.getAllByRole("button", { name: "Share" })).toHaveLength(3);
    expect(document.querySelector("[data-screen=shorts] [data-scroll]")).toHaveClass("overscroll-contain");
  });

  it("deep link to a Short past the first page: keeps fetching pages until it's found", async () => {
    const fetchNextPage = vi.fn();
    useShortsMock.mockImplementation(() => ({ data: all, isFetched: true, hasNextPage: true, isFetchingNextPage: false, fetchNextPage }));
    renderAppAt("/shorts/Z-99");
    expect(await screen.findByText(/loading signal/i)).toBeInTheDocument();
    await waitFor(() => expect(fetchNextPage).toHaveBeenCalled());
  });

  it("nearing the end of the loaded Shorts fetches the next page", async () => {
    const fetchNextPage = vi.fn();
    useShortsMock.mockImplementation(() => ({ data: all, isFetched: true, hasNextPage: true, isFetchingNextPage: false, fetchNextPage }));
    renderAppAt("/shorts/A-1");
    const videos = await screen.findAllByTestId("short-video");
    expect(fetchNextPage).not.toHaveBeenCalled();
    act(() => fire([{ target: videos[2], isIntersecting: true } as unknown as IntersectionObserverEntry], {} as IntersectionObserver));
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });
});
