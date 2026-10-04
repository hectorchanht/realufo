// Tiny same-origin JSON fetch wrapper. Every request carries the anon id so
// the Worker can rate-limit / dedupe votes per-browser (see ../lib/anon.ts).
// No response validation beyond `res.ok` — callers type the result via <T>
// and types.ts documents the shapes the Worker actually returns.
import { getAnonId } from "../lib/anon";
import { setStale } from "../lib/offline";
import { canQueue, enqueue } from "../lib/outbox";

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

// The write was saved to the offline outbox (lib/outbox.ts) and will be sent later.
export class QueuedError extends ApiError {
  constructor() {
    super(0, "Saved offline — will post when back online");
    this.name = "QueuedError";
  }
}

function send(method: string, path: string, body?: unknown): Promise<Response> {
  // FormData (image uploads) goes as-is so the browser sets the multipart boundary.
  const isForm = body instanceof FormData;
  return fetch(base(path), {
    method,
    headers: {
      ...(isForm ? {} : { "content-type": "application/json" }),
      "X-Anon-Id": getAnonId(),
    },
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });
}

// Outbox replay (lib/outbox.ts startOutbox): raw response, no queueing.
export const sendRaw = (path: string, body: unknown) => send("POST", path, body);

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await send(method, path, body);
  } catch (err) {
    // fetch only rejects on network failure: offline writes wait in the outbox.
    if (method === "POST" && canQueue(path)) {
      if (body instanceof FormData) throw new ApiError(0, "Image posts need a connection");
      enqueue(path, body);
      throw new QueuedError();
    }
    throw err;
  }
  if (method === "GET") setStale(res.headers.get("X-SW-Cache") === "1");
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

// index.html starts each landing route's first GETs before this bundle loads
// (spec docs/superpowers/specs/2026-10-04-realufo-early-fetch-design.md). The first
// GET of a path adopts that result once; a failed one (null) or one 10 s+ old means
// a normal request, so this is never worse than no early fetch.
type Early = { at: number; p: Promise<{ d: unknown; stale: boolean } | null> };
const EARLY_MAX_AGE_MS = 10_000;

async function early<T>(path: string): Promise<T | undefined> {
  const all = (window as { __early?: Record<string, Early> }).__early;
  const e = all?.[path];
  if (!all || !e) return undefined;
  delete all[path];
  if (performance.now() - e.at >= EARLY_MAX_AGE_MS) return undefined;
  const r = await e.p;
  if (!r) return undefined;
  setStale(r.stale);
  return r.d as T;
}

export const api = {
  get: async <T>(path: string): Promise<T> => {
    const hit = await early<T>(path);
    return hit !== undefined ? hit : req<T>("GET", path);
  },
  post: <T>(path: string, body?: unknown) => req<T>("POST", path, body),
};
