// Public Developer API v1 — read-only, keyless, CORS-open.
// Contract: every response is { data, meta }; documented fields are additive-only.
// Reuses the internal handlers (listRecords, loadRecord, recordText, facetCounts,
// wargovReleases, storyView, queryShorts, listHubs, loadHub) so v1 can never drift
// from what the site itself renders. See docs/superpowers/plans/009-public-api-v1.md.
import type { Env } from "../env";
import { listRecords, loadRecord } from "./records";
import { recordText } from "./text";
import { facetCounts, wargovReleases } from "../lib/facets";
import { storyView } from "./cases";
import { queryShorts } from "./shorts";
import { listHubs, loadHub, type CardRow } from "./hubs";
import { CASE_STORY_TEXT } from "../lib/caseStoryText";
import { CASE_TITLE_ZH } from "../lib/caseStoryZh";

export const API_VERSION = "v1";

// ---- response helpers -------------------------------------------------

const cors = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, HEAD, OPTIONS", "access-control-allow-headers": "Content-Type", vary: "Origin" };

export function v1json(data: unknown, meta: unknown, cache: string, init: ResponseInit = {}) {
  return new Response(JSON.stringify({ data, meta }), {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-api-version": API_VERSION,
      "cache-control": cache,
      ...cors,
      ...(init.headers ?? {}),
    },
  });
}

export function v1error(status: number, message: string, retryAfter?: number) {
  const headers: Record<string, string> = {};
  if (retryAfter != null) headers["retry-after"] = String(retryAfter);
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json", "x-api-version": API_VERSION, ...cors, ...headers },
  });
}

/** OPTIONS preflight for /api/v1/* (wired in index.ts before the router). */
export function v1Preflight() {
  return new Response(null, { status: 204, headers: { ...cors, "access-control-max-age": "86400" } });
}

// ---- rate limiting ------------------------------------------------------
// In-memory sliding window per IP (cheap: no D1 write per request). Per-isolate,
// so it's approximate under load — good enough to stop floods, not an accounting
// ledger. Generous defaults: 600 requests / 60s per IP.
const windows = new Map<string, number[]>();
function allowRead(req: Request, env: Env): { ok: boolean; remaining: number; limit: number } {
  const max = Number(env.API_RATE_MAX) || 600;
  const windowSec = Number(env.API_RATE_WINDOW_SEC) || 60;
  const ip = req.headers.get("CF-Connecting-IP") ?? req.headers.get("x-anon-id") ?? "unknown";
  const now = Date.now();
  const cutoff = now - windowSec * 1000;
  let hits = windows.get(ip) ?? [];
  hits = hits.filter((t) => t > cutoff);
  const ok = hits.length < max;
  if (ok) hits.push(now);
  if (hits.length) windows.set(ip, hits);
  else windows.delete(ip);
  return { ok, remaining: Math.max(0, max - hits.length), limit: max };
}

// ---- usage analytics ----------------------------------------------------
// Privacy-preserving: per-day, per-route-template hit counts. No IPs, no
// user agents, no query strings. Written fire-and-forget via ctx.waitUntil()
// so it never adds latency to the API response. Fails soft if the 0044
// migration hasn't been applied yet (same pattern as webhooks).
function logApiHit(env: Env, endpoint: string): Promise<unknown> {
  const day = new Date().toISOString().slice(0, 10); // UTC
  return env.DB.prepare(
    "INSERT INTO api_usage (day, endpoint, hits) VALUES (?, ?, 1) " +
    "ON CONFLICT(day, endpoint) DO UPDATE SET hits = hits + 1"
  ).bind(day, endpoint).run().catch(() => {});
}

