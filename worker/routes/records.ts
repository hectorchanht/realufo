import type { Env } from "../env";
import { json, error } from "../lib/json";

export async function listRecords(req: Request, env: Env) {
  const u = new URL(req.url);
  const where: string[] = [];
  const bind: unknown[] = [];
  const arch = u.searchParams.get("archive");
  if (arch && arch !== "all") {
    where.push("r.archive=?");
    bind.push(arch);
  }
  const type = u.searchParams.get("type");
  if (type && type !== "all") {
    where.push("r.kind=?");
    bind.push(type.toLowerCase());
  }
  if (u.searchParams.get("redacted") === "1") where.push("r.redacted=1");
  const q = (u.searchParams.get("q") || "").trim();
  if (q) {
    where.push("(lower(r.title||' '||r.agency||' '||coalesce(r.location,'')||' '||coalesce(r.summary,'')) LIKE ?)");
    bind.push("%" + q.toLowerCase() + "%");
  }
  const w = where.length ? "WHERE " + where.join(" AND ") : "";
  const limit = Math.min(100, +(u.searchParams.get("limit") || 40));
  const offset = +(u.searchParams.get("offset") || 0);
  const total = await env.DB.prepare(`SELECT count(*) c FROM records r ${w}`).bind(...bind).first<{ c: number }>();
  const rows = await env.DB.prepare(
    `
    SELECT r.id,r.archive,r.agency,r.title,r.summary,r.kind,r.redacted,r.location,r.incident_date,r.doc_date,
      (SELECT cdn_url FROM assets a WHERE a.record_id=r.id AND a.role='thumb' LIMIT 1) thumb
    FROM records r ${w} ORDER BY r.featured DESC, r.created_at DESC LIMIT ? OFFSET ?`
  )
    .bind(...bind, limit, offset)
    .all();
  return json({ count: total?.c ?? 0, records: rows.results });
}

export async function getRecord(_req: Request, env: Env, p: Record<string, string>) {
  const record = await env.DB.prepare("SELECT * FROM records WHERE id=?").bind(p.id).first();
  if (!record) return error(404, "record not found");
  const [assets, promoted] = await Promise.all([
    env.DB.prepare("SELECT role,cdn_url,mime,width,height FROM assets WHERE record_id=?").bind(p.id).all(),
    env.DB.prepare(
      `SELECT t.id,t.no,t.title,t.stance,t.votes,t.source_record_id,b.slug boardSlug,b.accent accent
                    FROM threads t JOIN boards b ON b.id=t.board_id WHERE t.source_record_id=?`
    )
      .bind(p.id)
      .all(),
  ]);
  return json({ record, assets: assets.results, promotedThreads: promoted.results });
}
