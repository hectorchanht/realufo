// Offline outbox (spec Phase 1c). A write that fails with a network error is kept in
// localStorage and re-sent, oldest first, when the browser comes back online, the
// app starts, or the tab becomes visible. Page-side on purpose: Background Sync is
// Chrome-only and never fires on iOS.
const KEY = "outbox";
const MAX_ITEMS = 50;
const MAX_AGE_MS = 7 * 24 * 3600 * 1000;

const QUEUEABLE = [
  /^\/api\/records\/[^/]+\/comments$/,
  /^\/api\/cases\/[^/]+\/comments$/,
  /^\/api\/threads$/,
  /^\/api\/threads\/[^/]+\/posts$/,
  /^\/api\/votes$/,
  /^\/api\/records\/[^/]+\/verdict$/,
  /^\/api\/articles\/[^/]+\/poll$/,
  /^\/api\/shorts\/[^/]+\/like$/,
];

interface Item {
  id: string;
  path: string;
  body: unknown;
  at: number;
}
export type OutboxEvent = { queued: true } | { sent: number; failed: string[] };
type Send = (path: string, body: unknown) => Promise<Response>;

export const canQueue = (path: string) => QUEUEABLE.some((re) => re.test(path));

function read(): Item[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

function write(items: Item[]) {
  try {
    if (items.length) localStorage.setItem(KEY, JSON.stringify(items));
    else localStorage.removeItem(KEY);
  } catch {
    // storage blocked/full: the write is lost, same as a failed post
  }
}

const emit = (detail: OutboxEvent) => window.dispatchEvent(new CustomEvent("outbox", { detail }));

export function enqueue(path: string, body: unknown) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  write([...read(), { id, path, body, at: Date.now() }].slice(-MAX_ITEMS));
  emit({ queued: true });
}

async function errorText(res: Response) {
  try {
    const j = (await res.json()) as { error?: unknown };
    if (typeof j?.error === "string" && j.error) return j.error;
  } catch {
    // non-JSON body
  }
  return `error ${res.status}`;
}

async function drain(send: Send) {
  let sent = 0;
  const failed: string[] = [];
  write(read().filter((i) => Date.now() - i.at < MAX_AGE_MS));
  for (let item = read()[0]; item; item = read()[0]) {
    let res: Response;
    try {
      res = await send(item.path, item.body);
    } catch {
      break; // still offline: keep it for the next trigger
    }
    // rate limited or server trouble (deploy, CDN blip) is not a rejected post: keep it for the next trigger
    if (res.status === 429 || res.status >= 500) break;
    if (res.ok) sent++;
    else failed.push(await errorText(res));
    const done = item.id;
    write(read().filter((i) => i.id !== done));
  }
  if (sent || failed.length) emit({ sent, failed });
}

// One flush at a time per tab (shared promise) and across tabs (Web Locks, where available).
// ponytail: a request that reached the server but lost its response is re-sent later
// (duplicate post); add an idempotency-key header if that shows up in practice.
let running: Promise<void> | null = null;
export function flush(send: Send): Promise<void> {
  running ??= (navigator.locks ? navigator.locks.request("realufo-outbox", () => drain(send)) : drain(send)).finally(() => {
    running = null;
  });
  return running;
}

export function startOutbox(send: Send, onSent: () => void) {
  const run = () => void flush(send);
  window.addEventListener("online", run);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") run();
  });
  window.addEventListener("outbox", (e) => {
    const d = (e as CustomEvent<OutboxEvent>).detail;
    if ("sent" in d && d.sent) onSent();
  });
  run();
}

export function outboxMessage(d: OutboxEvent): string {
  if ("queued" in d) return "Saved offline — will post when back online";
  const parts: string[] = [];
  if (d.sent) parts.push(`${d.sent} offline post${d.sent === 1 ? "" : "s"} sent`);
  if (d.failed.length) parts.push(`${d.failed.length} couldn't post: ${d.failed[0]}`);
  return parts.join(" · ");
}
