import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

// data.js is `window.UFO_DATA = {...};` — evaluate it against a stub `window`
// object and read the assigned property back off, rather than trying to
// parse/require it as a module (it isn't one — it's a browser script).
export function loadData(path: string): any {
  const src = readFileSync(path, "utf8");
  const window: any = {};
  new Function("window", src)(window);
  return window.UFO_DATA;
}

// SQL string literal: NULL for null/undefined, else single-quoted with every
// embedded `'` doubled per SQLite's own escaping rule.
const q = (v: unknown): string =>
  v === null || v === undefined ? "NULL" : `'${String(v).replace(/'/g, "''")}'`;

// Numeric literal: NULL for null/undefined/empty-string, else a bare number.
const n = (v: unknown): string =>
  v === null || v === undefined || v === "" ? "NULL" : String(Number(v));

// SQLite has no boolean type — 0/1 integer.
const b = (v: unknown): number => (v ? 1 : 0);

export function agoToMinutes(ago?: string): number {
  if (!ago || ago === "now") return 0;
  const m = /^(\d+)\s*([smhd])$/.exec(ago.trim());
  if (!m) return 0;
  const x = +m[1];
  return m[2] === "s" ? Math.round(x / 60) : m[2] === "m" ? x : m[2] === "h" ? x * 60 : x * 1440;
}

// records.kind CHECK(kind IN ('pdf','image','video')): PDF -> pdf, VIDEO -> video, else -> image.
const kindOf = (t?: string): "pdf" | "video" | "image" =>
  t === "PDF" ? "pdf" : t === "VIDEO" ? "video" : "image";

const mimeFor = (kind: string): string =>
  kind === "pdf" ? "application/pdf" : kind === "video" ? "video/mp4" : "image/jpeg";

const created = (mins: number): string => `datetime('now','-${mins} minutes')`;

