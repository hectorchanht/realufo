// Public API v1 webhooks: subscribe / inspect / delete. Management is
// secret-gated (the secret is shown once at creation, never again).
import type { Env } from "../env";
import { v1json, v1error, v1guarded } from "./v1";
import { WEBHOOK_EVENTS, createWebhook, getWebhookStatus, deleteWebhook } from "../lib/webhooks";

// POST /api/v1/webhooks { url, events? } → 201 { id, url, events, secret }
export const createWebhookRoute = v1guarded("POST /api/v1/webhooks", async (req, env) => {
  let body: { url?: string; events?: string[] };
  try {
    body = (await req.json()) as { url?: string; events?: string[] };
  } catch {
    return v1error(400, "invalid JSON body");
  }
  if (!body.url) return v1error(400, "url is required");
  try {
    const s = await createWebhook(env, body.url, body.events);
    return v1json(
      { id: s.id, url: s.url, events: s.events, secret: s.secret },
      { note: "Store this secret — it is shown once and is required to view or delete this subscription." },
      "no-store",
      { status: 201 }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed";
    if (/no such table/i.test(msg)) return v1error(503, "webhooks not yet enabled — try again after the next deploy");
    return v1error(400, msg);
  }
});

const secretOf = (req: Request) => req.headers.get("x-webhook-secret") ?? "";

// GET /api/v1/webhooks/:id (X-Webhook-Secret) → status without the secret
export const getWebhookRoute = v1guarded("GET /api/v1/webhooks/:id", async (_req, env, p) => {
  const s = await getWebhookStatus(env, p.id, secretOf(_req));
  if (!s) return v1error(404, "webhook not found or wrong secret");
  return v1json(s, { events_available: WEBHOOK_EVENTS }, "no-store");
});

// DELETE /api/v1/webhooks/:id (X-Webhook-Secret)
export const deleteWebhookRoute = v1guarded("DELETE /api/v1/webhooks/:id", async (req, env, p) => {
  const ok = await deleteWebhook(env, p.id, secretOf(req));
  if (!ok) return v1error(404, "webhook not found or wrong secret");
  return v1json({ deleted: true, id: p.id }, {}, "no-store");
});
