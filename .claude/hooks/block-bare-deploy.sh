#!/bin/sh
# Bare `wrangler deploy` ships code before its D1 migrations (500s, 2026-10-02).
# `pnpm run deploy` applies migrations first. Only matches wrangler at command
# position, so `grep "wrangler deploy"` and `wrangler deployments` pass.
cmd=$(jq -r '.tool_input.command // empty')
if printf '%s\n' "$cmd" | grep -Eq '(^|[[:space:];&|(/])wrangler[[:space:]]+deploy([[:space:];&|)]|$)'; then
  echo "Blocked: bare 'wrangler deploy' skips D1 migrations (500s on 2026-10-02). Use: pnpm run deploy (from a clean worktree)" >&2
  exit 2
fi
exit 0
