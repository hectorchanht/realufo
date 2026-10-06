import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../index";
import { seedTestDB } from "./helpers";
import { validWebhookUrl, sign, createWebhook, fireWebhooks } from "../lib/webhooks";

beforeAll(() => seedTestDB(env.DB));
let ipn = 0;
const ipg = (p: string, init?: RequestInit) =>
  worker.fetch(
    new Request("https://x" + p, { ...init, headers: { "CF-Connecting-IP": `10.10.0.${++ipn}`, ...(init?.headers ?? {}) } }),
    env as any, {} as any
  );

describe("webhooks", () => {
  it("validWebhookUrl: https ok, http/ftp/garbage rejected", () => {
    expect(validWebhookUrl("https://example.com/hook")).toBe("https://example.com/hook");
    expect(validWebhookUrl("http://localhost:3000/h")).toBe("http://localhost:3000/h");
    expect(validWebhookUrl("http://example.com/h")).toBeNull();
    expect(validWebhookUrl("ftp://example.com")).toBeNull();
    expect(validWebhookUrl("not a url")).toBeNull();
  });
  it("sign: deterministic HMAC-SHA256 hex", async () => {
    const a = await sign("s3cret", "body");
    const b = await sign("s3cret", "body");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await sign("other", "body")).not.toBe(a);
  });
  it("POST /api/v1/webhooks creates; secret shown once, gated read/delete", async () => {
    const bad = await ipg("/api/v1/webhooks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: "http://example.com/x" }) });
    expect(bad.status).toBe(400);
    const res = await ipg("/api/v1/webhooks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: "https://example.com/hook", events: ["release.created"] }) });
    expect(res.status).toBe(201);
    const d: any = await res.json();
    expect(d.data.id).toMatch(/^wh_/);
    expect(d.data.events).toEqual(["release.created"]);
    expect(typeof d.data.secret).toBe("string");
    const { id, secret } = d.data;
    // wrong secret → 404
    expect((await ipg(`/api/v1/webhooks/${id}`, { headers: { "X-Webhook-Secret": "nope" } })).status).toBe(404);
    // right secret → status without the secret
    const got: any = await (await ipg(`/api/v1/webhooks/${id}`, { headers: { "X-Webhook-Secret": secret } })).json();
    expect(got.data.url).toBe("https://example.com/hook");
    expect(got.data).not.toHaveProperty("secret");
    // delete
    const del = await ipg(`/api/v1/webhooks/${id}`, { method: "DELETE", headers: { "X-Webhook-Secret": secret } });
    expect(del.status).toBe(200);
    expect((await ipg(`/api/v1/webhooks/${id}`, { method: "DELETE", headers: { "X-Webhook-Secret": secret } })).status).toBe(404);
  });
  it("fireWebhooks delivers signed JSON to subscribers of the event only", async () => {
    const a = await createWebhook(env as any, "https://a.example.com/h", ["records.created"]);
    await createWebhook(env as any, "https://b.example.com/h", ["release.created"]);
    const calls: { url: string; headers: Record<string, string>; body: string }[] = [];
    const deliver = async (url: string, init: RequestInit) => {
      calls.push({ url, headers: Object.fromEntries(new Headers(init.headers as HeadersInit).entries()), body: String(init.body) });
      return new Response("ok", { status: 200 });
    };
    const n = await fireWebhooks(env as any, "records.created", { count: 1 }, deliver as any);
    expect(n).toBe(1);
    expect(calls.length).toBe(1);
    expect(calls[0].url).toBe("https://a.example.com/h");
    const payload = JSON.parse(calls[0].body);
    expect(payload.event).toBe("records.created");
    expect(payload.data).toEqual({ count: 1 });
    // signature verifies against the subscriber's secret
    expect(calls[0].headers["x-realufo-signature"]).toBe(await sign(a.secret, calls[0].body));
    expect(calls[0].headers["x-realufo-event"]).toBe("records.created");
    expect(calls[0].headers["x-realufo-delivery"]).toMatch(/^dlv_/);
  });
  it("fireWebhooks marks failures and deactivates after too many", async () => {
    const s = await createWebhook(env as any, "https://dead.example.com/h", ["records.created"]);
    const fail = async () => new Response("boom", { status: 500 });
    for (let i = 0; i < 20; i++) await fireWebhooks(env as any, "records.created", {}, fail as any);
    const row = (await (env as any).DB.prepare("SELECT active, fails FROM webhook_subs WHERE id=?").bind(s.id).first()) as { active: number; fails: number } | null;
    expect(row?.fails).toBe(20);
    expect(row?.active).toBe(0);
  });
});
