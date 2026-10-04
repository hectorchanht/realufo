import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { seedTestDB } from "./helpers";
import { nextCandidate, withinBudget, costOf, mediaFor, sqlTime } from "../lib/xpick";

beforeAll(() => seedTestDB(env.DB));

const T = (iso: string) => new Date(iso + "Z");
const NOW = T("2026-10-10T15:00:00"); // pick slot open, highlight slot closed
// Pin the bot schedule/budget these tests were written for: the cloudflare:test env
// carries wrangler.jsonc's production vars (X_PICK_HOURS="15,18,21", X_DAILY_MAX="4"
// since bfa2884), which would turn "later the same day" into a fresh pick slot.
const BOT = { X_PICK_HOURS: "14", X_DAILY_MAX: "3", X_MONTHLY_USD_CAP: "10" };
const E = (extra: Record<string, unknown> = {}) => ({ ...env, ...BOT, X_SINCE: "2026-10-01", ...extra }) as any;

async function rec(id: string, kind: string, opts: { archive?: string; doc_date?: string; created?: string; thumb?: boolean } = {}) {
  const archive = opts.archive ?? "wargov";
  await env.DB.prepare(
    "INSERT INTO records(id,archive,kind,title,doc_date,status,created_at) VALUES (?,?,?,?,?,'live',?)"
  ).bind(id, archive, kind, `Title ${id}`, opts.doc_date ?? null, opts.created ?? "2026-09-01 00:00:00").run();
  if (opts.thumb) {
    await env.DB.prepare("INSERT INTO assets(record_id,role,cdn_url,mime) VALUES (?,'thumb',?,'image/jpeg')")
      .bind(id, `https://assets.realufo.org/thumbs/${archive}/${id}.jpg`).run();
    await env.MEDIA.put(`thumbs/${archive}/${id}.jpg`, new Uint8Array(100));
  }
}
const clip = (id: string, archive = "wargov", bytes = 100) => env.MEDIA.put(`clips/${archive}/${id}.mp4`, new Uint8Array(bytes));
const posted = (stream: string, ref: string, at: Date, cost = 0.015, status = "posted") =>
  env.DB.prepare("INSERT INTO x_posts(stream,ref,text,ai,cost_usd,status,created_at) VALUES (?,?,'t',0,?,?,?)")
    .bind(stream, ref, cost, status, sqlTime(at)).run();

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM x_posts").run();
  await env.DB.prepare("DELETE FROM threads WHERE id LIKE 'XT-%'").run(); // before records: FK
  await env.DB.prepare("DELETE FROM assets WHERE record_id LIKE 'XT-%'").run();
  await env.DB.prepare("DELETE FROM records WHERE id LIKE 'XT-%'").run();
  // seed rows get created_at = real now, which would look like fresh releases
  await env.DB.prepare("UPDATE records SET created_at='2020-01-01 00:00:00'").run();
  const listed = await env.MEDIA.list({ prefix: "clips/" });
  for (const o of listed.objects) await env.MEDIA.delete(o.key);
});

describe("release candidates", () => {
  it("one summary per new war.gov release, linked to its archive filter, once settled 2h", async () => {
    await rec("XT-R1", "pdf", { doc_date: "10/8/26", created: "2026-10-10 06:10:00" });
    await rec("XT-R2", "video", { doc_date: "10/8/26", created: "2026-10-10 06:20:00" });
    await clip("XT-R2");
    expect((await nextCandidate(E(), T("2026-10-10T07:00:00")))?.stream).not.toBe("release"); // < 2h old
    const c = await nextCandidate(E(), T("2026-10-10T09:00:00"));
    expect(c).toMatchObject({ stream: "release", kinds: { pdf: 1, video: 1 } });
    if (c?.stream !== "release") throw 0;
    expect(c.ref).toBe("wargov:2026-10-08"); // stable: a late file with an earlier date can't renumber it
    expect(c.link).toMatch(/^https:\/\/realufo\.org\/archive\?release=\d+$/);
    expect(c.media).toEqual({ key: "clips/wargov/XT-R2.mp4", mime: "video/mp4", size: 100 });
  });
  it("never announces releases when X_SINCE is unset, or ones older than X_SINCE", async () => {
    await rec("XT-R3", "pdf", { doc_date: "10/9/26", created: "2026-10-10 06:00:00" });
    expect((await nextCandidate(E({ X_SINCE: "" }), NOW))?.stream).not.toBe("release");
    expect((await nextCandidate(E({ X_SINCE: "2026-10-11" }), NOW))?.stream).not.toBe("release");
  });
  it("groups other archives by archive + ingest day", async () => {
    await rec("XT-A1", "image", { archive: "aaro", created: "2026-10-10 06:00:00" });
    const c = await nextCandidate(E(), NOW);
    expect(c).toMatchObject({ stream: "release", ref: "aaro:2026-10-10", link: "https://realufo.org/archive?archive=aaro" });
  });
  it("skips a release already in x_posts", async () => {
    await rec("XT-A2", "pdf", { archive: "aaro", created: "2026-10-10 06:00:00" });
    await posted("release", "aaro:2026-10-10", NOW);
    expect((await nextCandidate(E(), NOW))?.stream).not.toBe("release");
  });
});

