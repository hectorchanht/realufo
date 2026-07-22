import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../index";
import { seedTestDB } from "./helpers";

beforeAll(() => seedTestDB(env.DB));
const call = (p: string, init?: RequestInit, overrideEnv?: any) =>
  worker.fetch(new Request("https://x" + p, init), overrideEnv ?? (env as any), {} as any);

describe("cases+auth", () => {
  it("returns case + related thread", async () => {
    const j: any = await (await call("/api/cases/roswell")).json();
    expect(j.case.slug).toBe("roswell");
    expect("relatedThread" in j).toBe(true);
  });
  it("404 unknown case", async () => {
    expect((await call("/api/cases/nope")).status).toBe(404);
  });
  it("auth stub returns fake session", async () => {
    const j: any = await (await call("/api/auth/login", { method: "POST", body: JSON.stringify({ method: "google" }) })).json();
    expect(j.stub).toBe(true);
    expect(j.me.handle).toBe("agent_scully");
  });
  it("case with seeded thread returns populated relatedThread", async () => {
    const j: any = await (await call("/api/cases/kaikoura")).json();
    expect(j.case.slug).toBe("kaikoura");
    expect(j.relatedThread).not.toBeNull();
    expect(j.relatedThread.id).toBe("t5");
    expect(j.relatedThread.boardSlug).toBe("/cases/");
    expect(j.relatedThread.accent).toBe("#c8a2ff");
    expect(j.relatedThread.ago).toBeDefined();
  });
  it("auth with FEATURE_AUTH=true returns 501", async () => {
    const res = await call("/api/auth/login", { method: "POST", body: JSON.stringify({}) }, { ...env, FEATURE_AUTH: "true" });
    expect(res.status).toBe(501);
    const j: any = await res.json();
    expect(j.error).toBe("not implemented");
  });
  it("auth with empty body defaults to anon_signal", async () => {
    const j: any = await (await call("/api/auth/login", { method: "POST", body: JSON.stringify({}) })).json();
    expect(j.stub).toBe(true);
    expect(j.me.handle).toBe("anon_signal");
  });
  it("auth with explicit handle uses it", async () => {
    const j: any = await (await call("/api/auth/login", { method: "POST", body: JSON.stringify({ handle: "spacecowboy" }) })).json();
    expect(j.stub).toBe(true);
    expect(j.me.handle).toBe("spacecowboy");
  });
});
