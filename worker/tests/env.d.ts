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
declare global {
  namespace Cloudflare {
    interface Env extends WorkerEnv {
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}

export {};
