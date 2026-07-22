import { describe, it, expect, vi, beforeEach } from "vitest";
import { api, ApiError } from "../api/client";

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
});