describe("showcase (X_FORCE_SHOWCASE)", () => {
  it("posts the operator video + text for a live record, once, only if the video exists", async () => {
    await rec("XT-S1", "video");
    const early = T("2026-10-10T08:00:00");
    const S = { X_FORCE_SHOWCASE: "XT-S1", X_SHOWCASE_TEXT: "only 3 of 289 frames 👀" };
    expect(await nextCandidate(E(S), early)).toBeNull(); // no showcase video uploaded yet
    await env.MEDIA.put("showcase/wargov/XT-S1.mp4", new Uint8Array(50));
    const c = await nextCandidate(E(S), early);
    expect(c).toMatchObject({ stream: "showcase", ref: "XT-S1", text: "only 3 of 289 frames 👀", media: { key: "showcase/wargov/XT-S1.mp4", mime: "video/mp4" } });
    const { draft } = await import("../lib/xcopy");
    expect((await draft(env as any, c!)).text).toBe("only 3 of 289 frames 👀\nhttps://realufo.org/doc/XT-S1");
    await posted("showcase", "XT-S1", early);
    expect(await nextCandidate(E(S), early)).toBeNull(); // once per record
    expect(await nextCandidate(E({ X_FORCE_SHOWCASE: "XT-S1" }), early)).toBeNull(); // no text, no post
  });
});

describe("forced pick (X_FORCE_PICK)", () => {
  it("posts the named record outside pick slots, once, and only if live", async () => {
    await rec("XT-F1", "video");
    await clip("XT-F1");
    const early = T("2026-10-10T08:00:00"); // no pick slot reached
    expect(await nextCandidate(E(), early)).toBeNull();
    const c = await nextCandidate(E({ X_FORCE_PICK: "NOPE, XT-F1" }), early);
    expect(c).toMatchObject({ stream: "pick", ref: "XT-F1", media: { key: "clips/wargov/XT-F1.mp4" } });
    await posted("pick", "XT-F1", early);
    expect(await nextCandidate(E({ X_FORCE_PICK: "XT-F1" }), early)).toBeNull(); // already posted
  });

  it("never falls through to the bot's own picks once the forced record is posted", async () => {
    await rec("XT-F2", "video"); await clip("XT-F2");
    await rec("XT-F3", "video"); await clip("XT-F3"); // unapproved, and the pick slot is open
    await posted("pick", "XT-F2", T("2026-10-09T15:00:00")); // yesterday: today's slot is still open
    expect(await nextCandidate(E({ X_FORCE_PICK: "XT-F2" }), NOW)).toBeNull();
    expect(await nextCandidate(E({ X_FORCE_SHOWCASE: "XT-F2", X_SHOWCASE_TEXT: "t" }), NOW)).toBeNull();
  });
});

describe("daily pick", () => {
  it("prefers a video that has a clip, once per UTC day after 14:00", async () => {
    await rec("XT-V1", "video");
    await clip("XT-V1");
    expect(await nextCandidate(E(), T("2026-10-10T13:00:00"))).toBeNull();
    const c = await nextCandidate(E(), NOW);
    expect(c).toMatchObject({ stream: "pick", ref: "XT-V1", link: "https://realufo.org/doc/XT-V1", media: { key: "clips/wargov/XT-V1.mp4", mime: "video/mp4" } });
    await posted("pick", "XT-V1", NOW);
    expect(await nextCandidate(E(), T("2026-10-10T18:00:00"))).toBeNull();
  });
  it("X_PICK_HOURS spreads several picks across the day, one per passed slot", async () => {
    for (const v of ["XT-P1", "XT-P2", "XT-P3", "XT-P4"]) { await rec(v, "video"); await clip(v); }
    const env = E({ X_PICK_HOURS: "15,18,21" });
    const at = (h: string) => T(`2026-10-10T${h}:00:00`);
    expect(await nextCandidate(env, at("14"))).toBeNull();
    const first = await nextCandidate(env, at("15"));
    expect(first?.stream).toBe("pick");
    await posted("pick", first!.ref, at("15"));
    expect(await nextCandidate(env, at("16"))).toBeNull();      // slot 1 used, slot 2 not yet
    const second = await nextCandidate(env, at("18"));
    expect(second?.stream).toBe("pick");
    await posted("pick", second!.ref, at("18"));
    const third = await nextCandidate(env, at("21"));
    expect(third?.stream).toBe("pick");
    await posted("pick", third!.ref, at("21"));
    expect(await nextCandidate(env, at("23"))).toBeNull();      // 3 of 3 done
  });
  it("skips records whose title is the 'original title not published' placeholder", async () => {
    await rec("XT-V3", "video");
    await env.DB.prepare("UPDATE records SET title='AARO video · DOD_1 (original title not published)' WHERE id='XT-V3'").run();
    await clip("XT-V3");
    const c = await nextCandidate(E(), NOW);
    expect(c?.ref).not.toBe("XT-V3");
  });
  it("falls back to an image/pdf with its thumb when no clip is left", async () => {
    await rec("XT-I1", "image", { thumb: true });
    const c = await nextCandidate(E(), NOW);
    expect(c?.stream).toBe("pick");
    if (c?.stream !== "pick") throw 0;
    expect(["image", "pdf"]).toContain(c.record.kind);
  });
});

