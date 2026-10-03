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

export const api = {
  get: <T>(path: string) => req<T>("GET", path),
  post: <T>(path: string, body?: unknown) => req<T>("POST", path, body),
};
