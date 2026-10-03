import { describe, it, expect, vi, beforeEach } from "vitest";
import { canQueue, enqueue, flush, outboxMessage, type OutboxEvent } from "../lib/outbox";
import { api, ApiError, QueuedError } from "../api/client";

const items = () => JSON.parse(localStorage.getItem("outbox") ?? "[]");
const events: OutboxEvent[] = [];
window.addEventListener("outbox", (e) => events.push((e as CustomEvent<OutboxEvent>).detail));
const ok = () => new Response("{}", { status: 201 });

beforeEach(() => {
  localStorage.clear();
  events.length = 0;
  vi.restoreAllMocks();
});

describe("outbox", () => {
  it("knows which writes can wait", () => {
    expect(canQueue("/api/records/DOW-UAP-D006/comments")).toBe(true);
    expect(canQueue("/api/threads")).toBe(true);
    expect(canQueue("/api/threads/ut_1/posts")).toBe(true);
    expect(canQueue("/api/votes")).toBe(true);
    expect(canQueue("/api/ask/3/public")).toBe(false);
    expect(canQueue("/api/push/subscribe")).toBe(false);
  });

  it("client queues a write that fails with a network error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(api.post("/api/votes", { target_type: "post", target_id: "P1" })).rejects.toBeInstanceOf(QueuedError);
    expect(items()).toHaveLength(1);
    expect(items()[0]).toMatchObject({ path: "/api/votes", body: { target_type: "post", target_id: "P1" } });
    expect(events).toEqual([{ queued: true }]);
  });

  it("does not queue server errors, non-queueable paths, or image posts", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 400 }));
    await expect(api.post("/api/votes", {})).rejects.not.toBeInstanceOf(QueuedError);
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(api.post("/api/ask/3/public", {})).rejects.toBeInstanceOf(TypeError);
    const form = new FormData();
    form.set("body", "hi");
    const err = (await api.post("/api/threads/ut_1/posts", form).catch((e) => e)) as Error;
    expect(err).toBeInstanceOf(ApiError);
    expect(err).not.toBeInstanceOf(QueuedError);
    expect(err.message).toBe("Image posts need a connection");
    expect(items()).toHaveLength(0);
  });

  it("keeps at most 50 items", () => {
    for (let i = 0; i < 55; i++) enqueue("/api/votes", { i });
    expect(items()).toHaveLength(50);
    expect(items()[0].body).toEqual({ i: 5 });
  });

  it("flushes oldest first and reports", async () => {
    enqueue("/api/votes", { n: 1 });
    enqueue("/api/threads/ut_1/posts", { body: "b" });
    const sent: unknown[] = [];
    await flush(async (_p, b) => (sent.push(b), ok()));
    expect(sent).toEqual([{ n: 1 }, { body: "b" }]);
    expect(items()).toHaveLength(0);
    expect(events.at(-1)).toEqual({ sent: 2, failed: [] });
  });

  it("stops on network error and on 429, keeping the rest", async () => {
    enqueue("/api/votes", { n: 1 });
    enqueue("/api/votes", { n: 2 });
    await flush(async () => {
      throw new TypeError("offline");
    });
    expect(items()).toHaveLength(2);
    await flush(async () => new Response("{}", { status: 429 }));
    expect(items()).toHaveLength(2);
  });

  it("drops a rejected item with its server error and carries on", async () => {
    enqueue("/api/votes", { n: 1 });
    enqueue("/api/votes", { n: 2 });
    let call = 0;
    await flush(async () => (call++ === 0 ? new Response(JSON.stringify({ error: "thread not found" }), { status: 404 }) : ok()));
    expect(items()).toHaveLength(0);
    expect(events.at(-1)).toEqual({ sent: 1, failed: ["thread not found"] });
  });

  it("drops items older than 7 days", async () => {
    localStorage.setItem("outbox", JSON.stringify([{ id: "old", path: "/api/votes", body: {}, at: Date.now() - 8 * 864e5 }]));
    const send = vi.fn(async () => ok());
    await flush(send);
    expect(send).not.toHaveBeenCalled();
    expect(items()).toHaveLength(0);
  });

  it("concurrent flushes in one tab send each item once", async () => {
    enqueue("/api/votes", { n: 1 });
    const send = vi.fn(async () => ok());
    await Promise.all([flush(send), flush(send)]);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("uses the Web Locks API when present so two tabs never flush together", async () => {
    const request = vi.fn((_name: string, fn: () => Promise<void>) => fn());
    vi.stubGlobal("navigator", { ...navigator, locks: { request } });
    enqueue("/api/votes", { n: 1 });
    await flush(async () => ok());
    expect(request).toHaveBeenCalledWith("realufo-outbox", expect.any(Function));
    vi.unstubAllGlobals();
  });

  it("summary text", () => {
    expect(outboxMessage({ queued: true })).toBe("Saved offline — will post when back online");
    expect(outboxMessage({ sent: 2, failed: [] })).toBe("2 offline posts sent");
    expect(outboxMessage({ sent: 1, failed: ["thread not found"] })).toBe("1 offline post sent · 1 couldn't post: thread not found");
  });
});
