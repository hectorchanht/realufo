// Move this browser's anonymous identity to another device: a JSON file holding
// the anon id (see ./anon.ts) plus the per-browser prefs that go with it. The
// raw id is a bearer secret (the Worker only ever sees its salted hash), so the
// UI warns before download. Import REPLACES this device's state (user choice).
import { api, ApiError } from "../api/client";

const KEYS = ["ufo_anon", "ufo_voted", "ufo_theme", "realufo.askHistory", "ru:moments-src", "ru:adjust-open"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// The id this device had before an import, until carryOverFollows hands it to the Worker.
const PREV = "ufo_anon_prev";

export function exportIdentity(): string {
  const data: Record<string, string> = {};
  for (const k of KEYS) {
    const v = localStorage.getItem(k);
    if (v !== null) data[k] = v;
  }
  return JSON.stringify({ app: "realufo", v: 1, exported_at: new Date().toISOString(), data }, null, 2);
}

// Returns false (and changes nothing) unless `text` is a valid export.
export function importIdentity(text: string): boolean {
  let f: any;
  try {
    f = JSON.parse(text);
  } catch {
    return false;
  }
  const d = f?.data;
  if (f?.app !== "realufo" || f.v !== 1 || !d || typeof d !== "object" || !UUID.test(d.ufo_anon ?? "")) return false;
  const old = localStorage.getItem("ufo_anon");
  if (old && old !== d.ufo_anon) localStorage.setItem(PREV, old);
  for (const k of KEYS) {
    if (typeof d[k] === "string") localStorage.setItem(k, d[k]);
    else localStorage.removeItem(k);
  }
  return true;
}

export function downloadIdentity(): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([exportIdentity()], { type: "application/json" }));
  a.download = "realufo-id.json";
  a.click();
  URL.revokeObjectURL(a.href);
}

// On app start after an import: the Worker copies what the previous id followed to
// the new one (POST /api/follows/merge), then the push subscription is re-posted
// under the new id (resyncPush) — so notifications keep coming without re-enabling.
// Offline or rate-limited → keep the old id and retry next start; a rejection → drop it.
export async function carryOverFollows(): Promise<void> {
  const prev = localStorage.getItem(PREV);
  if (!prev) return;
  try {
    await api.post("/api/follows/merge", { from: prev });
  } catch (e) {
    if (!(e instanceof ApiError) || e.status === 429 || e.status >= 500) return;
  }
  localStorage.removeItem(PREV);
  localStorage.removeItem("pushSync"); // lib/push.ts resyncPush: re-post today, not tomorrow
}
