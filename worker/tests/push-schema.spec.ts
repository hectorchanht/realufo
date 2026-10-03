import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import { seedTestDB } from "./helpers";

beforeAll(() => seedTestDB(env.DB));

describe("push schema", () => {
  it("push_subs defaults: replies on, new files off, daily on", async () => {
    await env.DB.prepare("INSERT INTO push_subs(endpoint,actor_id,p256dh,auth) VALUES('https://p/1','a','k','s')").run();
    const r = await env.DB.prepare("SELECT replies,new_files,daily,fail_count FROM push_subs WHERE endpoint='https://p/1'").first();
    expect(r).toEqual({ replies: 1, new_files: 0, daily: 1, fail_count: 0 });
  });
  it("follows: one row per actor+target, kind and src checked", async () => {
    await env.DB.prepare("INSERT INTO follows(actor_id,kind,key,src) VALUES('a','thread','t1','auto')").run();
    await expect(env.DB.prepare("INSERT INTO follows(actor_id,kind,key,src) VALUES('a','thread','t1','bell')").run()).rejects.toThrow();
    await expect(env.DB.prepare("INSERT INTO follows(actor_id,kind,key,src) VALUES('a','user','x','bell')").run()).rejects.toThrow();
    await expect(env.DB.prepare("INSERT INTO follows(actor_id,kind,key,src) VALUES('a','record','x','manual')").run()).rejects.toThrow();
  });
  it("push_state is a plain key/value table", async () => {
    await env.DB.prepare("INSERT INTO push_state(k,v) VALUES('new_files','2026-10-03 00:00:00')").run();
    expect((await env.DB.prepare("SELECT v FROM push_state WHERE k='new_files'").first<{ v: string }>())?.v).toBe("2026-10-03 00:00:00");
  });
});
