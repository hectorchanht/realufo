import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../index";
import { seedTestDB } from "./helpers";
import { loadRecord } from "../routes/records";

beforeAll(() => seedTestDB(env.DB));
const get = (p: string) => worker.fetch(new Request("https://x" + p), env as any, {} as any);

describe("records", () => {
  it("loadRecord returns the detail object, or null when missing", async () => {
    expect(await loadRecord(env as any, "NOPE")).toBeNull();
    const d: any = await loadRecord(env as any, "FBI-UAP-D002");
    expect(d.record.id).toBe("FBI-UAP-D002");
    expect(d.series.next).toBe("FBI-UAP-D003");
    expect(d.related.some((g: any) => g.key === "location")).toBe(true);
    expect(d.assets.every((a: any) => "duration" in a)).toBe(true);
  });
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
  it("detail carries related groups (location, period, release, agency), deduped, self excluded", async () => {
    const ins = (id: string, agency: string, loc: string | null, inc: string | null, doc: string | null) =>
      env.DB.prepare(
        "INSERT INTO records (id,archive,agency,title,kind,location,incident_date,doc_date) VALUES (?,'wargov',?,?,'pdf',?,?,?)"
      ).bind(id, agency, id, loc, inc, doc);
    await env.DB.batch([
      ins("RELG-A", "RELGAG", "Relgville", "October, 2031", "3/3/31"),
      ins("RELG-LOC", "OTHER", "Relgville", null, null),
      ins("RELG-LOCYR", "OTHER", "Relgville", "2031", null), // matches loc + period → only in loc
      ins("RELG-YR2", "OTHER", "N/A", "9/8/31", null), // m/d/yy form of the same year
      ins("RELG-REL", "OTHER", null, null, "3/3/31"),
      ins("RELG-AG", "RELGAG", "N/A", null, null),
    ]);
    const rel: any[] = ((await (await get("/api/records/RELG-A")).json()) as any).related;
    const ids = (k: string) => rel.find((g) => g.key === k)?.records.map((r: any) => r.id).sort();
    expect(rel.map((g) => g.key)).toEqual(["location", "period", "release", "agency"]);
    expect(rel.find((g) => g.key === "location").label).toBe("Relgville");
    expect(ids("location")).toEqual(["RELG-LOC", "RELG-LOCYR"]);
    expect(ids("period")).toEqual(["RELG-YR2"]);
    expect(rel.find((g) => g.key === "period").label).toBe("2031");
    expect(ids("release")).toEqual(["RELG-REL"]);
    expect(ids("agency")).toEqual(["RELG-AG"]);
    // a record with no location/date/neighbours gets no empty groups
    const lone: any[] = ((await (await get("/api/records/RELG-YR2")).json()) as any).related;
    expect(lone.every((g) => g.records.length > 0)).toBe(true);
    expect(lone.map((g) => g.key)).not.toContain("location"); // "N/A" isn't a location
  });
  it("filters by release number, agency, decade and location; facets list them with counts", async () => {
    const ins = (id: string, archive: string, agency: string, loc: string | null, inc: string | null, doc: string | null) =>
      env.DB.prepare(
        "INSERT INTO records (id,archive,agency,title,kind,location,incident_date,doc_date) VALUES (?,?,?,?,'pdf',?,?,?)"
      ).bind(id, archive, agency, id, loc, inc, doc);
    await env.DB.batch([
      ins("FAC-1", "wargov", "FACAG", "Facville", "12/30/47", "1/1/90"), // m/d/yy before 2000 → 1947
      ins("FAC-2", "wargov", "FACAG", "Facville", "November, 1949", "1/1/90"),
      ins("FAC-3", "wargov", "OTHERAG", "Elsewhere", "1952-1953", "2/1/90"),
      ins("FAC-4", "nara", "FACAG", "Facville", "1/9/50", "1/1/90"), // nara dates aren't releases
    ]);
    const ids = async (qs: string) =>
      ((await (await get(`/api/records?${qs}&limit=100`)).json()) as any).records.map((r: any) => r.id).filter((i: string) => i.startsWith("FAC-")).sort();
    const facets: any = await (await get("/api/records/facets")).json();
    const rel = facets.releases.find((r: any) => r.date === "2090-01-01");
    expect(rel.count).toBe(2);
    expect(facets.releases.find((r: any) => r.date === "2090-02-01").no).toBe(rel.no + 1);
    expect(await ids(`release=${rel.no}`)).toEqual(["FAC-1", "FAC-2"]);
    expect(await ids("release=999")).toEqual([]);
    expect(await ids("agency=FACAG")).toEqual(["FAC-1", "FAC-2", "FAC-4"]);
    expect(await ids("location=Facville&agency=FACAG&archive=wargov")).toEqual(["FAC-1", "FAC-2"]);
    expect(await ids("decade=1940")).toEqual(["FAC-1", "FAC-2"]);
    expect(await ids("decade=1950")).toEqual(["FAC-3", "FAC-4"]);
    expect(facets.agencies.find((a: any) => a.name === "FACAG").count).toBe(3);
    expect(facets.locations.find((l: any) => l.name === "Facville").count).toBe(3);
    expect(facets.locations.some((l: any) => l.name === "N/A" || l.name === "")).toBe(false);
    expect(facets.decades.find((d: any) => d.decade === 1940).count).toBeGreaterThanOrEqual(2);
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
