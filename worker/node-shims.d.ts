// Minimal ambient shims for the couple of bare Node APIs db/seed.ts uses
// (node:fs's readFileSync/writeFileSync, node:child_process's execSync,
// process.argv). `db/` itself sits outside this tsconfig's `include`
// (["worker"]) and was never meant to type-check under it — Task 4's report
// noted an ad-hoc `tsc` run against db/seed.ts alone fails the same way with
// no @types/node installed anywhere in this repo, and left it as-is since
// nothing reachable from `worker/**` imported it.
//
// Task 5's worker/vitest.config.ts now imports { buildSeedSQL, loadData }
// from "../db/seed" (to precompute the test seed in Node, see that file's
// comment), which pulls db/seed.ts into this program's transitive file set —
// so `npx tsc --noEmit -p tsconfig.json` (which prior tasks established as
// clean, see docs) would otherwise break on its node:fs/node:child_process/
// process usage. Installing @types/node instead would add a global DOM/Node
// lib surface across all of worker/** that risks colliding with
// @cloudflare/workers-types' own ambient Request/Response/crypto/etc
// declarations — so shim just the handful of names db/seed.ts actually calls.
declare module "node:fs" {
  export function readFileSync(path: string, encoding: string): string;
  export function writeFileSync(path: string, data: string): void;
}
declare module "node:child_process" {
  export function execSync(command: string, options?: { stdio?: string }): unknown;
}
declare const process: { argv: string[] };
