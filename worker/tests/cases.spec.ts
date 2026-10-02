import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../index";
import { seedTestDB } from "./helpers";

beforeAll(() => seedTestDB(env.DB));
const call = (p: string, init?: RequestInit, overrideEnv?: any) =>
  worker.fetch(new Request("https://x" + p, init), overrideEnv ?? (env as any), {} as any);

describe("cases", () => {
  it("returns case + related thread", async () => {
    const j: any = await (await call("/api/cases/roswell")).json();
    expect(j.case.slug).toBe("roswell");
    expect("relatedThread" in j).toBe(true);
  });
  it("404 unknown case", async () => {
    expect((await call("/api/cases/nope")).status).toBe(404);
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
  it("returns all threads for a case, newest first", async () => {
    const j: any = await (await call("/api/cases/kaikoura")).json();
    expect(Array.isArray(j.threads)).toBe(true);
    expect(j.threads.length).toBeGreaterThanOrEqual(1);
    expect(j.threads[0].id).toBe("t5");
    expect(j.threads[0]).toHaveProperty("replies");
    expect(j.threads[0].ago).toBeDefined();
  });
});
