// scripts/dev.mjs — one-command local dev with live reload.
// Runs Vite (web HMR) and wrangler dev (worker/API) side by side.
// Usage: pnpm dev   →   root script does `pnpm build:web && node scripts/dev.mjs`
// Open http://localhost:5173 — Vite serves the frontend with hot reload and
// proxies /api/* to the worker at http://localhost:8787.
// wrangler dev watches worker/ and reloads the worker automatically.
import { spawn } from "node:child_process";

const children = new Set();

function run(name, args, color) {
  const p = spawn("pnpm", args, { stdio: ["ignore", "pipe", "pipe"] });
  children.add(p);
  const tag = `${color}[${name}]\x1b[0m`;
  const pipe = (stream) =>
    stream.on("data", (d) => {
      for (const line of String(d).split("\n")) {
        if (line.trim()) console.log(`${tag} ${line}`);
      }
    });
  pipe(p.stdout);
  pipe(p.stderr);
  p.on("exit", (code) => {
    children.delete(p);
    console.log(`${tag} exited (code ${code}) — shutting down`);
    shutdown();
  });
}

function shutdown() {
  for (const p of children) p.kill("SIGINT");
  setTimeout(() => process.exit(0), 800).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

run("web", ["-C", "web", "dev"], "\x1b[32m");
run("worker", ["exec", "wrangler", "dev", "--local"], "\x1b[36m");

console.log("\n  → Open http://localhost:5173  (Vite HMR; /api/* proxied to :8787)\n");
