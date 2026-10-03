// Web Push sender on WebCrypto: RFC 8291 (aes128gcm payload encryption) + RFC 8292
// (VAPID). No library — `web-push` leans on Node's https/crypto.
// Spec 2026-10-03-realufo-pwa-push-design §2d.
import type { Env } from "../env";

export interface PushSub {
  endpoint: string;
  p256dh: string;
  auth: string;
}
// "limit" = this invocation ran out of subrequests: says nothing about the subscription.
export type SendResult = "ok" | "gone" | "error" | "limit";

const te = new TextEncoder();

export const b64u = {
  enc: (b: ArrayBuffer | Uint8Array) =>
    btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
  dec: (s: string) =>
    Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0)),
};

const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

// P-256 key from its raw uncompressed point (0x04 || x || y), plus the private scalar d when signing/deriving.
export function importP256(raw: Uint8Array, d: string | undefined, alg: "ECDH" | "ECDSA", usages: string[]) {
  const jwk: JsonWebKey = { kty: "EC", crv: "P-256", x: b64u.enc(raw.slice(1, 33)), y: b64u.enc(raw.slice(33, 65)), ...(d ? { d } : {}) };
  return crypto.subtle.importKey("jwk", jwk, { name: alg, namedCurve: "P-256" }, false, usages);
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, bytes * 8));
}

// One aes128gcm record (RFC 8291 §3-4, RFC 8188). `fixed` injects salt + sender keys for the RFC test vector.
export async function encrypt(sub: PushSub, payload: Uint8Array, fixed?: { salt: Uint8Array; asPublic: Uint8Array; asPrivate: CryptoKey }) {
  const uaPublic = b64u.dec(sub.p256dh);
  let asPublic: Uint8Array;
  let asPrivate: CryptoKey;
  if (fixed) ({ asPublic, asPrivate } = fixed);
  else {
    const kp = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
    asPublic = new Uint8Array((await crypto.subtle.exportKey("raw", kp.publicKey)) as ArrayBuffer);
    asPrivate = kp.privateKey;
  }
  const salt = fixed?.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const uaKey = await importP256(uaPublic, undefined, "ECDH", []);
  // workers-types spells the ECDH param `$public`; the runtime wants `public`.
  const ecdhAlg = { name: "ECDH", public: uaKey } as unknown as SubtleCryptoDeriveKeyAlgorithm;
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits(ecdhAlg, asPrivate, 256));
  const ikm = await hkdf(b64u.dec(sub.auth), ecdh, concat(te.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const cek = await hkdf(salt, ikm, te.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, te.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  // 0x02 = padding delimiter of the last (only) record.
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, concat(payload, new Uint8Array([2]))));
  const header = new Uint8Array(21); // salt(16) | record size(4) | key id length(1)
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  return concat(header, asPublic, cipher);
}

// VAPID JWTs live 12 h; reuse one per push-service origin for 11 h within an isolate.
const vapidCache = new Map<string, { h: string; until: number }>();
export async function vapidHeader(env: Env, endpoint: string, now = Date.now()) {
  const aud = new URL(endpoint).origin;
  const hit = vapidCache.get(aud);
  if (hit && hit.until > now) return hit.h;
  const key = await importP256(b64u.dec(env.VAPID_PUBLIC_KEY!), env.VAPID_PRIVATE_KEY!, "ECDSA", ["sign"]);
  const head = b64u.enc(te.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = { aud, exp: Math.floor(now / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT || "mailto:hello@realufo.org" };
  const body = b64u.enc(te.encode(JSON.stringify(claims)));
  // WebCrypto ECDSA signatures are raw r||s — exactly the JOSE ES256 format.
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, te.encode(`${head}.${body}`));
  const h = `vapid t=${head}.${body}.${b64u.enc(sig)}, k=${env.VAPID_PUBLIC_KEY}`;
  vapidCache.set(aud, { h, until: now + 11 * 3600 * 1000 });
  return h;
}

export async function send(env: Env, sub: PushSub, msg: unknown, opts: { ttl?: number; urgency?: "low" | "normal" | "high" } = {}): Promise<SendResult> {
  try {
    const res = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        Authorization: await vapidHeader(env, sub.endpoint),
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: String(opts.ttl ?? 86400),
        Urgency: opts.urgency ?? "normal",
      },
      body: await encrypt(sub, te.encode(JSON.stringify(msg))),
    });
    if (res.status === 404 || res.status === 410) return "gone";
    if (res.ok) return "ok";
    // Host only: the endpoint path is the subscription's secret capability.
    const body = (await res.text().catch(() => "")).slice(0, 200);
    console.warn(JSON.stringify({ push: true, status: res.status, endpointHost: new URL(sub.endpoint).host, body }));
    return "error";
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.warn(JSON.stringify({ push: true, endpointHost: new URL(sub.endpoint).host, error: message }));
    return /subrequest/i.test(message) ? "limit" : "error";
  }
}
