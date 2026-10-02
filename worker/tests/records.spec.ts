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
  it("card thumb falls back to an image record's full file when it has no thumb asset", async () => {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO records (id,archive,agency,title,kind) VALUES ('IMG-NOTHUMB','wargov','NASA','zzimgnothumb','image')"),
      env.DB.prepare("INSERT INTO assets (record_id,role,cdn_url,mime) VALUES ('IMG-NOTHUMB','full','https://cdn/x.jpg','image/jpeg')"),
    ]);
    const j: any = await (await get("/api/records?q=zzimgnothumb")).json();
    expect(j.records[0].thumb).toBe("https://cdn/x.jpg");
  });
  it("detail carries series prev/next ordered by number then suffix", async () => {
    await env.DB.batch(
      ["SERX-UAP-D002A", "SERX-UAP-D001", "SERX-UAP-D010", "SERX-UAP-D002", "SERX-UAP-PR001", "90001", "90002"].map((id) =>
        env.DB.prepare("INSERT INTO records (id,archive,agency,title,kind) VALUES (?,'wargov','X',?,'pdf')").bind(id, id)
      )
    );
    const s = async (id: string) => ((await (await get(`/api/records/${id}`)).json()) as any).series;
    expect(await s("SERX-UAP-D002")).toEqual({ prev: "SERX-UAP-D001", next: "SERX-UAP-D002A" });
    expect(await s("SERX-UAP-D001")).toEqual({ prev: null, next: "SERX-UAP-D002" });
    expect(await s("SERX-UAP-D010")).toEqual({ prev: "SERX-UAP-D002A", next: null });
    expect(await s("SERX-UAP-PR001")).toEqual({ prev: null, next: null }); // different prefix = own series
    expect(await s("90001")).toEqual({ prev: null, next: null }); // bare numbers aren't a series
  });
  it("detail carries the war.gov release number ranked by release date", async () => {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO records (id,archive,agency,title,kind,doc_date) VALUES ('REL-EARLY','wargov','X','t','pdf','1/2/20')"),
      env.DB.prepare("INSERT INTO records (id,archive,agency,title,kind,doc_date) VALUES ('REL-NARA','nara','X','t','pdf','1/1/19')"),
    ]);
    const r = async (id: string) => ((await (await get(`/api/records/${id}`)).json()) as any).release;
    expect(await r("REL-EARLY")).toEqual({ no: 1, date: "2020-01-02" });
    expect(await r("REL-NARA")).toBeNull(); // non-wargov dates aren't release dates
  });
  it("404s unknown id", async () => {
    expect((await get("/api/records/NOPE")).status).toBe(404);
  });
  it("clamps a negative limit to the 100 cap without breaking the true count", async () => {
    const res = await get("/api/records?limit=-1");
    expect(res.status).toBe(200);
    const j: any = await res.json();
    expect(j.records.length).toBeLessThanOrEqual(100);
    expect(j.count).toBeGreaterThan(0);
  });
  it("falls back to the default page size for a non-numeric limit", async () => {
    const res = await get("/api/records?limit=abc");
    expect(res.status).toBe(200);
    const j: any = await res.json();
    expect(j.records.length).toBeLessThanOrEqual(40);
  });
});
