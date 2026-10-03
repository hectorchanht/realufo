import { env } from "cloudflare:test";
import { describe, it, expect, vi, afterEach } from "vitest";
import { b64u, encrypt, importP256, vapidHeader, send } from "../lib/webpush";

// RFC 8291 §5 worked example. Before trusting a failure, re-check every string
// against https://www.rfc-editor.org/rfc/rfc8291#section-5 (copy them verbatim from there).
const V = {
  plaintext: "When I grow up, I want to be a watermelon",
  asPublic: "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  asPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  uaPublic: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  auth: "BTBZMqHH6r4Tts7J_aSIgg",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  body: "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
};

async function vapidEnv() {
  const k = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const pub = new Uint8Array((await crypto.subtle.exportKey("raw", k.publicKey)) as ArrayBuffer);
  const { d } = (await crypto.subtle.exportKey("jwk", k.privateKey)) as JsonWebKey;
  return { e: { ...env, VAPID_PUBLIC_KEY: b64u.enc(pub), VAPID_PRIVATE_KEY: d, VAPID_SUBJECT: "mailto:t@example.com" } as any, pubKey: k.publicKey };
}

afterEach(() => vi.restoreAllMocks());

describe("webpush", () => {
  it("base64url round-trips every padding length", () => {
    for (const n of [0, 1, 2, 3, 16, 65]) {
      const b = crypto.getRandomValues(new Uint8Array(n));
      expect([...b64u.dec(b64u.enc(b))]).toEqual([...b]);
    }
  });

  it("encrypt matches the RFC 8291 §5 example", async () => {
    const asPublic = b64u.dec(V.asPublic);
    const asPrivate = await importP256(asPublic, V.asPrivate, "ECDH", ["deriveBits"]);
    const out = await encrypt(
      { endpoint: "https://push.example/x", p256dh: V.uaPublic, auth: V.auth },
      new TextEncoder().encode(V.plaintext),
      { salt: b64u.dec(V.salt), asPublic, asPrivate },
    );
    expect(b64u.enc(out)).toBe(V.body);
  });

  it("VAPID header: ES256 JWT for the push service origin, verifiable with the public key", async () => {
    const { e, pubKey } = await vapidEnv();
    const now = Date.UTC(2026, 9, 3);
    const h = await vapidHeader(e, "https://fcm.googleapis.com/fcm/send/abc", now);
    const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(h)!;
    expect(m[4]).toBe(e.VAPID_PUBLIC_KEY);
    const claims = JSON.parse(new TextDecoder().decode(b64u.dec(m[2])));
    expect(claims).toEqual({ aud: "https://fcm.googleapis.com", exp: now / 1000 + 12 * 3600, sub: "mailto:t@example.com" });
    const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pubKey, b64u.dec(m[3]), new TextEncoder().encode(`${m[1]}.${m[2]}`));
    expect(ok).toBe(true);
  });

  it("send: encrypted POST with push headers; 404/410 = gone, other failures = error", async () => {
    const { e } = await vapidEnv();
    const ua = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
    const sub = { endpoint: "https://push.example/s1", p256dh: b64u.enc((await crypto.subtle.exportKey("raw", ua.publicKey)) as ArrayBuffer), auth: b64u.enc(crypto.getRandomValues(new Uint8Array(16))) };
    let status = 201;
    let throws = false;
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      if (throws) throw new TypeError("down");
      return new Response(null, { status });
    });
    expect(await send(e, sub, { title: "t" })).toBe("ok");
    const init = spy.mock.calls[0][1] as RequestInit;
    const hdr = init.headers as Record<string, string>;
    expect(hdr["Content-Encoding"]).toBe("aes128gcm");
    expect(hdr.TTL).toBe("86400");
    expect(hdr.Authorization).toMatch(/^vapid t=/);
    expect((init.body as Uint8Array).length).toBeGreaterThan(86);
    status = 410;
    expect(await send(e, sub, {})).toBe("gone");
    status = 404;
    expect(await send(e, sub, {})).toBe("gone");
    status = 500;
    expect(await send(e, sub, {})).toBe("error");
    throws = true;
    expect(await send(e, sub, {})).toBe("error");
  });

  it("send: the per-invocation subrequest cap is 'limit' (not the sub's fault); failures are logged without the endpoint path", async () => {
    const { e } = await vapidEnv();
    const ua = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
    const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/SECRET", p256dh: b64u.enc((await crypto.subtle.exportKey("raw", ua.publicKey)) as ArrayBuffer), auth: b64u.enc(crypto.getRandomValues(new Uint8Array(16))) };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Too many subrequests.")).mockResolvedValueOnce(new Response("x".repeat(500), { status: 403 }));
    expect(await send(e, sub, {})).toBe("limit");
    expect(await send(e, sub, {})).toBe("error");
    const logged = warn.mock.calls.map((c) => String(c[0]));
    expect(logged.some((l) => l.includes("Too many subrequests"))).toBe(true);
    const http = JSON.parse(logged.find((l) => l.includes('"status":403'))!);
    expect(http).toEqual({ push: true, status: 403, endpointHost: "fcm.googleapis.com", body: "x".repeat(200) });
    expect(logged.join()).not.toContain("SECRET");
  });
});
