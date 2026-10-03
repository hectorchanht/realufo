// Move this browser's anonymous identity to another device: a JSON file holding
// the anon id (see ./anon.ts) plus the per-browser prefs that go with it. The
// raw id is a bearer secret (the Worker only ever sees its salted hash), so the
// UI warns before download. Import REPLACES this device's state (user choice).
const KEYS = ["ufo_anon", "ufo_voted", "ufo_theme", "realufo.askHistory", "ru:moments-src", "ru:adjust-open"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
