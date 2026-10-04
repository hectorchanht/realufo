import { describe, it, expect, vi, beforeEach } from "vitest";
import { api, ApiError } from "../api/client";
import { isStale } from "../lib/offline";

beforeEach(() => {
  localStorage.clear();
});

describe("api client", () => {
  it("sends X-Anon-Id and parses json", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ ok: 1 }), { status: 200 }));
    const r = await api.get<{ ok: number }>("/api/health");
    expect(r.ok).toBe(1);
    const hdrs = (spy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(hdrs["X-Anon-Id"]).toMatch(/[0-9a-f-]{36}/);
  });

  it("throws on non-2xx", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 400 }));
    await expect(api.post("/api/x", {})).rejects.toThrow();
  });

  it("throws an ApiError carrying the http status on non-2xx", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 400 }));
    expect.assertions(2);
    try {
      await api.post("/api/x", {});
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(400);
    }
  });

  it("surfaces a 429 status + server error message (rate-limit toast wiring reads err.status)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "slow down — too many posts" }), { status: 429 }),
    );
    expect.assertions(3);
    try {
      await api.post("/api/records/r1/comments", { body: "hi" });
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(429);
      expect((err as ApiError).message).toBe("slow down — too many posts");
    }
  });

  it("reuses the same anon id across requests (persisted in localStorage)", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () => new Response("{}", { status: 200 }),
    );
    await api.get("/api/a");
    await api.get("/api/b");
    const id = localStorage.getItem("ufo_anon");
    expect(id).toBeTruthy();
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("flags reads served from the service-worker cache, clears on a live one", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("{}", { status: 200, headers: { "X-SW-Cache": "1" } }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    await api.get("/api/feed");
    expect(isStale()).toBe(true);
    await api.get("/api/feed");
    expect(isStale()).toBe(false);
  });
});

describe("early fetch adoption (index.html window.__early)", () => {
  type Early = { at: number; p: Promise<{ d: unknown; stale: boolean } | null> };
  const w = window as unknown as { __early?: Record<string, Early> };
  const put = (path: string, r: { d: unknown; stale: boolean } | null, at = performance.now()) => {
    w.__early = { ...(w.__early ?? {}), [path]: { at, p: Promise.resolve(r) } };
  };
  beforeEach(() => {
    delete w.__early;
    vi.restoreAllMocks();
  });

  it("adopts the early result without a network request", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    put("/api/records/X", { d: { record: { id: "X" } }, stale: false });
    expect(await api.get("/api/records/X")).toEqual({ record: { id: "X" } });
    expect(spy).not.toHaveBeenCalled();
  });

  it("adopts once: a second GET of the same path goes to the network", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ n: 2 }), { status: 200 }));
    put("/api/hubs", { d: { n: 1 }, stale: false });
    expect(await api.get("/api/hubs")).toEqual({ n: 1 });
    expect(await api.get("/api/hubs")).toEqual({ n: 2 });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("a failed early fetch (null) falls back to a normal request and surfaces its ApiError", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: "not found" }), { status: 404 }));
    put("/api/records/GONE", null);
    await expect(api.get("/api/records/GONE")).rejects.toMatchObject({ status: 404 });
  });

  it("ignores an entry 10 s or older and fetches fresh", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ fresh: true }), { status: 200 }));
    put("/api/bootstrap", { d: { fresh: false }, stale: false }, performance.now() - 10_000);
    expect(await api.get("/api/bootstrap")).toEqual({ fresh: true });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(w.__early?.["/api/bootstrap"]).toBeUndefined();
  });

  it("restores the service worker's stale flag from the early response", async () => {
    put("/api/feed", { d: { cards: [] }, stale: true });
    await api.get("/api/feed");
    expect(isStale()).toBe(true);
  });
});