export function buildSeedSQL(D: any): string {
  const recIds = new Set(D.records.map((r: any) => r.id));
  const lines: string[] = ["PRAGMA foreign_keys=OFF;", "BEGIN;"];

  for (const a of D.archives || []) {
    lines.push(
      `INSERT INTO archives(id,label,flag,accent,count,coord) VALUES(${q(a.id)},${q(a.label)},${q(a.flag)},${q(a.accent)},${n(a.count)},${q(a.coord)});`
    );
  }

  for (const bd of D.boards || []) {
    lines.push(
      `INSERT INTO boards(id,slug,name,desc,accent,icon,online,thread_count) VALUES(${q(bd.id)},${q(bd.slug)},${q(bd.name)},${q(bd.desc)},${q(bd.accent)},${q(bd.icon)},${n(bd.online)},${n(bd.threads)});`
    );
  }

  for (const c of D.cases || []) {
    lines.push(
      `INSERT INTO cases(slug,name,archive,archive_label,accent,coord,lede,pull,pull_cite,status) VALUES(${q(c.slug)},${q(c.name)},${q(c.archive)},${q(c.archiveLabel)},${q(c.accent)},${q(c.coord)},${q(c.lede)},${q(c.pull)},${q(c.pullCite)},${q(c.status)});`
    );
  }

  for (const r of D.records || []) {
    const kind = kindOf(r.type);
    lines.push(
      `INSERT INTO records(id,archive,agency,agency_full,title,summary,incident_date,location,doc_date,kind,redacted,featured,virin,source_url,source_site,license,status) VALUES(${q(r.id)},${q(r.archive)},${q(r.agency)},${q(r.agencyFull)},${q(r.title)},${q(r.desc)},${q(r.incidentDate)},${q(r.location)},${q(r.releaseDate)},${q(kind)},${b(r.redacted)},${b(r.featured)},${q(r.virin)},${q(r.url)},${q(r.archive)},'public-domain-usgov','live');`
    );
    if (r.thumb) {
      lines.push(
        `INSERT INTO assets(record_id,role,cdn_url,mime) VALUES(${q(r.id)},'thumb',${q(r.thumb)},'image/jpeg');`
      );
    }
    if (r.url) {
      lines.push(
        `INSERT INTO assets(record_id,role,cdn_url,mime) VALUES(${q(r.id)},'full',${q(r.url)},${q(mimeFor(kind))});`
      );
    }
  }

  for (const t of D.threads || []) {
    const rec = t.rec && recIds.has(t.rec) ? t.rec : null;
    const mins = agoToMinutes(t.ago) || (t.mins ?? 0);
    lines.push(
      `INSERT INTO threads(id,no,board_id,title,stance,op_body,op_handle,op_id,tags,votes,reply_count,img_count,mins,source_record_id,case_slug,hot,created_at) VALUES(${q(t.id)},${n(t.no)},${q(t.board)},${q(t.title)},${q(t.stance)},${q(t.op)},${q(t.opHandle)},${q(t.opId)},${q(JSON.stringify(t.tags || []))},${n(t.votes)},${n(t.replies)},${n(t.imgs)},${n(t.mins)},${q(rec)},${q(t.caseSlug)},${b(t.hot)},${created(mins)});`
    );
  }

  for (const [tid, posts] of Object.entries<any>(D.threadPosts || {})) {
    for (const p of posts as any[]) {
      const rec = p.img && p.img.rec && recIds.has(p.img.rec) ? p.img.rec : null;
      const ik = p.img ? (rec ? p.img.kind : p.img.kind || "placeholder") : null;
      const il = p.img ? p.img.label || null : null;
      lines.push(
        `INSERT INTO posts(id,no,thread_id,body,handle,stance,votes,source_record_id,image_kind,image_label,reply_to,is_op,created_at) VALUES(${q(p.id)},${n(p.no)},${q(tid)},${q(p.body)},${q(p.handle)},${q(p.stance)},${n(p.votes)},${q(rec)},${q(ik)},${q(il)},${q(JSON.stringify(p.replyTo || []))},${b(p.op)},${created(agoToMinutes(p.ago))});`
      );
    }
  }

  for (const [rid, cs] of Object.entries<any>(D.docComments || {})) {
    for (const c of cs as any[]) {
      lines.push(
        `INSERT INTO comments(id,no,record_id,body,handle,stance,votes,created_at) VALUES(${q(c.id)},${n(c.no)},${q(rid)},${q(c.body)},${q(c.handle)},${q(c.stance)},${n(c.votes)},${created(agoToMinutes(c.ago))});`
      );
    }
  }

  for (const p of D.mapPoints || []) {
    lines.push(
      `INSERT INTO sightings(name,lat,lng,count,accent,case_slug) VALUES(${q(p.name)},${n(p.lat)},${n(p.lng)},${n(p.n)},${q(p.accent)},${q(p.slug)});`
    );
  }

  const ticker = D.ticker || [];
  for (let i = 0; i < ticker.length; i++) {
    const t = ticker[i];
    lines.push(
      `INSERT INTO ticker(kind,board,text,ago,sort) VALUES(${q(t.kind)},${q(t.board)},${q(t.text)},${q(t.ago)},${i});`
    );
  }

  lines.push(`INSERT INTO stats(id,json) VALUES(1,${q(JSON.stringify(D.stats || {}))});`);
  lines.push("COMMIT;");
  return lines.join("\n");
}

if (process.argv[1] && process.argv[1].endsWith("seed.ts")) {
  const remote = process.argv.includes("--remote");
  const D = loadData("realufo-handoff/data.js");
  const sql = buildSeedSQL(D);
  // buildSeedSQL()'s own output keeps the PRAGMA/BEGIN/COMMIT wrapper lines —
  // Task 5's test helper imports buildSeedSQL directly and filters those out
  // itself before running each statement through DB.batch(). But `wrangler d1
  // execute --file` runs against D1 (both --local and --remote), which manages
  // its own transactions and rejects explicit `BEGIN`/`COMMIT`/SAVEPOINT SQL
  // ("please use state.storage.transaction() ... instead of BEGIN TRANSACTION").
  // So strip the same wrapper lines here before writing the file this CLI path
  // actually executes.
  const fileSQL = sql
    .split("\n")
    .filter((line) => line !== "PRAGMA foreign_keys=OFF;" && line !== "BEGIN;" && line !== "COMMIT;")
    .join("\n");
  writeFileSync("db/.seed.sql", fileSQL);
  execSync(`wrangler d1 execute realufo-db ${remote ? "--remote" : "--local"} --file db/.seed.sql`, {
    stdio: "inherit",
  });
}
