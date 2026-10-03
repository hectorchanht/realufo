import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OverlayProvider } from "../overlays/OverlayProvider";
import { FollowBell } from "../components/FollowBell";

vi.mock("../lib/push", () => ({
  enablePush: vi.fn(async () => "ok"),
  ENABLE_MSG: { denied: "Notifications blocked in browser settings", "ios-install": "Add to Home Screen first (Share → Add)", unsupported: "Notifications not supported here" },
}));
import { enablePush } from "../lib/push";

function setup(push: boolean, following = false) {
  const posts: unknown[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any, init?: RequestInit) => {
    const u = String(input);
    if (u.startsWith("/api/bootstrap")) return new Response(JSON.stringify({ features: { ask: false, push } }));
    if (u.startsWith("/api/follows") && init?.method === "POST") {
      posts.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ following: !following }));
    }
    if (u.startsWith("/api/follows")) return new Response(JSON.stringify({ following }));
    return new Response("{}");
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <OverlayProvider>
        <FollowBell kind="record" id="of _Western" />
      </OverlayProvider>
    </QueryClientProvider>,
  );
  return posts;
}

beforeEach(() => vi.restoreAllMocks());

describe("FollowBell", () => {
  it("hidden while push is off", async () => {
    setup(false);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole("button", { name: /follow/i })).toBeNull();
  });

  it("first tap enables push, then follows (id sent as-is)", async () => {
    const posts = setup(true);
    fireEvent.click(await screen.findByRole("button", { name: "Follow for notifications" }));
    await waitFor(() => expect(posts).toEqual([{ kind: "record", key: "of _Western", on: true }]));
    expect(enablePush).toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: "Unfollow" })).toHaveAttribute("aria-pressed", "true");
  });

  it("does not follow when permission is refused", async () => {
    vi.mocked(enablePush).mockResolvedValueOnce("denied");
    const posts = setup(true);
    fireEvent.click(await screen.findByRole("button", { name: "Follow for notifications" }));
    await new Promise((r) => setTimeout(r, 20));
    expect(posts).toEqual([]);
  });

  it("unfollow needs no permission", async () => {
    vi.mocked(enablePush).mockClear();
    const posts = setup(true, true);
    fireEvent.click(await screen.findByRole("button", { name: "Unfollow" }));
    await waitFor(() => expect(posts).toEqual([{ kind: "record", key: "of _Western", on: false }]));
    expect(enablePush).not.toHaveBeenCalled();
  });
});
