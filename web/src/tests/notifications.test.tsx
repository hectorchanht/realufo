import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderAppAt } from "./util";

vi.mock("../lib/push", () => ({
  currentSub: vi.fn(async () => ({ endpoint: "https://push.test/me" })),
  enablePush: vi.fn(async () => "ok"),
  disablePush: vi.fn(async () => {}),
  resyncPush: vi.fn(async () => {}),
  ENABLE_MSG: { denied: "d", "ios-install": "i", unsupported: "u" },
}));

let posts: Array<[string, unknown]>;
beforeEach(() => {
  posts = [];
  vi.restoreAllMocks();
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any, init?: RequestInit) => {
    const u = String(input);
    if (init?.method === "POST") {
      posts.push([u, JSON.parse(String(init.body))]);
      return new Response(JSON.stringify({ ok: true, following: false }));
    }
    if (u.startsWith("/api/bootstrap")) return new Response(JSON.stringify({ features: { ask: false, push: true }, archives: [], boards: [], stats: {}, ticker: [], sightings: [], places: [], cases: [] }));
    if (u.startsWith("/api/push/me"))
      return new Response(JSON.stringify({
        prefs: { replies: true, new_files: false, daily: true },
        follows: [{ kind: "hub", key: "agency/fbi", src: "bell", title: "FBI", url: "/agency/fbi" }],
      }));
    return new Response("{}");
  });
});

describe("Notifications screen", () => {
  it("shows prefs and follows; toggling a pref posts it", async () => {
    renderAppAt("/notifications");
    const files = await screen.findByRole("switch", { name: "All new files" });
    expect(files).not.toBeChecked();
    expect(screen.getByRole("switch", { name: "Replies to my posts" })).toBeChecked();
    expect(screen.getByRole("link", { name: "FBI" })).toHaveAttribute("href", "/agency/fbi");
    fireEvent.click(files);
    await waitFor(() => expect(posts).toContainEqual(["/api/push/prefs", { endpoint: "https://push.test/me", new_files: true }]));
  });

  it("removing a follow posts on:false", async () => {
    renderAppAt("/notifications");
    fireEvent.click(await screen.findByRole("button", { name: "Stop following FBI" }));
    await waitFor(() => expect(posts).toContainEqual(["/api/follows", { kind: "hub", key: "agency/fbi", on: false }]));
  });
});
