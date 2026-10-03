import { describe, it, expect, vi, beforeEach } from "vitest";
import { enablePush } from "../lib/push";
import { api } from "../api/client";

vi.mock("../api/client", () => ({ api: { get: vi.fn(), post: vi.fn() } }));
vi.mock("../lib/install", () => ({ isIos: () => false, isStandalone: () => false }));

const calls: string[] = [];
let permission: NotificationPermission;
let existing: { endpoint: string; toJSON: () => unknown } | null;
const subscribe = vi.fn(async () => ({ endpoint: "new", toJSON: () => ({ endpoint: "new" }) }));
const pushManager = { getSubscription: async () => existing, subscribe };

beforeEach(() => {
  calls.length = 0;
  existing = null;
  subscribe.mockClear();
  vi.mocked(api.post).mockReset().mockResolvedValue({});
  vi.mocked(api.get).mockReset().mockResolvedValue({ publicKey: "AQAB" });
  vi.stubGlobal("PushManager", class {});
  vi.stubGlobal("Notification", {
    get permission() {
      return permission;
    },
    requestPermission: async () => {
      calls.push("requestPermission");
      return permission === "default" ? "granted" : permission;
    },
  });
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      getRegistration: async () => {
        calls.push("getRegistration");
        return { pushManager };
      },
      ready: Promise.resolve({ pushManager }),
    },
  });
});

describe("enablePush", () => {
  it("asks for permission before any other await (iOS drops the tap gesture across awaits)", async () => {
    permission = "default";
    expect(await enablePush()).toBe("ok");
    expect(calls[0]).toBe("requestPermission");
    expect(subscribe).toHaveBeenCalled();
    expect(api.post).toHaveBeenCalledWith("/api/push/subscribe", { subscription: { endpoint: "new" } });
  });

  it("denied → 'denied' without subscribing", async () => {
    permission = "denied";
    expect(await enablePush()).toBe("denied");
    expect(subscribe).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("existing subscription is re-saved", async () => {
    permission = "granted";
    existing = { endpoint: "old", toJSON: () => ({ endpoint: "old" }) };
    expect(await enablePush()).toBe("ok");
    expect(subscribe).not.toHaveBeenCalled();
    expect(api.post).toHaveBeenCalledWith("/api/push/subscribe", { subscription: { endpoint: "old" } });
  });
});
