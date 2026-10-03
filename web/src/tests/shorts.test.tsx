import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
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
beforeEach(() => {
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
});
