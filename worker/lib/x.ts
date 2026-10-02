// X API v2 client for the bot (Spec 4 §4.6). OAuth 1.0a user context:
// tokens never expire, so there is no refresh state to keep. JSON and
// multipart bodies are not part of the OAuth 1.0a signature; query params are.

export type XSecrets = { X_API_KEY: string; X_API_SECRET: string; X_ACCESS_TOKEN: string; X_ACCESS_SECRET: string };
export type Source = { size: number; read(offset: number, length: number): Promise<ArrayBuffer> };
export type Upload = { mediaId: string; ready: boolean };

const API = "https://api.x.com";
export const CHUNK = 4 * 1024 * 1024;

export class XError extends Error {
  constructor(public status: number, public body: string) {
    super(`X ${status}: ${body.slice(0, 300)}`);
  }
}

// RFC 3986: encodeURIComponent leaves !'()* unescaped.
const pct = (s: string) =>
  encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());

export async function oauth1Header(
  method: string, url: string, s: XSecrets, form: Record<string, string> = {},
  nonce = crypto.randomUUID().replace(/-/g, ""), ts = String(Math.floor(Date.now() / 1000)),
): Promise<string> {
  const u = new URL(url);
  const oauth: Record<string, string> = {
    oauth_consumer_key: s.X_API_KEY, oauth_nonce: nonce, oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: ts, oauth_token: s.X_ACCESS_TOKEN, oauth_version: "1.0",
  };
  const params = [...u.searchParams, ...Object.entries(form), ...Object.entries(oauth)]
    .map(([k, v]) => [pct(k), pct(v)] as const)
    .sort(([a, av], [b, bv]) => (a === b ? (av < bv ? -1 : av > bv ? 1 : 0) : a < b ? -1 : 1));
  const base = [method.toUpperCase(), pct(u.origin + u.pathname), pct(params.map(([k, v]) => `${k}=${v}`).join("&"))].join("&");
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(`${pct(s.X_API_SECRET)}&${pct(s.X_ACCESS_SECRET)}`), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sig = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(base)))));
  return "OAuth " + Object.entries({ ...oauth, oauth_signature: sig }).map(([k, v]) => `${pct(k)}="${pct(v)}"`).join(", ");
}

async function call(s: XSecrets, method: string, path: string, body?: { json?: unknown; form?: FormData }): Promise<any> {
  const url = API + path;
  const headers: Record<string, string> = { Authorization: await oauth1Header(method, url, s) };
  let payload: BodyInit | undefined;
  if (body?.json !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body.json);
  } else if (body?.form) payload = body.form;
  const r = await fetch(url, { method, headers, body: payload });
  const text = await r.text();
  if (!r.ok) throw new XError(r.status, text);
  return text ? JSON.parse(text) : {};
}

export async function createPost(s: XSecrets, text: string, mediaIds: string[] = []): Promise<string> {
  const j = await call(s, "POST", "/2/tweets", {
    json: { text, ...(mediaIds.length ? { media: { media_ids: mediaIds } } : {}) },
  });
  return String(j.data.id);
}

type Info = { state?: string; check_after_secs?: number; error?: { message?: string } } | undefined;
const statusInfo = async (s: XSecrets, id: string): Promise<Info> =>
  (await call(s, "GET", `/2/media/upload?command=STATUS&media_id=${id}`)).data?.processing_info;

export async function mediaStatus(s: XSecrets, mediaId: string): Promise<"succeeded" | "failed" | "pending"> {
  const info = await statusInfo(s, mediaId);
  return !info || info.state === "succeeded" ? "succeeded" : info.state === "failed" ? "failed" : "pending";
}

// Chunked v2 flow for images and video alike (one code path). Video encoding at
// X can outlast a tick: after maxWaitMs return ready:false and let the caller
// resume via mediaStatus() next tick (media ids live 24h).
export async function uploadMedia(
  s: XSecrets, src: Source, mime: string,
  opts: { sleep?: (ms: number) => Promise<void>; maxWaitMs?: number } = {},
): Promise<Upload> {
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const maxWaitMs = opts.maxWaitMs ?? 120_000;
  const media_category = mime.startsWith("video/") ? "tweet_video" : "tweet_image";
  const init = await call(s, "POST", "/2/media/upload/initialize", { json: { media_type: mime, total_bytes: src.size, media_category } });
  const id = String(init.data.id);
  for (let i = 0, off = 0; off < src.size; i++, off += CHUNK) {
    const form = new FormData();
    form.append("segment_index", String(i));
    form.append("media", new Blob([await src.read(off, Math.min(CHUNK, src.size - off))]));
    await call(s, "POST", `/2/media/upload/${id}/append`, { form });
  }
  let info: Info = (await call(s, "POST", `/2/media/upload/${id}/finalize`)).data?.processing_info;
  for (let waited = 0; info && info.state !== "succeeded"; ) {
    if (info.state === "failed") throw new XError(400, `media ${id} failed: ${info.error?.message ?? "unknown"}`);
    const ms = Math.min(20, Math.max(2, info.check_after_secs ?? 5)) * 1000;
    if (waited + ms > maxWaitMs) return { mediaId: id, ready: false };
    await sleep(ms);
    waited += ms;
    info = await statusInfo(s, id);
  }
  return { mediaId: id, ready: true };
}
