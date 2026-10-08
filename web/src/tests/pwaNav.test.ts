// lib/pwaNav tests: PDF opening differs between the installed PWA and a
// regular browser tab (see lib/pwaNav.ts for the why).
import { describe, it, expect, vi, afterEach } from "vitest";
import { openPdf, navigateInPlace, isStandalone, pwaLocation } from "../lib/pwaNav";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stubStandalone() {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: q.includes("display-mode: standalone"),
    media: q,
    addEventListener() {},
    removeEventListener() {},
  }));
}

describe("pwaNav", () => {
  it("isStandalone() is false when matchMedia is unavailable (regular browser/jsdom)", () => {
    expect(isStandalone()).toBe(false);
  });

  it("openPdf uses a _blank tab outside the installed PWA", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    openPdf("/api/file/rec1");
    expect(openSpy).toHaveBeenCalledWith("/api/file/rec1", "_blank", "noopener,noreferrer");
  });

  it("openPdf navigates the app window itself in standalone mode", () => {
    stubStandalone();
    expect(isStandalone()).toBe(true);
    const assignSpy = vi.spyOn(pwaLocation, "assign").mockImplementation(() => {});
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    openPdf("/api/file/rec1");
    expect(assignSpy).toHaveBeenCalledWith("/api/file/rec1");
    expect(openSpy).not.toHaveBeenCalled();
  });

  it("navigateInPlace assigns the URL on the current window", () => {
    const assignSpy = vi.spyOn(pwaLocation, "assign").mockImplementation(() => {});
    navigateInPlace("/api/file/rec1");
    expect(assignSpy).toHaveBeenCalledWith("/api/file/rec1");
  });
});
