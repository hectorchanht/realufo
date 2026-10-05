// worker/tests/contentTick.spec.ts
// Production producers for the Telegram Admin Portal v2: pending records and
// staged Shorts go through queueContent(); approval publishes them.
import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { seedTestDB } from "./helpers";
import { contentTick, queueStagedRecords, queueStagedShort } from "../lib/contentTick";
import { approve, gateOn } from "../lib/gate";
import { getJob, move } from "../lib/jobs";

beforeAll(() => seedTestDB(env.DB));

const TG = { TELEGRAM_BOT_TOKEN: "x", TELEGRAM_OWNER_ID: "777" };
const E = (extra: Record<string, unknown> = {}) => ({ ...env, ...TG, FEATURE_GATE: "on", ...extra }) as any;

let tg: { method: string; body: any }[] = [];
beforeEach(async () => {
  for (const t of ["bot_job_versions", "bot_jobs"]) await env.DB.prepare(`DELETE FROM ${t}`).run();
  await env.DB.prepare("DELETE FROM records WHERE id LIKE 'CT-%'").run();
  for (const o of (await env.MEDIA.list({ prefix: "clips-staging/" })).objects) await env.MEDIA.delete(o.key);
  for (const o of (await env.MEDIA.list({ prefix: "clips-v/" })).objects) await env.MEDIA.delete(o.key);
  tg = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (u: any, init?: any) => {
    const url = String(u);
    if (url.startsWith("https://api.telegram.org/")) {
      const method = url.split("/").pop()!;
      tg.push({ method, body: init.body instanceof FormData ? Object.fromEntries(init.body as any) : JSON.parse(init.body) });
      return new Response(JSON.stringify({ ok: true, result: { message_id: 100 + tg.length } }));
    }
    throw new Error("unexpected fetch " + url);
  });
});
afterEach(() => vi.restoreAllMocks());

const jobs = async () => (await env.DB.prepare("SELECT id, kind, stream, ref, status, caption, payload FROM bot_jobs ORDER BY id").all<any>()).results;
// owner taps ✅: the same move + approve the webhook does
const approveJob = async (id: number) => {
  const before = await getJob(E(), id);
  expect(await move(E(), id, before!.version, ["post_wait"], "approved")).toBe(true);
  return approve(E(), (await getJob(E(), id))!);
};

describe("pending records", () => {
  it("queues a preview and publishes on approval", async () => {
    await env.DB.prepare("INSERT INTO records(id,archive,kind,title,summary,status) VALUES ('CT-R1','wargov','pdf','Pending doc','a summary','pending')").run();
    expect(await queueStagedRecords(E())).toBe(1);
    const j = await jobs();
    expect(j).toHaveLength(1);
    expect(j[0]).toMatchObject({ kind: "record", stream: "record", ref: "CT-R1", status: "post_wait" });
    expect(JSON.parse(j[0].payload)).toEqual({ sql: ["UPDATE records SET status='live' WHERE id='CT-R1'"] });
    expect(tg.map((t) => t.method)).toEqual(["sendMessage"]); // no media for records
    // still pending until the owner taps ✅
    expect((await env.DB.prepare("SELECT status FROM records WHERE id='CT-R1'").first<any>()).status).toBe("pending");
    const line = await approveJob(j[0].id);
    expect(line).toContain("is live");
    expect((await env.DB.prepare("SELECT status FROM records WHERE id='CT-R1'").first<any>()).status).toBe("live");
  });
  it("does not re-queue records that already have a job", async () => {
    await env.DB.prepare("INSERT INTO records(id,archive,kind,title,status) VALUES ('CT-R2','wargov','pdf','R2','pending')").run();
    expect(await queueStagedRecords(E())).toBe(1);
    expect(await queueStagedRecords(E())).toBe(0); // open job exists: quiet
    expect(await jobs()).toHaveLength(1);
  });
  it("stays quiet when the record stream is paused", async () => {
    await env.DB.prepare("INSERT INTO records(id,archive,kind,title,status) VALUES ('CT-R3','wargov','pdf','R3','pending')").run();
    await env.DB.prepare("INSERT INTO bot_settings(key,value) VALUES ('paused_record','1') ON CONFLICT(key) DO UPDATE SET value='1'").run();
    expect(await queueStagedRecords(E())).toBe(0);
    expect(await jobs()).toHaveLength(0);
    await env.DB.prepare("UPDATE bot_settings SET value='0' WHERE key='paused_record'").run();
  });
});

