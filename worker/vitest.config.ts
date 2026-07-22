import { defineConfig } from "vitest/config";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";

export default defineConfig({
  plugins: [
    cloudflareTest(async () => {
      // Read db/migrations so tests can apply them to the isolated test D1 via
      // applyD1Migrations(env.DB, env.TEST_MIGRATIONS) — this instance is separate
      // from the one `wrangler d1 migrations apply --local` writes to.
      const migrations = await readD1Migrations("./db/migrations");
      return {
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          compatibilityFlags: ["nodejs_compat"],
          bindings: { TEST_MIGRATIONS: migrations },
        },
      };
    }),
  ],
  test: {
    include: ["worker/tests/**/*.spec.ts"],
  },
});
