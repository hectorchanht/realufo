import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../index";
import { seedTestDB } from "./helpers";

beforeAll(() => seedTestDB(env.DB));
const get = (p: string) => worker.fetch(new Request("https://x" + p), env as any, {} as any);

describe("records", () => {
  it("filters by archive and returns count", async () => {
    const j: any = await (await get("/api/records?archive=wargov")).json();
    expect(j.count).toBeGreaterThan(0);
    expect(j.records.every((r: any) => r.archive === "wargov")).toBe(true);
  });
  it("full-text-ish q matches title/agency/location", async () => {
    const j: any = await (await get("/api/records?q=harare")).json();
    expect(j.records.some((r: any) => /harare/i.test(r.title + r.summary))).toBe(true);
  });
  it("detail returns record + assets + promoted threads back-reference", async () => {
    const j: any = await (await get("/api/records/CIA-UAP-017")).json();
    expect(j.record.id).toBe("CIA-UAP-017");
    expect(j.assets.length).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(j.promotedThreads)).toBe(true);
    expect(j.promotedThreads.some((t: any) => t.source_record_id === "CIA-UAP-017")).toBe(true); // t1 has rec CIA-UAP-017
  });
  it("404s unknown id", async () => {
    expect((await get("/api/records/NOPE")).status).toBe(404);
  });
});
