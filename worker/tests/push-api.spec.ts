import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../index";
import { seedTestDB } from "./helpers";
import { actorId } from "../lib/anon";

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
    expect((await post("s1", "/api/push/subscribe", { subscription: { endpoint: "https://fcm.googleapis.com/fcm/send/x", keys: { p256dh: "x", auth: AUTH } } })).status).toBe(400);
    expect((await post("s1", "/api/push/subscribe", { subscription: { endpoint: "https://fcm.googleapis.com/fcm/send/x", keys: { p256dh: "C" + "A".repeat(86), auth: AUTH } } })).status).toBe(400); // decodes to a first byte other than 0x04
    expect((await post(null, "/api/push/subscribe", sub("https://fcm.googleapis.com/fcm/send/x"))).status).toBe(400);
    expect((await post("s1", "/api/push/subscribe", sub("https://fcm.googleapis.com/fcm/send/x"), { ...env, FEATURE_PUSH: "off" })).status).toBe(404);
  });
  it("only known push services are accepted", async () => {
    expect((await post("s1", "/api/push/subscribe", sub("https://evil.example/x"))).status).toBe(400);
    expect((await post("s1", "/api/push/subscribe", sub("https://fcm.googleapis.com.evil.example/x"))).status).toBe(400);
    for (const e of ["https://updates.push.services.mozilla.com/wpush/v2/a", "https://web.push.apple.com/b", "https://wns2-db5p.notify.windows.com/w/?token=c"])
      expect((await post("s1", "/api/push/subscribe", sub(e))).status).toBe(200);
  });
  it("subscribe → prefs defaults; prefs + unsubscribe only by the owner", async () => {
    expect((await post("s1", "/api/push/subscribe", sub("https://fcm.googleapis.com/fcm/send/s1"))).status).toBe(200);
    let me: any = await (await get("s1", "/api/push/me?endpoint=" + encodeURIComponent("https://fcm.googleapis.com/fcm/send/s1"))).json();
    expect(me.prefs).toEqual({ replies: true, new_files: false, daily: true });
    expect((await post("other", "/api/push/prefs", { endpoint: "https://fcm.googleapis.com/fcm/send/s1", daily: false })).status).toBe(404);
    expect((await post("s1", "/api/push/prefs", { endpoint: "https://fcm.googleapis.com/fcm/send/s1", daily: false, new_files: true })).status).toBe(200);
    me = await (await get("s1", "/api/push/me?endpoint=" + encodeURIComponent("https://fcm.googleapis.com/fcm/send/s1"))).json();
    expect(me.prefs).toEqual({ replies: true, new_files: true, daily: false });
    expect((await post("other", "/api/push/unsubscribe", { endpoint: "https://fcm.googleapis.com/fcm/send/s1" })).status).toBe(404);
    expect((await post("s1", "/api/push/unsubscribe", { endpoint: "https://fcm.googleapis.com/fcm/send/s1" })).status).toBe(200);
    me = await (await get("s1", "/api/push/me?endpoint=" + encodeURIComponent("https://fcm.googleapis.com/fcm/send/s1"))).json();
    expect(me.prefs).toBeNull();
  });
  it("re-subscribing keeps prefs, moves the endpoint to the caller", async () => {
    await post("s2", "/api/push/subscribe", sub("https://fcm.googleapis.com/fcm/send/s2"));
    await post("s2", "/api/push/prefs", { endpoint: "https://fcm.googleapis.com/fcm/send/s2", daily: false });
    await post("s2b", "/api/push/subscribe", sub("https://fcm.googleapis.com/fcm/send/s2"));
    const me: any = await (await get("s2b", "/api/push/me?endpoint=" + encodeURIComponent("https://fcm.googleapis.com/fcm/send/s2"))).json();
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
  it("a follow whose target is gone can still be removed", async () => {
    const actor = await actorId(new Request("https://x", { headers: { "X-Anon-Id": "f3" } }), env.ANON_SALT);
    await env.DB.prepare("INSERT INTO follows(actor_id,kind,key,src) VALUES(?,'thread','deleted-t','bell')").bind(actor).run();
    expect((await post("f3", "/api/follows", { kind: "thread", key: "deleted-t", on: false })).status).toBe(200);
    expect(await env.DB.prepare("SELECT 1 FROM follows WHERE actor_id=? AND key='deleted-t'").bind(actor).first()).toBeNull();
  });
  it("on must be literally true; odd kinds/bodies are 4xx, not 500", async () => {
    expect(await (await post("f4", "/api/follows", { kind: "thread", key: "t1", on: "false" })).json()).toEqual({ following: false });
    expect(await (await get("f4", "/api/follows?kind=thread&key=t1")).json()).toEqual({ following: false });
    expect((await post("f4", "/api/follows", { kind: "constructor", key: "x", on: true })).status).toBe(404);
    for (const p of ["/api/follows", "/api/push/subscribe", "/api/push/prefs", "/api/push/unsubscribe"]) {
      const st = (await post("f4", p, null)).status;
      expect(st >= 400 && st < 500, `${p} → ${st}`).toBe(true);
    }
  });
  it("bell upgrades an auto follow; bell state ignores auto rows", async () => {
    await post("f2", "/api/threads/t1/posts", { body: "hi" }); // auto
    expect(await (await get("f2", "/api/follows?kind=thread&key=t1")).json()).toEqual({ following: false });
    await post("f2", "/api/follows", { kind: "thread", key: "t1", on: true });
    expect(await (await get("f2", "/api/follows?kind=thread&key=t1")).json()).toEqual({ following: true });
  });
});