describe("staged shorts (R2 staging)", () => {
  beforeEach(async () => {
    await env.DB.prepare("INSERT INTO records(id,archive,kind,title,status) VALUES ('CT-V1','wargov','video','Pending vid','live')").run();
    await env.MEDIA.put("clips-staging/wargov/CT-V1.mp4", new Uint8Array(100), { httpMetadata: { contentType: "video/mp4" } });
  });
  it("queues one short with the clip attached, then stays quiet", async () => {
    expect(await queueStagedShort(E())).toBe(1);
    const j = await jobs();
    expect(j).toHaveLength(1);
    expect(j[0]).toMatchObject({ kind: "short", stream: "short", ref: "CT-V1", status: "post_wait" });
    expect(JSON.parse(j[0].payload)).toEqual({ r2move: { from: "clips-staging/wargov/CT-V1.mp4", to: "clips-v/wargov/CT-V1.mp4" } });
    expect(tg.map((t) => t.method)).toEqual(["sendVideo", "sendMessage"]); // the owner curates by watching
    expect(await queueStagedShort(E())).toBe(0); // one at a time in the gate
  });
  it("promotes the clip on approval and enforces one posted short per 24h", async () => {
    expect(await queueStagedShort(E())).toBe(1);
    const [{ id }] = await jobs();
    await approveJob(id);
    expect(await env.MEDIA.head("clips-v/wargov/CT-V1.mp4")).not.toBeNull();
    expect(await env.MEDIA.head("clips-staging/wargov/CT-V1.mp4")).toBeNull();
    // a fresh staged clip the same day: not offered (one per day)
    await env.DB.prepare("INSERT INTO records(id,archive,kind,title,status) VALUES ('CT-V2','wargov','video','V2','live')").run();
    await env.MEDIA.put("clips-staging/wargov/CT-V2.mp4", new Uint8Array(100), { httpMetadata: { contentType: "video/mp4" } });
    expect(await queueStagedShort(E())).toBe(0);
    // …but yesterday's post doesn't block today
    await env.DB.prepare("UPDATE bot_jobs SET updated_at=datetime('now','-25 hours') WHERE stream='short'").run();
    expect(await queueStagedShort(E())).toBe(1);
  });
  it("drops staging copies that are already live", async () => {
    await env.MEDIA.put("clips-v/wargov/CT-V1.mp4", new Uint8Array(50), { httpMetadata: { contentType: "video/mp4" } });
    expect(await queueStagedShort(E())).toBe(0);
    expect(await jobs()).toHaveLength(0);
    expect(await env.MEDIA.head("clips-staging/wargov/CT-V1.mp4")).toBeNull();
  });
});

describe("contentTick", () => {
  it("gate off publishes directly (pre-portal behavior)", async () => {
    expect(gateOn(E({ FEATURE_GATE: "off" }))).toBe(false);
    await env.DB.prepare("INSERT INTO records(id,archive,kind,title,status) VALUES ('CT-D1','wargov','pdf','Direct','pending')").run();
    await env.DB.prepare("INSERT INTO records(id,archive,kind,title,status) VALUES ('CT-D2','wargov','video','Direct vid','live')").run();
    await env.MEDIA.put("clips-staging/wargov/CT-D2.mp4", new Uint8Array(100), { httpMetadata: { contentType: "video/mp4" } });
    await contentTick(E({ FEATURE_GATE: "off" }));
    expect((await env.DB.prepare("SELECT status FROM records WHERE id='CT-D1'").first<any>()).status).toBe("live");
    expect(await jobs()).toHaveLength(0);
    expect(tg).toHaveLength(0);
    expect(await env.MEDIA.head("clips-v/wargov/CT-D2.mp4")).not.toBeNull();
  });
});
