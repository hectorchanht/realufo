// /podcast — episode list with audio players, case-file links, and subscribe row.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderAppAt } from "./util";
import { api } from "../api/client";

vi.mock("../api/client", async (orig) => ({
  ...(await orig<typeof import("../api/client")>()),
  api: { get: vi.fn(), post: vi.fn() },
}));

beforeEach(() => {
  vi.mocked(api.get).mockReset();
});

const EP = {
  guid: "ep-01658671-5677-4bd6-8d8c-5ba9477fe5ea",
  title: "Roswell 1947: The Flying Disc That Became a Balloon",
  description: "Alex and Jordan open the most famous UFO case of all.",
  pubDate: "2026-10-07",
  audioUrl: "https://muse.ai/podcasts/media/xxx/ep.mp3",
  durationSecs: 315,
  caseSlug: "roswell",
};

describe("/podcast", () => {
  it("lists episodes with an audio player and a case-file link", async () => {
    vi.mocked(api.get).mockResolvedValue({ episodes: [EP] });
    renderAppAt("/podcast");
    await screen.findByRole("heading", { level: 1, name: /podcast/i });
    expect(await screen.findByText(/flying disc that became a balloon/i)).toBeInTheDocument();
    const audio = document.querySelector("audio");
    expect(audio?.getAttribute("src")).toBe(EP.audioUrl);
    expect(screen.getByRole("link", { name: /read the case file/i })).toHaveAttribute(
      "href",
      "/case/roswell"
    );
    // Subscribe row is present.
    expect(screen.getByRole("button", { name: /copy rss feed/i })).toBeInTheDocument();
  });

  it("shows the empty state before the first episode", async () => {
    vi.mocked(api.get).mockResolvedValue({ episodes: [] });
    renderAppAt("/podcast");
    await screen.findByText(/no episodes yet/i);
  });
});