// Wraps a v1 handler with rate limiting + usage logging + shared headers.
export function v1guarded(
  endpoint: string,
  fn: (req: Request, env: Env, p: Record<string, string>) => Promise<Response>,
) {
  return async (req: Request, env: Env, p: Record<string, string>, ctx?: ExecutionContext) => {
    const rl = allowRead(req, env);
    if (!rl.ok) return v1error(429, "rate limit exceeded — slow down and retry", Number(env.API_RATE_WINDOW_SEC) || 60);
    const res = await fn(req, env, p);
    if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(logApiHit(env, endpoint));
    res.headers.set("x-ratelimit-limit", String(rl.limit));
    res.headers.set("x-ratelimit-remaining", String(rl.remaining));
    res.headers.set("x-api-version", API_VERSION);
    return res;
  };
}

// ---- pagination ---------------------------------------------------------
// v1 speaks page/per_page; the internal /api/records speaks limit/offset.
function pageParams(url: URL, def = 20): { page: number; perPage: number; limit: number; offset: number } {
  const q = url.searchParams;
  const page = Math.max(1, Number(q.get("page")) || 1);
  const perPage = Math.max(1, Math.min(100, Number(q.get("per_page")) || def));
  return { page, perPage, limit: perPage, offset: (page - 1) * perPage };
}

// Card fields — the locked contract from docs/superpowers/plans/009-public-api-v1.md.
const card = (r: Record<string, any>) => ({
  id: r.id, archive: r.archive, agency: r.agency, title: r.title, summary: r.summary,
  kind: r.kind, redacted: r.redacted, location: r.location,
  incident_date: r.incident_date, doc_date: r.doc_date,
  thumb: r.thumb ?? null, duration: r.duration ?? null, crop: r.crop ?? null, oneLiner: r.oneLiner ?? null,
});

// ---- endpoints ----------------------------------------------------------

// GET /api/v1/records?q=&archive=&type=&agency=&location=&year=&decade=&release=&sort=&has=&page=&per_page=
export const v1ListRecords = v1guarded("GET /api/v1/records", async (req, env) => {
  const url = new URL(req.url);
  const { page, perPage, limit, offset } = pageParams(url);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", String(offset));
  const res = await listRecords(new Request(url, req), env);
  const body = (await res.json()) as { count: number; records: Record<string, any>[] };
  return v1json(
    body.records.map((r) => ({ ...card(r), match: r.match ?? null })),
    { total: body.count, page, per_page: perPage },
    "public, max-age=60, s-maxage=300"
  );
});

// GET /api/v1/records/:id
export const v1GetRecord = v1guarded("GET /api/v1/records/:id", async (req, env, p) => {
  const d = await loadRecord(env, p.id, new URL(req.url).origin);
  if (!d) return v1error(404, "record not found");
  const r = d.record as unknown as Record<string, any>;
  return v1json(
    {
      id: r.id, archive: r.archive, agency: r.agency, title: r.title, summary: r.summary,
      kind: r.kind, redacted: r.redacted, location: r.location,
      incident_date: r.incident_date, doc_date: r.doc_date,
      url: `${new URL(req.url).origin}/doc/${encodeURIComponent(r.id)}`,
      assets: (d.assets as any[]).map((a) => ({
        role: a.role, url: a.cdn_url, mime: a.mime,
        width: a.width ?? null, height: a.height ?? null, duration: a.duration ?? null, crop: a.crop ?? null,
      })),
      release: d.release,
      series: {
        prev: d.series.prev ? { id: d.series.prev, title: d.series.prevTitle } : null,
        next: d.series.next ? { id: d.series.next, title: d.series.nextTitle } : null,
      },
      related: d.related.map((g: any) => ({
        key: g.key, label: g.label, records: g.records.map((x: any) => ({ id: x.id, title: x.title, kind: x.kind, thumb: x.thumb ?? null })),
      })),
      fullText: d.fullText
        ? { truncated: d.fullText.truncated, total_pages: d.fullText.total_pages, aiSummary: d.fullText.aiSummary, aiSections: d.fullText.aiSections }
        : null,
      tldr: d.tldr,
      hubs: d.hubs,
      topics: d.topics,
      citedIn: d.citedIn,
      articles: d.articles,
    },
    { version: API_VERSION },
    "public, max-age=60, s-maxage=600"
  );
});

