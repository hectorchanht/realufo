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

// Thread-card image for `threads t`: first uploaded post image (OP first) as
// `thumbKey` (route maps it via uploadUrl), else the thumb of the thread's
// source record (or its first post's) as `recThumb`.
export const THREAD_THUMB_COLS = `(SELECT p.image_r2_key FROM posts p WHERE p.thread_id=t.id AND p.image_r2_key IS NOT NULL ORDER BY p.is_op DESC, p.created_at LIMIT 1) thumbKey,
  ${thumbSql("COALESCE(t.source_record_id,(SELECT p.source_record_id FROM posts p WHERE p.thread_id=t.id AND p.source_record_id IS NOT NULL ORDER BY p.is_op DESC, p.created_at LIMIT 1))")} recThumb`;

// Card video length (seconds) from the `full` asset; NULL when unknown.
export const durationSql = (recordId: string) =>
  `(SELECT duration FROM assets a WHERE a.record_id=${recordId} AND a.role='full' LIMIT 1)`;

// Card video black-bar crop "w:h:x:y" (crawler thumbs.py); '' / NULL = none. Portrait crops make the card thumb tall.
export const cropSql = (recordId: string) =>
  `(SELECT crop FROM assets a WHERE a.record_id=${recordId} AND a.role='full' LIMIT 1)`;

// Card one-liner from the TL;DR (crawler ingest.tldr); NULL until generated.
export const oneLinerSql = (recordId: string) =>
  `(SELECT one_liner FROM record_tldr x WHERE x.record_id=${recordId} AND x.lang='en')`;

// List-card columns (/api/records, related groups, hubs) for `records r`.
export const CARD_COLS = `r.id,r.archive,r.agency,r.title,r.summary,r.kind,r.redacted,r.location,r.incident_date,r.doc_date,
  ${thumbSql("r.id")} thumb, ${durationSql("r.id")} duration, ${cropSql("r.id")} crop, ${oneLinerSql("r.id")} oneLiner`;
