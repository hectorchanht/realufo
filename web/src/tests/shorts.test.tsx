import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, act, waitFor } from "@testing-library/react";
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

describe("Shorts player", () => {
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
    expect(scrolled.at(-1)).toBe(videos[1].parentElement);
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

  it("the page behind the player is inert; back button is named by its text", async () => {
    const { container } = renderAppAt("/shorts/A-1");
    await screen.findAllByTestId("short-video");
    expect(container).toHaveAttribute("inert");
    expect(screen.getByRole("button", { name: "‹ Back" })).toBeInTheDocument();
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
