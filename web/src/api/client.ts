// Tiny same-origin JSON fetch wrapper. Every request carries the anon id so
// the Worker can rate-limit / dedupe votes per-browser (see ../lib/anon.ts).
// No response validation beyond `res.ok` — callers type the result via <T>
// and types.ts documents the shapes the Worker actually returns.
import { getAnonId } from "../lib/anon";

const base = (path: string) => path; // same-origin; Vite dev proxy forwards /api in dev

// Carries the HTTP status alongside the message so callers (mutation error handlers,
// toast wiring) can branch on it — e.g. `err.status === 429` for the rate-limit toast
// (FRONTEND-CONTEXT.md: "write endpoints may return 429 ... surface as a toast").
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

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
    let message = `${method} ${path} → ${res.status}`;
    try {
      const data = (await res.json()) as { error?: unknown };
      if (typeof data?.error === "string" && data.error) message = data.error;
    } catch {
      // non-JSON or empty error body: keep the `${method} ${path} → ${status}` fallback
    }
    throw new ApiError(res.status, message);
  }
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => req<T>("GET", path),
  post: <T>(path: string, body?: unknown) => req<T>("POST", path, body),
};