describe("highlight", () => {
  it("top-voted recent thread after 20:00, media only from its source record", async () => {
    await posted("pick", "already", T("2026-10-10T14:00:00"));
    await rec("XT-V2", "video");
    await clip("XT-V2");
    await env.DB.prepare(
      "INSERT INTO threads(id,title,op_body,votes,source_record_id,created_at) VALUES ('XT-T1','Odd lights','body text',99999,'XT-V2',?)"
    ).bind(sqlTime(T("2026-10-09T10:00:00"))).run();
    expect(await nextCandidate(E(), T("2026-10-10T19:00:00"))).toBeNull();
    const c = await nextCandidate(E({ X_HIGHLIGHT_MIN_VOTES: "5" }), T("2026-10-10T21:00:00"));
    expect(c).toMatchObject({ stream: "highlight", ref: "XT-T1", thread: { title: "Odd lights", votes: 99999 }, media: { key: "clips/wargov/XT-V2.mp4" } });
  });
});

describe("highlight opt-in", () => {
  it("is off unless X_HIGHLIGHT_MIN_VOTES is set (votes are forgeable by one person)", async () => {
    await posted("pick", "already", T("2026-10-10T14:00:00"));
    await env.DB.prepare("INSERT INTO threads(id,title,op_body,votes,created_at) VALUES ('XT-T2','t','b',99999,?)")
      .bind(sqlTime(T("2026-10-09T10:00:00"))).run();
    expect(await nextCandidate(E({ X_HIGHLIGHT_MIN_VOTES: "" }), T("2026-10-10T21:00:00"))).toBeNull();
  });
});

describe("mediaFor", () => {
  it("skips thumbs over X's 5 MB image limit", async () => {
    await rec("XT-BIG", "image", { thumb: true });
    await env.MEDIA.put("thumbs/wargov/XT-BIG.jpg", new Uint8Array(5 * 1024 * 1024 + 1));
    expect(await mediaFor(E(), { id: "XT-BIG", archive: "wargov", kind: "image" })).toBeNull();
  });
});

describe("budget", () => {
  it("costs: URL $0.20, plain $0.015, +$0.015 with media", () => {
    const m = { key: "k", mime: "video/mp4", size: 1 };
    expect(costOf({ stream: "release", ref: "r", label: "", link: "", kinds: {}, titles: [], media: null })).toBeCloseTo(0.2);
    expect(costOf({ stream: "pick", ref: "p", record: {} as any, link: "https://realufo.org/doc/p", media: m })).toBeCloseTo(0.215);
    expect(costOf({ stream: "highlight", ref: "h", thread: {} as any, media: m })).toBeCloseTo(0.03);
  });
  it("enforces the daily max and monthly cap; failed rows don't count", async () => {
    await posted("pick", "a", NOW);
    await posted("pick", "b", NOW);
    await posted("pick", "f", NOW, 5, "failed");
    expect(await withinBudget(E(), 0.015, NOW)).toBe(true);
    await posted("pick", "c", NOW);
    expect(await withinBudget(E(), 0.015, NOW)).toBe(false); // 3/day
    expect(await withinBudget(E({ X_DAILY_MAX: "10", X_MONTHLY_USD_CAP: "0.05" }), 0.015, NOW)).toBe(false); // 0.045+0.015 > 0.05
  });
  it("counts story-poll posts in the monthly $ cap", async () => {
    await env.DB.prepare("INSERT OR IGNORE INTO articles(slug,title,body) VALUES ('budget-poll','T','B')").run();
    await env.DB.prepare("INSERT INTO poll_social(slug,platform,status,cost_usd,created_at) VALUES ('budget-poll','x','posted',0.05,?)")
      .bind(sqlTime(NOW)).run();
    expect(await withinBudget(E({ X_MONTHLY_USD_CAP: "0.06" }), 0.015, NOW, true)).toBe(false); // 0.05 + 0.015 > 0.06
    await env.DB.prepare("DELETE FROM poll_social WHERE slug='budget-poll'").run();
  });
});
