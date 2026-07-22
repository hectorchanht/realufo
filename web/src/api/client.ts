// Tiny same-origin JSON fetch wrapper. Every request carries the anon id so
// the Worker can rate-limit / dedupe votes per-browser (see ../lib/anon.ts).
// No response validation beyond `res.ok` — callers type the result via <T>
// and types.ts documents the shapes the Worker actually returns.
import { getAnonId } from "../lib/anon";

const base = (path: string) => path; // same-origin; Vite dev proxy forwards /api in dev

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(base(path), {
    method,
    headers: {
      "content-type": "application/json",
      "X-Anon-Id": getAnonId(),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => req<T>("GET", path),
  post: <T>(path: string, body?: unknown) => req<T>("POST", path, body),
};