// GET /api/v1/records/:id/text — raw OCR pages, JSON only.
export const v1RecordText = v1guarded("GET /api/v1/records/:id/text", async (req, env, p) => {
  const url = new URL(req.url);
  url.searchParams.set("format", "json");
  const res = await recordText(new Request(url, req), env, p);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({ error: "not found" }))) as { error: string };
    return v1error(res.status, body.error ?? "not found");
  }
  const body = (await res.json()) as Record<string, any>;
  return v1json({ id: body.id, title: body.title, url: body.url, pages: body.pages, ...(body.truncated ? { truncated: body.truncated, total_pages: body.total_pages } : {}) }, { version: API_VERSION }, "public, max-age=60, s-maxage=600");
});

// GET /api/v1/archives
export const v1Archives = v1guarded("GET /api/v1/archives", async (_req, env) => {
  const f = await facetCounts(env);
  return v1json(
    {
      releases: f.releases.map(({ no, date, count }) => ({ no, date, count })),
      kinds: f.kinds, agencies: f.agencies, decades: f.decades, locations: f.locations, flags: f.flags,
    },
    { version: API_VERSION },
    "public, max-age=300, s-maxage=3600"
  );
});

// GET /api/v1/releases
export const v1Releases = v1guarded("GET /api/v1/releases", async (_req, env) => {
  const rels = await wargovReleases(env);
  return v1json(
    rels.map((r) => ({ no: r.no, date: r.date, file_count: r.raw.length, doc_dates: r.raw })),
    { total: rels.length },
    "public, max-age=300, s-maxage=3600"
  );
});

// GET /api/v1/cases
export const v1Cases = v1guarded("GET /api/v1/cases", async (_req) => {
  const data = Object.entries(CASE_STORY_TEXT).map(([slug, s]) => ({ slug, title: s.title, title_zh: CASE_TITLE_ZH[slug] ?? null, updated: s.updated }));
  return v1json(data, { total: data.length }, "public, max-age=300, s-maxage=3600");
});

// GET /api/v1/cases/:slug
export const v1GetCase = v1guarded("GET /api/v1/cases/:slug", async (_req, env, p) => {
  const s = await storyView(env, p.slug);
  if (!s) return v1error(404, "case not found");
  return v1json({ slug: p.slug, title: s.title, title_zh: s.titleZh, updated: s.updated, timeline: s.timeline, sources: s.sources }, { version: API_VERSION }, "public, max-age=300, s-maxage=3600");
});

// GET /api/v1/shorts?q=&page=&per_page=
export const v1Shorts = v1guarded("GET /api/v1/shorts", async (req, env) => {
  const url = new URL(req.url);
  const { page, perPage, limit, offset } = pageParams(url);
  const { shorts, total } = await queryShorts(env, { q: url.searchParams.get("q") ?? "", limit, offset });
  return v1json(
    shorts.map((s) => ({ id: s.id, title: s.title, thumb: s.thumb, clip: s.clip, likes: s.likes, comments: s.comments })),
    { total, page, per_page: perPage },
    "public, max-age=60, s-maxage=300"
  );
});

// GET /api/v1/hubs
export const v1Hubs = v1guarded("GET /api/v1/hubs", async (req, env) => {
  const hubs = await listHubs(env, new URL(req.url).origin);
  return v1json(hubs, { total: hubs.length }, "public, max-age=300, s-maxage=3600");
});

