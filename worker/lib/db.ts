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
// Card thumbnail subquery: the `thumb` asset, else the `full` asset when it is
// itself an image (most image records ship no separate thumb).
export const thumbSql = (recordId: string) =>
  `(SELECT cdn_url FROM assets a WHERE a.record_id=${recordId} AND (a.role='thumb' OR (a.role='full' AND a.mime LIKE 'image/%')) ORDER BY a.role='thumb' DESC LIMIT 1)`;

// Card video length (seconds) from the `full` asset; NULL when unknown.
export const durationSql = (recordId: string) =>
  `(SELECT duration FROM assets a WHERE a.record_id=${recordId} AND a.role='full' LIMIT 1)`;

// List-card columns (/api/records, related groups, hubs) for `records r`.
export const CARD_COLS = `r.id,r.archive,r.agency,r.title,r.summary,r.kind,r.redacted,r.location,r.incident_date,r.doc_date,
  ${thumbSql("r.id")} thumb, ${durationSql("r.id")} duration`;
