# Build Environment (read before any shell command)

This machine's default `node` is v25 and default `pnpm` is corepack-shimmed. This
project targets **node 22**. A complete node-22 toolchain (node, npm, npx, pnpm,
wrangler, corepack) lives at `/Users/laichan/.nvm/versions/node/v22.22.0/bin`.

**Every shell command in this repo MUST start by prepending that bin to PATH:**

```bash
export PATH="/Users/laichan/.nvm/versions/node/v22.22.0/bin:$PATH"
```

After that preamble: `node -v` → v22.22.0, `pnpm -v` → 8.15.5, `wrangler --version` works.

## Toolchain facts (overrides where they differ from plan text)

- **node:** v22.22.0 (satisfies `engines.node: ">=22 <23"`).
- **pnpm:** use the installed **8.15.5**. In `package.json` set `"packageManager": "pnpm@8.15.5"`
  (NOT `pnpm@9.15.9` from the plan text — 9 is not installed and corepack auto-fetch adds friction).
  pnpm 8 runs this stack (Vite, Tailwind 3, wrangler, vitest) fine.
- **wrangler:** available at the node-22 bin (invoke as `wrangler ...` or `npx wrangler ...`).
- **gh:** active account is `frankchanflow` (Flow-only) — here use `GH_TOKEN=$(gh auth token --user hectorchanht) gh ...`.
- Network access to the npm registry is available (installs work).

## Cloudflare

- Deploy target account: `F147259@gmail.com's Account` `f1868a071996e836eae6da2b65f37929` (never the Flow Account).
- R2 bucket `realufo` already exists on that account (live at `assets.realufo.org`).
- D1 `realufo-db` is created during Task 25 (provisioning), not before.
- Do NOT run any remote `wrangler` command (deploy, d1 --remote, d1 create) except in Task 25.
  Everything before Task 25 uses `--local` only.