// GET /api/v1/hubs/:kind/:slug — the public API always returns the hub's full
// file list (pageSize 0); the website's own pages paginate instead.
export const v1GetHub = v1guarded("GET /api/v1/hubs/:kind/:slug", async (req, env, p) => {
  const h = await loadHub(env, p.kind, p.slug, new URL(req.url).origin, 1, 0);
  if (!h) return v1error(404, "hub not found");
  return v1json(
    {
      kind: h.kind, slug: h.slug, title: h.title, intro: h.intro, stats: h.stats,
      records: (h.records as CardRow[]).map((r) => card(r as unknown as Record<string, any>)),
      siblings: h.siblings, highlights: h.highlights,
    },
    { version: API_VERSION },
    "public, max-age=300, s-maxage=3600"
  );
});

// ---- OpenAPI ------------------------------------------------------------

// GET /api/v1/openapi.json
// Aggregate API usage: last 30 days of per-day, per-endpoint hit counts.
// Public and privacy-safe (no IPs, no user agents, no query strings) —
// doubles as a liveness signal for developers evaluating the API.
export const v1Usage = v1guarded("GET /api/v1/usage", async (_req, env) => {
  const cutoff = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  let rows: { day: string; endpoint: string; hits: number }[] = [];
  try {
    const { results } = await env.DB.prepare(
      "SELECT day, endpoint, hits FROM api_usage WHERE day >= ? ORDER BY day DESC, hits DESC"
    ).bind(cutoff).all<{ day: string; endpoint: string; hits: number }>();
    rows = results ?? [];
  } catch { /* migration not applied yet: empty, not an error */ }
  const total = rows.reduce((n, r) => n + r.hits, 0);
  return v1json(rows, { total, days: 30, note: "aggregate counts only — no IPs or user agents are logged" }, "public, max-age=300");
});

