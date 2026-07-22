import type { Env as WorkerEnv } from "../env";
import type { D1Migration } from "@cloudflare/vitest-pool-workers";

// `cloudflare:test`'s `env` (and the ambient `Env` used by wrangler-generated
// types) is typed as `Cloudflare.Env`, which ships as an empty interface meant
// for project-specific declaration merging (see @cloudflare/workers-types).
// Merge in our real bindings, plus the `TEST_MIGRATIONS` binding this test
// harness injects via worker/vitest.config.ts (readD1Migrations), so
// `env.DB` / `env.TEST_MIGRATIONS` type-check for this and future test files
// (Tasks 5-11 reuse this same applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
// setup).
//
// `TEST_SEED_SQL` is the Task 5 companion: worker/vitest.config.ts also
// precomputes the seed (data.js -> INSERT statements) in Node and injects it
// the same way, since the fs reads buildSeedSQL()/loadData() need don't work
// once code runs inside workerd (see vitest.config.ts's comment). worker/
// tests/helpers.ts's seedTestDB() batches this array directly.
declare global {
  namespace Cloudflare {
    interface Env extends WorkerEnv {
      TEST_MIGRATIONS: D1Migration[];
      TEST_SEED_SQL: string[];
    }
  }
}

export {};
