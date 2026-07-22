import { defineConfig } from "vitest/config";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { buildSeedSQL, loadData } from "../db/seed";

export default defineConfig({
  plugins: [
    cloudflareTest(async () => {
      // Read db/migrations so tests can apply them to the isolated test D1 via
      // applyD1Migrations(env.DB, env.TEST_MIGRATIONS) — this instance is separate
      // from the one `wrangler d1 migrations apply --local` writes to.
      const migrations = await readD1Migrations("./db/migrations");

      // Same trick for the seed data: buildSeedSQL()/loadData() call node:fs
      // (readFileSync), which only works here — this config function runs in
      // the real Node.js process during test setup. Inside the workerd
      // runtime itself (where the actual *.spec.ts test bodies execute),
      // nodejs_compat's `fs` shim has no access to the repo's real
      // filesystem — it resolves relative paths against workerd's own
      // virtual `/bundle/` root and 404s on anything not part of the bundle
      // (confirmed: `loadData` there throws "no such file or directory,
      // readAll '/bundle/realufo-handoff/data.js'"). So precompute the seed
      // as a plain string array here, exactly like TEST_MIGRATIONS, and hand
      // it to the worker as a JSON-serializable binding — worker/tests/
      // helpers.ts's seedTestDB() then just batches env.TEST_SEED_SQL with no
      // fs access of its own.
      const seedSQL = buildSeedSQL(loadData("realufo-handoff/data.js"));
      const seedStatements = seedSQL
        .split(";\n")
        .map((s) => s.trim())
        .filter((s) => s && !/^(PRAGMA|BEGIN|COMMIT)/i.test(s));

      return {
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          compatibilityFlags: ["nodejs_compat"],
          bindings: { TEST_MIGRATIONS: migrations, TEST_SEED_SQL: seedStatements },
        },
      };
    }),
  ],
  test: {
    include: ["worker/tests/**/*.spec.ts"],
  },
});
