import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../index";
import { seedTestDB } from "./helpers";

beforeAll(() => seedTestDB(env.DB));
const call = (p: string, init?: RequestInit) => worker.fetch(new Request("https://x" + p, init), env as any, {} as any);

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
});
