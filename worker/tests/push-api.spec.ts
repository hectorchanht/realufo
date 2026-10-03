import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../index";
import { seedTestDB } from "./helpers";

beforeAll(() => seedTestDB(env.DB));
const ON = { ...env, FEATURE_PUSH: "on", VAPID_PUBLIC_KEY: "BPUBKEY" } as any;
const call = (p: string, init: RequestInit = {}, e: any = ON) => worker.fetch(new Request("https://x" + p, init), e, {} as any);
const post = (anon: string | null, p: string, body: unknown, e: any = ON) =>
  call(p, { method: "POST", headers: anon ? { "X-Anon-Id": anon } : {}, body: JSON.stringify(body) }, e);
const get = (anon: string, p: string) => call(p, { headers: { "X-Anon-Id": anon } });
const P256DH = "B" + "A".repeat(86); // 87 chars like a real 65-byte key
const AUTH = "A".repeat(22);
const sub = (endpoint: string) => ({ subscription: { endpoint, keys: { p256dh: P256DH, auth: AUTH } } });

describe("push config + bootstrap flag", () => {
  it("config 404 while off, key while on", async () => {
    expect((await call("/api/push/config", {}, { ...env, FEATURE_PUSH: "off" })).status).toBe(404);
    expect(await (await call("/api/push/config")).json()).toEqual({ publicKey: "BPUBKEY" });
  });
  it("bootstrap exposes features.push", async () => {
    const j: any = await (await call("/api/bootstrap")).json();
    expect(j.features.push).toBe(true);
    const off: any = await (await call("/api/bootstrap", {}, { ...env, FEATURE_PUSH: "off" })).json();
    expect(off.features.push).toBe(false);
  });
});

describe("subscriptions", () => {
  it("rejects bad endpoints/keys and missing anon id", async () => {
    expect((await post("s1", "/api/push/subscribe", sub("http://insecure/x"))).status).toBe(400);
    expect((await post("s1", "/api/push/subscribe", { subscription: { endpoint: "https://p/x", keys: { p256dh: "x", auth: AUTH } } })).status).toBe(400);
    expect((await post("s1", "/api/push/subscribe", { subscription: { endpoint: "https://p/x", keys: { p256dh: "C" + "A".repeat(86), auth: AUTH } } })).status).toBe(400); // decodes to a first byte other than 0x04
    expect((await post(null, "/api/push/subscribe", sub("https://p/x"))).status).toBe(400);
    expect((await post("s1", "/api/push/subscribe", sub("https://p/x"), { ...env, FEATURE_PUSH: "off" })).status).toBe(404);
  });
  it("subscribe → prefs defaults; prefs + unsubscribe only by the owner", async () => {
    expect((await post("s1", "/api/push/subscribe", sub("https://p/s1"))).status).toBe(200);
    let me: any = await (await get("s1", "/api/push/me?endpoint=" + encodeURIComponent("https://p/s1"))).json();
    expect(me.prefs).toEqual({ replies: true, new_files: false, daily: true });
    expect((await post("other", "/api/push/prefs", { endpoint: "https://p/s1", daily: false })).status).toBe(404);
    expect((await post("s1", "/api/push/prefs", { endpoint: "https://p/s1", daily: false, new_files: true })).status).toBe(200);
    me = await (await get("s1", "/api/push/me?endpoint=" + encodeURIComponent("https://p/s1"))).json();
    expect(me.prefs).toEqual({ replies: true, new_files: true, daily: false });
    expect((await post("other", "/api/push/unsubscribe", { endpoint: "https://p/s1" })).status).toBe(404);
    expect((await post("s1", "/api/push/unsubscribe", { endpoint: "https://p/s1" })).status).toBe(200);
    me = await (await get("s1", "/api/push/me?endpoint=" + encodeURIComponent("https://p/s1"))).json();
    expect(me.prefs).toBeNull();
  });
  it("re-subscribing keeps prefs, moves the endpoint to the caller", async () => {
    await post("s2", "/api/push/subscribe", sub("https://p/s2"));
    await post("s2", "/api/push/prefs", { endpoint: "https://p/s2", daily: false });
    await post("s2b", "/api/push/subscribe", sub("https://p/s2"));
    const me: any = await (await get("s2b", "/api/push/me?endpoint=" + encodeURIComponent("https://p/s2"))).json();
    expect(me.prefs.daily).toBe(false);
  });
});

describe("follows API", () => {
  it("unknown targets 404; release hubs not followable", async () => {
    expect((await post("f1", "/api/follows", { kind: "thread", key: "nope", on: true })).status).toBe(404);
    expect((await post("f1", "/api/follows", { kind: "hub", key: "release/6", on: true })).status).toBe(404);
    expect((await post("f1", "/api/follows", { kind: "user", key: "x", on: true })).status).toBe(404);
  });
  it("bell follow, listed in me with title + url, unfollow removes", async () => {
    expect(await (await post("f1", "/api/follows", { kind: "thread", key: "t1", on: true })).json()).toEqual({ following: true });
    expect(await (await post("f1", "/api/follows", { kind: "hub", key: "agency/fbi", on: true })).json()).toEqual({ following: true });
    expect(await (await get("f1", "/api/follows?kind=thread&key=t1")).json()).toEqual({ following: true });
    const me: any = await (await get("f1", "/api/push/me")).json();
    expect(me.follows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "thread", key: "t1", src: "bell", url: "/thread/t1" }),
        { kind: "hub", key: "agency/fbi", src: "bell", title: "FBI", url: "/agency/fbi" },
      ]),
    );
    expect(me.follows.find((f: any) => f.key === "t1").title).toBeTruthy();
    await post("f1", "/api/follows", { kind: "thread", key: "t1", on: false });
    expect(await (await get("f1", "/api/follows?kind=thread&key=t1")).json()).toEqual({ following: false });
  });
  it("bell upgrades an auto follow; bell state ignores auto rows", async () => {
    await post("f2", "/api/threads/t1/posts", { body: "hi" }); // auto
    expect(await (await get("f2", "/api/follows?kind=thread&key=t1")).json()).toEqual({ following: false });
    await post("f2", "/api/follows", { kind: "thread", key: "t1", on: true });
    expect(await (await get("f2", "/api/follows?kind=thread&key=t1")).json()).toEqual({ following: true });
  });
});
