// Anonymous visitor id: a client-generated UUID persisted in localStorage so the
// Worker can dedupe votes / rate-limit writes per-browser without an account.
// Sent as the `X-Anon-Id` header on every API request (see ../api/client.ts).
const KEY = "ufo_anon";

export function getAnonId(): string {
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}
