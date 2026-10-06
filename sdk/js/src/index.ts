/**
 * realufo — JavaScript/TypeScript client for the RealUFO Public API v1.
 * Read-only, keyless, CORS-open. https://realufo.org/developers
 *
 * ```ts
 * import { RealUFO } from "realufo";
 * const api = new RealUFO();
 * const { data, meta } = await api.records({ q: "tic tac", per_page: 5 });
 * ```
 */

export interface PageMeta {
  total: number;
  page: number;
  per_page: number;
}

export interface RecordCard {
  id: string;
  archive: string;
  agency: string | null;
  title: string | null;
  summary: string | null;
  kind: string;
  redacted: number;
  location: string | null;
  incident_date: string | null;
  doc_date: string | null;
  thumb: string | null;
  duration: number | null;
  crop: string | null;
  oneLiner: string | null;
  match: { page: number; text: string } | null;
}

export interface RecordDetail extends Omit<RecordCard, "match"> {
  url: string;
  assets: { role: string; url: string; mime: string; width: number | null; height: number | null; duration: number | null; crop: string | null }[];
  release: { no: number; date: string } | null;
  series: { prev: { id: string; title: string | null } | null; next: { id: string; title: string | null } | null };
  related: { key: string; label: string; records: { id: string; title: string | null; kind: string; thumb: string | null }[] }[];
  fullText: { truncated: boolean; total_pages: number; aiSummary: string | null; aiSections: { from: number; to: number; text: string }[] | null } | null;
  tldr: { bullets: string[]; oneLiner: string; cardUrl: string | null } | null;
  hubs: Record<string, string>;
  topics: { slug: string; label: string }[];
  citedIn: { slug: string; title: string }[];
}

export interface RecordsParams extends Record<string, string | number | undefined> {
  q?: string;
  archive?: string;
  type?: string;
  agency?: string;
  location?: string;
  year?: string;
  decade?: string;
  release?: string;
  sort?: "new" | "az" | "release" | "old" | "recent";
  has?: string;
  page?: number;
  per_page?: number;
}

export interface Short {
  id: string;
  title: string | null;
  thumb: string | null;
  clip: string;
  likes: number;
  comments: number;
}

export interface WebhookSub {
  id: string;
  url: string;
  events: string[];
  secret: string;
}

export class RealUFOError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "RealUFOError";
    this.status = status;
  }
}

type FetchFn = typeof fetch;

export class RealUFO {
  private base: string;
  private fetchFn: FetchFn;

  constructor(base = "https://realufo.org/api/v1", fetchFn: FetchFn = fetch) {
    this.base = base.replace(/\/+$/, "");
    this.fetchFn = fetchFn;
  }

  private async req<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await this.fetchFn(this.base + path, {
      ...init,
      headers: { accept: "application/json", ...(init?.headers ?? {}) },
    });
    const body = (await res.json().catch(() => ({}))) as { data?: T; error?: string };
    if (!res.ok) throw new RealUFOError(res.status, body.error ?? `HTTP ${res.status}`);
    return body.data as T;
  }

  private async paged<T>(path: string, params: Record<string, unknown> = {}): Promise<{ data: T[]; meta: PageMeta }> {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
    const res = await this.fetchFn(`${this.base}${path}?${q}`, { headers: { accept: "application/json" } });
    const body = (await res.json().catch(() => ({}))) as { data?: T[]; meta?: PageMeta; error?: string };
    if (!res.ok) throw new RealUFOError(res.status, body.error ?? `HTTP ${res.status}`);
    return { data: body.data ?? [], meta: body.meta ?? { total: 0, page: 1, per_page: 0 } };
  }

  /** Search and filter records. */
  records(params: RecordsParams = {}) {
    return this.paged<RecordCard>("/records", params);
  }

  /** One record, full detail. */
  record(id: string) {
    return this.req<RecordDetail>(`/records/${encodeURIComponent(id)}`);
  }

  /** OCR full text pages of a record. */
  text(id: string) {
    return this.req<{ id: string; title: string; url: string; pages: { n: number; text: string }[] }>(
      `/records/${encodeURIComponent(id)}/text`
    );
  }

  /** Filter facets: releases, kinds, agencies, decades, locations. */
  archives() {
    return this.req<{
      releases: { no: number; date: string; count: number }[];
      kinds: { name: string; count: number }[];
      agencies: { name: string; count: number }[];
      decades: { name: string; count: number }[];
      locations: { name: string; count: number }[];
    }>("/archives");
  }

  /** war.gov release list with file counts. */
  releases() {
    return this.req<{ no: number; date: string; file_count: number; doc_dates: string[] }[]>("/releases");
  }

  /** Case stories (slug + title). */
  cases() {
    return this.req<{ slug: string; title: string; title_zh: string | null; updated: string }[]>("/cases");
  }

  /** One case story with resolved sources. */
  case(slug: string) {
    return this.req(`/cases/${encodeURIComponent(slug)}`);
  }

  /** Short clips. */
  shorts(params: { q?: string; page?: number; per_page?: number } = {}) {
    return this.paged<Short>("/shorts", params);
  }

  /** Curated hubs. */
  hubs() {
    return this.req<{ kind: string; slug: string; label: string; count: number }[]>("/hubs");
  }

  /** One hub with its records. */
  hub(kind: string, slug: string) {
    return this.req(`/hubs/${encodeURIComponent(kind)}/${encodeURIComponent(slug)}`);
  }

  /** Subscribe a URL to archive events. The secret is shown once — store it. */
  webhook(url: string, events: ("records.created" | "release.created")[] = ["records.created", "release.created"]) {
    return this.req<WebhookSub>("/webhooks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url, events }),
    });
  }

  /** Delete a webhook subscription (needs the creation secret). */
  deleteWebhook(id: string, secret: string) {
    return this.req<{ deleted: boolean; id: string }>(`/webhooks/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { "x-webhook-secret": secret },
    });
  }

  /** Verify an incoming webhook's HMAC-SHA256 signature (WebCrypto). */
  static async verifyWebhook(secret: string, body: string, signature: string): Promise<boolean> {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
    const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
    return hex === signature.toLowerCase();
  }
}