export const v1OpenAPI = v1guarded("GET /api/v1/openapi.json", async (req) => {
  const origin = new URL(req.url).origin;
  const base = `${origin}/api/v1`;
  const cardSchema = {
    type: "object",
    properties: {
      id: { type: "string" }, archive: { type: "string" }, agency: { type: "string", nullable: true },
      title: { type: "string", nullable: true }, summary: { type: "string", nullable: true },
      kind: { type: "string" }, redacted: { type: "integer" }, location: { type: "string", nullable: true },
      incident_date: { type: "string", nullable: true }, doc_date: { type: "string", nullable: true },
      thumb: { type: "string", nullable: true }, duration: { type: "number", nullable: true },
      crop: { type: "string", nullable: true }, oneLiner: { type: "string", nullable: true },
    },
    required: ["id", "archive", "kind"],
  };
  const listMeta = { type: "object", properties: { total: { type: "integer" }, page: { type: "integer" }, per_page: { type: "integer" } } };
  const spec = {
    openapi: "3.0.0",
    info: {
      title: "RealUFO Public API",
      version: "1.0.0",
      description:
        "Read-only API over realufo.org — the declassified UAP archive (war.gov, AARO, NARA, NASA, DoD FOIA and more). Keyless, CORS-open, rate-limited (600 req/60s per IP). Mirrored official-source fields match the sources exactly; AI summaries and TL;DRs are site-generated. Please attribute realufo.org.",
      contact: { url: "https://realufo.org/developers" },
    },
    servers: [{ url: base }],
    paths: {
      "/records": {
        get: {
          summary: "Search and filter records",
          parameters: [
            { name: "q", in: "query", schema: { type: "string" }, description: "Full-text search (FTS5 + metadata)" },
            { name: "archive", in: "query", schema: { type: "string" }, description: "e.g. wargov, aaro, nara, nasa" },
            { name: "type", in: "query", schema: { type: "string" }, description: "pdf | video | image | shorts | audio" },
            { name: "agency", in: "query", schema: { type: "string" } },
            { name: "location", in: "query", schema: { type: "string" } },
            { name: "year", in: "query", schema: { type: "string" }, description: "e.g. 1947" },
            { name: "decade", in: "query", schema: { type: "string" }, description: "e.g. 1940" },
            { name: "release", in: "query", schema: { type: "string" }, description: "war.gov release number" },
            { name: "sort", in: "query", schema: { type: "string", enum: ["new", "az", "release", "old", "recent"] } },
            { name: "has", in: "query", schema: { type: "string" }, description: "comma list: text, ai, moments, featured" },
            { name: "page", in: "query", schema: { type: "integer", default: 1 } },
            { name: "per_page", in: "query", schema: { type: "integer", default: 20, maximum: 100 } },
          ],
          responses: { "200": { description: "ok", content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: cardSchema }, meta: listMeta } } } } } },
        },
      },
      "/records/{id}": {
        get: {
          summary: "One record, full detail",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "ok" }, "404": { description: "record not found" } },
        },
      },
      "/records/{id}/text": {
        get: {
          summary: "OCR full text pages of a record",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "ok" }, "404": { description: "no full text" } },
        },
      },
      "/archives": { get: { summary: "Filter facets: releases, kinds, agencies, decades, locations", responses: { "200": { description: "ok" } } } },
      "/releases": { get: { summary: "war.gov release list", responses: { "200": { description: "ok" } } } },
      "/cases": { get: { summary: "Case stories (slug + title)", responses: { "200": { description: "ok" } } } },
      "/cases/{slug}": {
        get: {
          summary: "One case story with resolved sources",
          parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "ok" }, "404": { description: "case not found" } },
        },
      },
      "/shorts": {
        get: {
          summary: "Short clips",
          parameters: [
            { name: "q", in: "query", schema: { type: "string" } },
            { name: "page", in: "query", schema: { type: "integer", default: 1 } },
            { name: "per_page", in: "query", schema: { type: "integer", default: 20, maximum: 100 } },
          ],
          responses: { "200": { description: "ok" } },
        },
      },
      "/hubs": { get: { summary: "Curated hub list (agency / location / release / decade / topic)", responses: { "200": { description: "ok" } } } },
      "/hubs/{kind}/{slug}": {
        get: {
          summary: "One hub with its records",
          parameters: [
            { name: "kind", in: "path", required: true, schema: { type: "string" } },
            { name: "slug", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: { "200": { description: "ok" }, "404": { description: "hub not found" } },
        },
      },
      "/usage": {
        get: {
          summary: "Aggregate API usage (last 30 days, per endpoint)",
          description: "Privacy-safe liveness signal: day + endpoint + hit counts only. No IPs, user agents or query strings are logged.",
          responses: { "200": { description: "ok" } },
        },
      },
      "/webhooks": {
        post: {
          summary: "Subscribe a URL to archive events",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["url"],
                  properties: {
                    url: { type: "string", description: "https URL receiving POSTs" },
                    events: { type: "array", items: { type: "string", enum: ["records.created", "release.created"] }, description: "default: both" },
                  },
                },
              },
            },
          },
          responses: {
            "201": {
              description: "created — the secret is shown once",
              content: { "application/json": { schema: { type: "object", properties: { data: { type: "object", properties: { id: { type: "string" }, url: { type: "string" }, events: { type: "array", items: { type: "string" } }, secret: { type: "string" } } } } } } },
            },
          },
        },
      },
      "/webhooks/{id}": {
        get: {
          summary: "Subscription status (X-Webhook-Secret header)",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
            { name: "X-Webhook-Secret", in: "header", required: true, schema: { type: "string" } },
          ],
          responses: { "200": { description: "ok" }, "404": { description: "not found or wrong secret" } },
        },
        delete: {
          summary: "Delete a subscription (X-Webhook-Secret header)",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
            { name: "X-Webhook-Secret", in: "header", required: true, schema: { type: "string" } },
          ],
          responses: { "200": { description: "deleted" }, "404": { description: "not found or wrong secret" } },
        },
      },
    },
  };
  return v1json(spec, { version: API_VERSION }, "public, max-age=3600, s-maxage=86400");
});
