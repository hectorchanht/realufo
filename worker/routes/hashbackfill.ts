// POST /__hash-assets (Authorization: Bearer <ADMIN_TOKEN>)
// Backfills SHA-256 content hashes for mirrored asset files (tamper-evident
// provenance: anyone can hash a file decades later and prove it matches the
// 2026 mirror). Streams each R2 object through an incremental hash — memory
// stays flat even for large videos.
//
// Query params: limit=N (default 20, max 50), role=full|thumb|original.
// Smallest-first so a single call always makes progress. Returns
// { hashed: [{id, sha256}], skipped: [{id, reason}], remaining }.
import { createHash } from "node:crypto";
import type { Env } from "../env";
import { sameSecret } from "../lib/secret";
import { error, json } from "../lib/json";

type AssetRow = { id: number; record_id: string; role: string; r2_key: string | null; bytes: number | null };

// Core hashing loop shared by the manual endpoint and the cron tick.
// Hashes smallest-first until budgetMs of wall clock is spent or no unhashed
// assets remain. Returns { hashed, skipped, remaining }.
export async function hashBatch(env: Env, budgetMs: number, limit: number, role?: string) {
  const roleFilter = role === "full" || role === "thumb" || role === "original" ? "AND role = ?" : "";
  const roleBind = roleFilter ? [role] : [];
  const deadline = Date.now() + budgetMs;

  const hashed: { id: number; sha256: string }[] = [];
  const skipped: { id: number; reason: string }[] = [];
  for (;;) {
    if (Date.now() >= deadline) break;
    const batch = await env.DB.prepare(
      `SELECT id, record_id, role, r2_key, bytes FROM assets WHERE sha256 IS NULL ${roleFilter} ORDER BY bytes ASC NULLS LAST, id LIMIT ?`
    ).bind(...roleBind, limit).all<AssetRow>();
    const rows = batch.results ?? [];
    if (!rows.length) break;
    for (const a of rows) {
      if (Date.now() >= deadline) break;
      if (!a.r2_key) { skipped.push({ id: a.id, reason: "no r2_key" }); continue; }
      let obj: Awaited<ReturnType<Env["MEDIA"]["get"]>>;
      try {
        obj = await env.MEDIA.get(a.r2_key);
      } catch (e) {
        skipped.push({ id: a.id, reason: `r2 get failed: ${e instanceof Error ? e.message : e}` });
        continue;
      }
      if (!obj?.body) { skipped.push({ id: a.id, reason: "r2 object missing" }); continue; }
      try {
        const hash = createHash("sha256");
        for await (const chunk of obj.body as AsyncIterable<Uint8Array>) hash.update(chunk);
        const sha256 = hash.digest("hex");
        await env.DB.prepare("UPDATE assets SET sha256 = ? WHERE id = ?").bind(sha256, a.id).run();
        hashed.push({ id: a.id, sha256 });
      } catch (e) {
        skipped.push({ id: a.id, reason: `hash failed: ${e instanceof Error ? e.message : e}` });
      }
    }
    if (rows.length < limit) break;
  }

  const remaining = await env.DB.prepare(
    `SELECT count(*) c FROM assets WHERE sha256 IS NULL ${roleFilter}`
  ).bind(...roleBind).first<{ c: number }>();
  return { hashed, skipped, remaining: remaining?.c ?? 0 };
}

export async function hashAssets(req: Request, env: Env) {
  const token = env.ADMIN_TOKEN;
  const auth = req.headers.get("authorization") ?? "";
  if (!token || req.method !== "POST" || !(await sameSecret(auth, `Bearer ${token}`))) return error(404, "not found");

  const q = new URL(req.url).searchParams;
  const limit = Math.max(1, Math.min(50, Number(q.get("limit")) || 20));
  const role = q.get("role") ?? undefined;
  // Manual call: generous 25s budget.
  return json(await hashBatch(env, 25000, limit, role));
}

// Cron tick: hash a small batch each run (no token needed — the worker's own
// bindings). Self-terminating: stops when nothing remains. Smallest-first, so
// early ticks chew through thumbnails quickly; big videos take later ticks.
export async function hashBackfillTick(env: Env) {
  const remaining = await env.DB.prepare("SELECT count(*) c FROM assets WHERE sha256 IS NULL").first<{ c: number }>();
  if (!remaining?.c) return;
  await hashBatch(env, 20000, 25);
}
