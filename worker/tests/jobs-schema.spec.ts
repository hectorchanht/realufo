import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import { seedTestDB } from "./helpers";

beforeAll(() => seedTestDB(env.DB));

describe("0038_bot_jobs", () => {
  it("creates the job tables with picks paused by default", async () => {
    const s = await env.DB.prepare("SELECT value FROM bot_settings WHERE key='paused_picks'").first<{ value: string }>();
    expect(s?.value).toBe("1");
    const j = await env.DB.prepare(
      "INSERT INTO bot_jobs(kind,stream,ref,status,caption,payload) VALUES ('post','pick','R1','post_wait','hi','{}') RETURNING id, version"
    ).first<{ id: number; version: number }>();
    expect(j?.version).toBe(1);
    await env.DB.prepare("INSERT INTO bot_job_versions(job_id,version,caption) VALUES (?,1,'hi')").bind(j!.id).run();
    await expect(env.DB.prepare("INSERT INTO bot_jobs(kind,stream,ref,status,payload) VALUES ('nope','pick','R1','post_wait','{}')").run()).rejects.toThrow();
    await expect(env.DB.prepare("INSERT INTO bot_jobs(kind,stream,ref,status,payload) VALUES ('post','pick','R1','bogus','{}')").run()).rejects.toThrow();
  });
  it("social_posts accepts the tg platform and keeps the live-row unique index", async () => {
    const x = await env.DB.prepare("INSERT INTO x_posts(stream,ref,text,ai,cost_usd,status) VALUES ('pick','TG-1','t',0,0,'posted') RETURNING id").first<{ id: number }>();
    await env.DB.prepare("INSERT INTO social_posts(x_post_id,platform,status) VALUES (?,'tg','posted')").bind(x!.id).run();
    await expect(env.DB.prepare("INSERT INTO social_posts(x_post_id,platform,status) VALUES (?,'tg','pending')").bind(x!.id).run()).rejects.toThrow();
  });
});
