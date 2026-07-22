import { applyD1Migrations, env } from "cloudflare:test";
import { beforeAll, describe, it, expect } from "vitest";

const EXPECTED = ["archives","assets","boards","cases","comments","posts","rate_events","records","sightings","stats","threads","ticker","users","votes"];

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

describe("schema", () => {
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
});
