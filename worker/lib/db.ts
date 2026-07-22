export function relAgo(iso?: string | null): string {
  if (!iso) return "now";
  const then = Date.parse(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  const s = Math.max(0, Math.floor((Date.now() - then)/1000));
  if (s < 60) return s <= 3 ? "now" : s + "s";
  const m = Math.floor(s/60); if (m < 60) return m + "m";
  const h = Math.floor(m/60); if (h < 24) return h + "h";
  return Math.floor(h/24) + "d";
}
export const stanceOK = (x: unknown) => ["neutral","believer","skeptic","analyst"].includes(String(x)) ? String(x) : "neutral";
