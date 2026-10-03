import { describe, it, expect, vi, afterEach } from "vitest";
import { shareLink, absUrl, xIntent, askIdOf } from "../lib/shareLink";

afterEach(() => vi.unstubAllGlobals());

describe("shareLink", () => {
  it("uses the native share sheet with an absolute URL when available", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share, clipboard: { writeText: vi.fn() } });
    expect(await shareLink("Q?", "/ask/7-q")).toBe("shared");
    expect(share).toHaveBeenCalledWith({ title: "Q?", url: absUrl("/ask/7-q") });
    expect(absUrl("/ask/7-q")).toMatch(/^https?:\/\/[^/]+\/ask\/7-q$/);
  });

  it("user closing the share sheet is 'cancelled', no clipboard write", async () => {
    const writeText = vi.fn();
    vi.stubGlobal("navigator", { share: vi.fn().mockRejectedValue(Object.assign(new Error("x"), { name: "AbortError" })), clipboard: { writeText } });
    expect(await shareLink("Q?", "/ask/7-q")).toBe("cancelled");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("share rejected without a gesture (iOS NotAllowedError) falls back to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share: vi.fn().mockRejectedValue(Object.assign(new Error("x"), { name: "NotAllowedError" })), clipboard: { writeText } });
    expect(await shareLink("Q?", "/ask/7-q")).toBe("copied");
    expect(writeText).toHaveBeenCalledWith(absUrl("/ask/7-q"));
  });

  it("no share API: copies; no clipboard either: failed", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    expect(await shareLink("Q?", "/ask/7-q")).toBe("copied");
    vi.stubGlobal("navigator", {});
    expect(await shareLink("Q?", "/ask/7-q")).toBe("failed");
  });

  it("xIntent encodes the question and absolute URL", () => {
    const u = new URL(xIntent("Tic Tac & Gimbal?", "/ask/7-q"));
    expect(u.origin + u.pathname).toBe("https://x.com/intent/post");
    expect(u.searchParams.get("text")).toBe("Tic Tac & Gimbal?");
    expect(u.searchParams.get("url")).toBe(absUrl("/ask/7-q"));
  });

  it("askIdOf matches the worker rule", () => {
    expect(askIdOf("12-what")).toBe(12);
    expect(askIdOf("12")).toBe(12);
    expect(askIdOf("x-12")).toBeNull();
    expect(askIdOf("0")).toBeNull();
  });
});
