// /newsletter — the weekly case-file archive: signup form, past-issue list
// linking to each case page, and the empty state.
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

describe("/newsletter", () => {
  it("lists past issues as links to their case pages", async () => {
    vi.mocked(api.get).mockResolvedValue({
      issues: [
        { week: "2026-W41", slug: "roswell", date: "2026-10-09" },
        { week: "2026-W40", slug: "kaikoura", date: "2026-10-02" },
      ],
    });
    renderAppAt("/newsletter");
    await screen.findByRole("heading", { level: 1, name: /newsletter/i });
    const roswell = await screen.findByRole("link", { name: /roswell/i });
    expect(roswell).toHaveAttribute("href", "/case/roswell");
    expect(screen.getByRole("link", { name: /kaikoura/i })).toHaveAttribute("href", "/case/kaikoura");
    // Email signup is on the page (the list-growth hook).
    expect(screen.getByPlaceholderText(/you@example.com/i)).toBeInTheDocument();
  });

  it("shows the empty state before the first issue", async () => {
    vi.mocked(api.get).mockResolvedValue({ issues: [] });
    renderAppAt("/newsletter");
    await screen.findByText(/no issues sent yet/i);
  });
});
