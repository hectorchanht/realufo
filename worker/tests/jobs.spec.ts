import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { seedTestDB } from "./helpers";
import { createJob, getJob, jobByMessage, move, revise, setMessages, openJobs, getSetting, setSetting, NO_JOB } from "../lib/jobs";

beforeAll(() => seedTestDB(env.DB));
beforeEach(async () => {
  await env.DB.prepare("DELETE FROM bot_job_versions").run();
  await env.DB.prepare("DELETE FROM bot_jobs").run();
});
const base = { kind: "post" as const, status: "post_wait" as const, caption: "c1", media: null, payload: { x: 1 } };

describe("jobs", () => {
  it("one open job per bot stream; operator streams per (stream, ref)", async () => {
    const a = await createJob(env as any, { ...base, stream: "pick", ref: "R1" });
    expect(a).toMatchObject({ stream: "pick", ref: "R1", version: 1, payload: { x: 1 }, tg_msgs: [] });
    expect(await createJob(env as any, { ...base, stream: "pick", ref: "R2" })).toBeNull();
    expect(await createJob(env as any, { ...base, stream: "manual", ref: "R1" })).not.toBeNull();
    expect(await createJob(env as any, { ...base, stream: "manual", ref: "R2" })).not.toBeNull();
    expect(await createJob(env as any, { ...base, stream: "manual", ref: "R2" })).toBeNull();
    await move(env as any, a!.id, 1, ["post_wait"], "skipped");
    expect(await createJob(env as any, { ...base, stream: "pick", ref: "R3" })).not.toBeNull();
  });
  it("move only from the expected status and version, once", async () => {
    const j = (await createJob(env as any, { ...base, stream: "pick", ref: "R1" }))!;
    expect(await move(env as any, j.id, 2, ["post_wait"], "approved")).toBe(false); // stale version
    expect(await move(env as any, j.id, 1, ["post_wait"], "approved")).toBe(true);
    expect(await move(env as any, j.id, 1, ["post_wait"], "approved")).toBe(false); // double tap
    const v = await env.DB.prepare("SELECT decision FROM bot_job_versions WHERE job_id=? AND version=1").bind(j.id).first<{ decision: string }>();
    expect(v?.decision).toBe("approved");
  });
  it("revise bumps the version, keeps the old version row, and drops old message ids", async () => {
    const j = (await createJob(env as any, { ...base, stream: "pick", ref: "R1" }))!;
    await setMessages(env as any, j.id, [10, 11]);
    expect((await jobByMessage(env as any, 11))?.id).toBe(j.id);
    const r = (await revise(env as any, j.id, 1, "c2", "shorter please"))!;
    expect(r).toMatchObject({ version: 2, caption: "c2", tg_msgs: [] });
    expect(await jobByMessage(env as any, 11)).toBeNull();
    const vs = (await env.DB.prepare("SELECT version, caption, note FROM bot_job_versions WHERE job_id=? ORDER BY version").bind(j.id).all()).results;
    expect(vs).toEqual([{ version: 1, caption: "c1", note: null }, { version: 2, caption: "c2", note: "shorter please" }]);
    expect(await revise(env as any, j.id, 1, "c3", "x")).toBeNull(); // stale version
  });
  it("openJobs lists only open jobs; settings round-trip", async () => {
    const j = (await createJob(env as any, { ...base, stream: "pick", ref: "R1" }))!;
    await createJob(env as any, { ...base, stream: "manual", ref: "R9" });
    await move(env as any, j.id, 1, ["post_wait"], "posted");
    expect((await openJobs(env as any)).map((x) => x.ref)).toEqual(["R9"]);
    await setSetting(env as any, "paused_picks", "0");
    expect(await getSetting(env as any, "paused_picks")).toBe("0");
    expect((await getJob(env as any, j.id))?.status).toBe("posted");
  });
  it("NO_JOB ignores failed jobs, allowing retry on next tick", async () => {
    const j = (await createJob(env as any, { ...base, stream: "pick", ref: "R1" }))!;
    // Mark job as failed
    await move(env as any, j.id, 1, ["post_wait"], "failed", "preview delivery failed");
    // NO_JOB should return true (job can be retried) since only failed exists
    const noJobSql = NO_JOB("'R1'");
    const result = await env.DB.prepare(`SELECT 1 WHERE ${noJobSql}`).first<{ "1": number }>();
    expect(result).not.toBeNull(); // Returns a row = NO_JOB is true
    // Verify we can create another job for R1 (open jobs blocked, failed ignored)
    const retry = await createJob(env as any, { ...base, stream: "pick", ref: "R1" });
    expect(retry).not.toBeNull();
    expect(retry?.ref).toBe("R1");
  });
});
