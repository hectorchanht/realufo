import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../index";
import { seedTestDB } from "./helpers";
import { ftsQuery } from "../routes/records";

beforeAll(() => seedTestDB(env.DB));
const get = (p: string) => worker.fetch(new Request("https://x" + p), env as any, {} as any);
const hits = (word: string) =>
  env.DB.prepare("SELECT record_id, page FROM record_fts WHERE record_fts MATCH ?").bind(word).all<{ record_id: string; page: number }>().then((r) => r.results);
const putText = (id: string, pages: { n: number; text: string }[]) =>
  env.DB.prepare("INSERT OR REPLACE INTO record_text(record_id,pages,truncated,total_pages) VALUES(?,?,0,?)")
    .bind(id, JSON.stringify(pages), pages.length)
    .run();

describe("record_fts (search inside documents)", () => {
  it("leaves OCR'd files' FTS rows alone (they're written from R2 by crawler ingest.ocr)", async () => {
    await env.DB.prepare("INSERT OR REPLACE INTO record_ocr(record_id,pages,ocr_pages,chars,engine) VALUES('FBI-UAP-D002',2,2,40,'t')").run();
    await env.DB.prepare("DELETE FROM record_fts WHERE record_id='FBI-UAP-D002'").run();
    await env.DB.prepare("INSERT INTO record_fts(record_id,page,body) VALUES('FBI-UAP-D002',40,'the frobnitz memo on page forty')").run();
    await putText("FBI-UAP-D002", [{ n: 1, text: "capped wibble text" }]); // fulltext rebuild: must not touch FTS
    expect(await hits("wibble")).toEqual([]);
    expect(await hits("frobnitz")).toEqual([{ record_id: "FBI-UAP-D002", page: 40 }]);
    await env.DB.prepare("DELETE FROM record_text WHERE record_id='FBI-UAP-D002'").run(); // OCR requeue
    expect(await hits("frobnitz")).toEqual([{ record_id: "FBI-UAP-D002", page: 40 }]);
    await env.DB.prepare("DELETE FROM record_ocr WHERE record_id='FBI-UAP-D002'").run();
    await env.DB.prepare("DELETE FROM record_fts WHERE record_id='FBI-UAP-D002'").run();
  });

  it("record_text has an ai_sections column", async () => {
    const cols = await env.DB.prepare("PRAGMA table_info(record_text)").all<{ name: string }>();
    expect(cols.results.map((c) => c.name)).toContain("ai_sections");
  });

  it("stays in sync with record_text on insert, replace and delete", async () => {
    await putText("FBI-UAP-D002", [{ n: 1, text: "cover" }, { n: 7, text: "the zorblax report" }]);
    expect(await hits("zorblax")).toEqual([{ record_id: "FBI-UAP-D002", page: 7 }]);

    await putText("FBI-UAP-D002", [{ n: 1, text: "quixotic sighting" }]);
    expect(await hits("zorblax")).toEqual([]);
    expect(await hits("quixotic")).toEqual([{ record_id: "FBI-UAP-D002", page: 1 }]);

    await env.DB.prepare("DELETE FROM record_text WHERE record_id='FBI-UAP-D002'").run();
    expect(await hits("quixotic")).toEqual([]);
  });

  it("q finds a file by its page text and returns the matching page excerpt", async () => {
    await putText("FBI-UAP-D002", [{ n: 3, text: "Witnesses described several weather balloons over the ridge." }]);
    const j: any = await (await get("/api/records?q=balloon")).json(); // stemmed: balloons
    const r = j.records.find((x: any) => x.id === "FBI-UAP-D002");
    expect(r).toBeTruthy();
    expect(r.match.page).toBe(3);
    expect(r.match.text).toMatch(/weather balloons/);
    expect(j.count).toBeGreaterThanOrEqual(1);
  });

  it("the last word matches as a prefix (search as you type)", async () => {
    await putText("FBI-UAP-D002", [{ n: 1, text: "Kecksburg acorn object" }]);
    const j: any = await (await get("/api/records?q=kecksbu")).json();
    expect(j.records.map((x: any) => x.id)).toContain("FBI-UAP-D002");
  });

  it("an exact word beats a prefix-only hit, and the excerpt is the exact page", async () => {
    await putText("FBI-UAP-D002", [{ n: 1, text: "Office of Public Affairs memo" }]);
    await putText("FBI-UAP-D009", [{ n: 2, text: "Public Affairs liaison" }, { n: 15, text: '"AFFA" is the Commander of the ship' }]);
    const j: any = await (await get("/api/records?q=AFFA")).json();
    const ids = j.records.map((x: any) => x.id);
    expect(ids[0]).toBe("FBI-UAP-D009");
    expect(ids).toContain("FBI-UAP-D002"); // prefix still matches
    expect(j.records[0].match.page).toBe(15);
  });

  it("an exact phrase beats the same words scattered, which beat metadata substrings", async () => {
    await putText("FBI-UAP-D002", [{ n: 1, text: "the men wore black hats in town" }]);
    await putText("FBI-UAP-D009", [{ n: 4, text: "men in black" }, { n: 82, text: "two men in black suits came" }]);
    const j: any = await (await get("/api/records?q=men%20in%20black")).json();
    const ids = j.records.map((x: any) => x.id);
    expect(ids.slice(0, 2)).toEqual(["FBI-UAP-D009", "FBI-UAP-D002"]);
    expect([4, 82]).toContain(j.records[0].match.page);
  });

  it("files matching on title/summary come before text-only matches", async () => {
    await putText("FBI-UAP-D002", [{ n: 1, text: "flight from harare airport" }]);
    const j: any = await (await get("/api/records?q=harare")).json();
    const ids = j.records.map((x: any) => x.id);
    expect(ids[0]).toBe("CIA-UAP-017");
    expect(ids).toContain("FBI-UAP-D002");
  });

  it("metadata search matches every word anywhere, in any field, including the id", async () => {
    const ids = async (q: string) =>
      ((await (await get("/api/records?q=" + encodeURIComponent(q))).json()) as any).records.map((x: any) => x.id);
    expect(await ids("uap d009")).toContain("FBI-UAP-D009"); // last two parts of the id, space-separated
    expect(await ids("uap-d009")).toContain("FBI-UAP-D009");
    expect(await ids("orb d010")).toContain("FBI-UAP-D010"); // title word + id part
    expect(await ids("orb d011")).not.toContain("FBI-UAP-D011"); // every word must hit
    expect(await ids("zimbabwe cia")).toContain("CIA-UAP-017"); // location + agency
    expect(await ids("defensewhat")).toContain("255413270UFOsandDefenseWhatShouldwePrepareFor"); // id-only text
  });

  it("hostile search syntax never errors", async () => {
    for (const q of ['"tic', "a*b", "-x OR", "NEAR(", "^^^", '""']) {
      const res = await get("/api/records?q=" + encodeURIComponent(q));
      expect(res.status, q).toBe(200);
    }
  });

  it("ftsQuery quotes words, prefixes the last, and drops punctuation", () => {
    expect(ftsQuery("tic tac")).toBe('"tic" "tac"*');
    expect(ftsQuery('"weather* -balloon')).toBe('"weather" "balloon"*');
    expect(ftsQuery("!!!")).toBeNull();
    // one-letter words are noise; short last words aren't prefixes ("b*" = everything)
    expect(ftsQuery("a*b")).toBeNull();
    expect(ftsQuery("area 51")).toBe('"area" "51"');
  });
});
