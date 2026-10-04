# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

realufo.org — searchable archive of declassified US UAP/UFO records (PDFs, videos, images, full text, page citations) plus anonymous boards, Ask (RAG over the files), Shorts and social fan-out.
Personal project: GitHub `hectorchanht/realufo`, Cloudflare `F147259@gmail.com's Account` (`f1868a071996e836eae6da2b65f37929`). Never Flow identities here (see `~/.claude/CLAUDE.md`).

## Toolchain

Node 22 only. Default `node` is v25 → prepend to every shell command:

```bash
export PATH="/Users/laichan/.nvm/versions/node/v22.22.0/bin:$PATH"
```

(System Node gives ~10 bogus web-test failures from Node's own `localStorage` global.)
Python ingest/OCR: see `crawler/ingest/README.md`; PaddleOCR needs Python ≤3.12 venv (`ocr-full-text` skill).

## Commands

```bash
pnpm install && pnpm -C web install
pnpm db:migrate:local && pnpm db:seed:local      # local D1
pnpm dev                                         # build web + wrangler dev --local (:8787)
pnpm dev:web                                     # Vite only (:5173); preview configs in .claude/launch.json
pnpm test:worker                                 # vitest in workerd (isolated D1, migrations + seed applied per test)
npx vitest run --config worker/vitest.config.ts worker/tests/ask.spec.ts   # one worker spec (`pnpm test:worker -- x` runs ALL)
pnpm test:web                                    # vitest + jsdom
cd web && npx vitest run src/tests/ask.test.tsx  # one web test
cd web && npx tsc -b --noEmit                    # typecheck web INCLUDING tests (deploy build runs tsc -b; erasableSyntaxOnly)
npx tsc --noEmit                                 # typecheck worker
cd web && npx oxlint                             # lint
cd crawler && python -m pytest ingest/tests/ -q  # ingest tests (CI runs these first)
python3 -m pytest scripts/                       # script tests
```

Gate on the test command's own exit code — `vitest … | grep … && deploy` deploys on failures.

## Architecture

**Worker** (`worker/index.ts`, one Cloudflare Worker serves everything). `fetch` order: www→apex 301, legacy/renamed/removed-record redirects, `/api/*` via `router.ts` (`on(method, path, handler)` table registered in `index.ts`, URLPattern, groups percent-decoded, HEAD=GET), `/__tick` (admin-token manual cron, used by `scripts/publish.sh`), sitemap/rss/llms, `/doc/:id/text`, else `serveWithMeta` → SPA `index.html` with per-route meta/OG/JSON-LD **and** a plain-HTML pre-render (`lib/ssr.ts`) inside `#root` for crawlers. SSR must say what the SPA says on that URL; it imports shared helpers straight from `web/src/lib/*`.
`scheduled` (every 3h) → `runTick`: X bot → social fan-out (`lib/social/`) → X polls → push notifications; each gated by `FEATURE_*` vars in `wrangler.jsonc`, each failure isolated.
`lib/cache.ts` memoizes page JSON in the Cache API under `https://realufo.org/__page/<kind>/<id>` (1h).

**Data**: site renders ONLY from D1 (`records` + `assets`; `assets.role` = `full`/`thumb`, `cdn_url` on `https://assets.realufo.org` = R2 bucket `realufo`). A file in R2 without a D1 row does not show. Schema = `db/migrations/*.sql` (applied in order; tests apply them too). `db/seed.ts` `buildSeedSQL` = canonical record→rows transform. Full text: R2 `text/<id>.json` + `record_text` + FTS5 `record_fts`. Ask: Workers AI + Vectorize `realufo-chunks`.
D1 gotcha: LIKE/GLOB patterns >50 bytes fail ("pattern too complex") → use `instr()`.

**Web** (`web/`): React + Vite + Tailwind SPA; `src/router.tsx`, `src/screens/`, `src/api/` (react-query; send `X-Anon-Id`). Design style 茶盤 ちゃばん — read `docs/design/chaban-design-style.md` before any visitor-facing UI (lucide icons, minimal text, aria-label/title).

**Crawler** (`crawler/ingest/`, `python -m ingest.<step>`): daily GitHub Action `ingest.yml` (schedule/dispatch only, runs branch code) in order: ingest → thumbs → clips → moments → ocr → fulltext → summaries → visuals → textindex → highlights → tldr → cards → links → indexnow. Every step idempotent, `--dry-run`/`--limit`. Bare `wrangler` in Python steps needs `PATH=<repo>/node_modules/.bin:$PATH` and `set -a; . ./.env; set +a`.

**Other dirs**: `scripts/` (publish.sh, article.py, polls.py, export_dataset.py → HF dataset), `showcase/` (hand-made Shorts recipes), `docs/superpowers/specs|plans` (spec → plan → implement; dated filenames), `realufo-handoff/` (original prototype + `data.js` seed used by tests).

**Skills** (`.claude/skills/`): `ocr-full-text`, `publish`, `publish-article`, `making-shorts`, `story-polls`, `key-moments` — use them for those tasks.

## How we work here

- **Shared checkout.** Several Claude chats work in this tree on `build/app-foundation` at once. Run `git status` + `git diff --cached --name-only` before staging; stage only files you touched (never `git add -A`); foreign staged files or "MM" in a shared file → work in a detached worktree. Never commit other chats' uncommitted files.
- **Commit when done** (tests pass), no asking. Don't push unasked. Commit messages containing the deploy phrase trip the hook → `git commit -F file`.
- **Deploy** (only when asked) from a clean worktree of HEAD, never the working tree:
  `git worktree add --detach <scratch> HEAD` → copy `.dev.vars` → Node 22 PATH → `pnpm install` (root + web) → tests + `cd web && npx tsc -b --noEmit` → `pnpm run deploy` (applies remote D1 migrations, then build + deploy) → remove worktree.
  Bare `wrangler deploy` is blocked by `.claude/hooks/block-bare-deploy.sh` (it shipped code before its migration → 500s).
  Before deploying: `git fetch` + `git branch -r --contains <sha>` and `npx wrangler deployments list --env-file /dev/null` — other chats often already shipped your commit (grep the live `/assets/index-*.js` to confirm).
  After a successful deploy: push that exact commit (deploy = deploy + push). If origin moved, stop and tell the user.
- **"Push"** = whole branch incl. other chats' unpushed commits; name them, and flag any touching `crawler/` (next scheduled ingest runs it).
- **Wrangler auth**: repo `.env` `CLOUDFLARE_API_TOKEN` (narrow; auto-loaded) overrides OAuth. For deploy/account-level commands in the main checkout use `--env-file /dev/null` (OAuth must be f147259@gmail.com; re-login: `npx wrangler login --env-file /dev/null`). Cloudflare MCP tools see only Flow accounts — don't use them here; zone settings = user via dashboard.
- **After any live data change**: purge `assets.realufo.org` / page URLs and the `__page/doc/<id>` memo key via `CF_PURGE_TOKEN` (zone `da2ac798d7be9b1e27fdcfa38877c1e8`, batches of 30); then `cd crawler && python3 indexnow.py --since-hours N` (or explicit URLs from live `/sitemap.xml`). Verify caching with GET, never `curl -I`.
- **Local data**: local D1 is a prod copy; never `wrangler d1 export --remote`. If local pages 500, check `wrangler d1 migrations list realufo-db --local` first. Local R2 has ~12 sample files; `FILE_CDN_FALLBACK` in `.dev.vars` 302s misses to prod CDN.
- **Publishing is irreversible.** Site threads/articles, social posts, polls, IndexNow for new content need current data (OCR + rebuilt text/search), quotes checked against the scan with `(p.N)` page cites, and an explicit OK for that exact version — "continue"/"go" is not one. Drafts stay local.
- **Final reply** = explainers → files touched (links, edited/created/deleted, incl. D1/R2/memory) → one-liner → "Your action" (exact commands/URLs, or "none").
