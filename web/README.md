# RealUFO web app

The React + Vite + Tailwind single-page app behind [realufo.org](https://realufo.org) —
the searchable archive of declassified UAP/UFO government records.

## Develop

```bash
pnpm install          # from repo root (also installs web deps)
pnpm dev              # from repo root: builds web once, then runs Vite HMR (:5173) + wrangler dev (:8787) side by side
```

Open **http://localhost:5173** — Vite serves the frontend with hot reload and proxies
`/api/*` to the worker at `:8787`. Editing `web/src` refreshes instantly; editing
`worker/` reloads the worker automatically. One Ctrl+C stops both.

Single commands (from repo root):

```bash
pnpm -C web dev       # Vite HMR only
pnpm build:web        # production build to web/dist (tsc + vite build)
pnpm -C web test       # vitest
cd web && npx tsc -b --noEmit   # typecheck
```

## Structure

- `src/screens/` — route screens, lazy-loaded via `src/router.tsx` (Feed and Doc ship in the
  main bundle; everything else is its own chunk)
- `src/components/` — shared UI (`AppShell`, `SiteFooter`, `DocCard`, …)
- `src/api/` — API client, React Query hooks (`queries.ts`), shared types (`types.ts`)
- `src/lib/`, `src/theme/` — helpers and design tokens

The web app imports shared code from `worker/lib/` (profiles, affiliate, meta) — the
single source of truth is in the worker tree, bundled at build time.

## Style

Dark theme by default (`#07080c` base, signal green `#4df0a6`), pixel/CRT accents.
Keep type large and readable — the site is presented on TVs as well as phones.
No emojis in UI; use SVG icons.

## License

[AGPLv3](../../LICENSE) — see the repo root.
