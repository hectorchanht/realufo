import { describe, it, expect, vi, afterEach } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});
const load = () => import("../lib/install");
const ua = (s: string) => vi.stubGlobal("navigator", { ...navigator, userAgent: s, maxTouchPoints: 5, platform: "iPhone" });

describe("installMode", () => {
  it("null when nothing to offer (desktop, no prompt event)", async () => {
    const m = await load();
    expect(m.installMode()).toBeNull();
  });
  it("prompt once the browser fired beforeinstallprompt", async () => {
    const m = await load();
    const e = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), { prompt: vi.fn(async () => {}) });
    window.dispatchEvent(e);
    expect(m.installMode()).toBe("prompt");
    await m.promptInstall();
    expect(e.prompt).toHaveBeenCalled();
    expect(m.installMode()).toBeNull();
  });
  it("ios steps on iPhone Safari", async () => {
    ua("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)");
    const m = await load();
    expect(m.installMode()).toBe("ios");
  });
  it("null when already running standalone", async () => {
    ua("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)");
    vi.stubGlobal("navigator", { ...navigator, standalone: true });
    const m = await load();
    expect(m.installMode()).toBeNull();
  });
});
