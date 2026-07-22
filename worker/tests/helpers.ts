import { applyD1Migrations, env } from "cloudflare:test";

// Shared by every worker-route test that needs a populated D1: applies the
// project's migrations to the isolated per-test-file D1 (mirrors
// schema.spec.ts's own beforeAll), then batches in the seed data.
//
// The seed itself is NOT built here. buildSeedSQL()/loadData() (db/seed.ts)
// call node:fs's readFileSync, which only resolves against the real repo
// filesystem in an actual Node.js process. Inside the workerd runtime this
// test body executes in, nodejs_compat's `fs` shim resolves relative paths
// against workerd's own virtual `/bundle/` root and 404s on anything not
// part of the bundle — confirmed by running this exact call here first:
// `Error: no such file or directory, readAll '/bundle/realufo-handoff/data.js'`.
// So worker/vitest.config.ts precomputes the seed as a plain SQL-statement
// array in Node (same trick already used there for TEST_MIGRATIONS) and
// injects it as the `TEST_SEED_SQL` binding; this just batches it.
export async function seedTestDB(DB: D1Database) {
  await applyD1Migrations(DB, env.TEST_MIGRATIONS);
  await DB.batch(env.TEST_SEED_SQL.map((s) => DB.prepare(s)));
}
