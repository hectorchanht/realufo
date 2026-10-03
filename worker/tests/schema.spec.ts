import { applyD1Migrations, env } from "cloudflare:test";
import { beforeAll, describe, it, expect } from "vitest";

const EXPECTED = ["archives","article_records","articles","ask_cache","ask_log","assets","boards","cases","comments","hub_highlights","posts","presence","rate_events","record_fts","record_fts_config","record_fts_content","record_fts_data","record_fts_docsize","record_fts_idx","record_links","record_ocr","record_text","record_tldr","record_verdicts","records","sightings","social_auth","social_posts","stats","text_index","threads","ticker","users","votes","x_posts"];

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

describe("schema", () => {
  it("x_posts dedupes on (stream, ref) and checks status", async () => {
    const ins = (ref: string, status = "draft") =>
      env.DB.prepare("INSERT INTO x_posts(stream,ref,text,ai,cost_usd,status) VALUES ('pick',?,'t',0,0.015,?)").bind(ref, status).run();
    await ins("S-1");
    await expect(ins("S-1")).rejects.toThrow(/UNIQUE/);
    await expect(ins("S-2", "bogus")).rejects.toThrow(/CHECK/);
  });

  it("social_posts dedupes on (x_post_id, platform) and checks platform/status", async () => {
    const x = await env.DB.prepare("INSERT INTO x_posts(stream,ref,text,ai,cost_usd,status) VALUES ('pick','SP-1','t',0,0.015,'posted') RETURNING id").first<{ id: number }>();
    const ins = (platform: string, status = "draft") =>
      env.DB.prepare("INSERT INTO social_posts(x_post_id,platform,status) VALUES (?,?,?)").bind(x!.id, platform, status).run();
    await ins("bsky");
    await expect(ins("bsky")).rejects.toThrow(/UNIQUE/);
    await expect(ins("myspace")).rejects.toThrow(/CHECK/);
    await expect(ins("fb", "bogus")).rejects.toThrow(/CHECK/);
  });

  it("has all tables", async () => {
    // `_cf_%` covers D1's own internal bookkeeping (e.g. KV metadata); `d1_migrations`
    // is applyD1Migrations()'s own tracking table (a real table it creates, not a
    // `_cf_%`-prefixed one — attempting to rename it to a `_cf_`-prefixed name via the
    // migrationsTableName param is rejected by D1 with SQLITE_AUTH, that prefix is
    // reserved), so it's excluded explicitly alongside the brief's original filters.
    const { results } = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name != 'd1_migrations' ORDER BY name"
    ).all<{ name: string }>();
    expect(results.map(r => r.name)).toEqual(EXPECTED);
  });

  it("daily ask-cap query uses an (action, created_at) index", async () => {
    const plan = await env.DB.prepare(
      "EXPLAIN QUERY PLAN SELECT count(*) c FROM rate_events WHERE action='ask' AND actor_id NOT LIKE 'ip:%' AND created_at >= date('now')"
    ).all<{ detail: string }>();
    expect(plan.results.map((r) => r.detail).join(" ")).toContain("idx_rate_action_time");
  });
});
