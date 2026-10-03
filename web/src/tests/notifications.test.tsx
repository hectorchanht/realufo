import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderAppAt } from "./util";
import { enablePush } from "../lib/push";

vi.mock("../lib/push", () => ({
  currentSub: vi.fn(async () => ({ endpoint: "https://push.test/me" })),
  enablePush: vi.fn(async () => "ok"),
  disablePush: vi.fn(async () => {}),
  resyncPush: vi.fn(async () => {}),
  ENABLE_MSG: { denied: "d", "ios-install": "i", unsupported: "u" },
}));

let posts: Array<[string, unknown]>;
let prefs: unknown;
beforeEach(() => {
  posts = [];
  prefs = { replies: true, new_files: false, daily: true };
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
        prefs,
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

  it("enabling re-reads the server state even when the endpoint didn't change", async () => {
    prefs = null; // server dropped the subscription; the browser still has it
    renderAppAt("/notifications");
    const sw = await screen.findByRole("switch", { name: /Notifications on this device/ });
    await waitFor(() => expect(sw).not.toBeChecked());
    prefs = { replies: true, new_files: true, daily: true };
    fireEvent.click(sw);
    await waitFor(() => expect(screen.getByRole("switch", { name: /Notifications on this device/ })).toBeChecked());
  });

  it("a failing enable toasts instead of rejecting", async () => {
    prefs = null;
    vi.mocked(enablePush).mockRejectedValueOnce(new Error("no push service"));
    renderAppAt("/notifications");
    fireEvent.click(await screen.findByRole("switch", { name: /Notifications on this device/ }));
    expect(await screen.findByText(/Could not update — try again/)).toBeInTheDocument();
  });
});
