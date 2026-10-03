// One-off: print a VAPID key pair for Web Push (spec 2026-10-03-realufo-pwa-push-design §2d).
//   node scripts/vapid-keys.mjs
// Public → wrangler.jsonc vars.VAPID_PUBLIC_KEY (and .dev.vars for local);
// private → `wrangler secret put VAPID_PRIVATE_KEY` (and .dev.vars). Never commit the private key.
const k = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
const pub = Buffer.from(await crypto.subtle.exportKey("raw", k.publicKey)).toString("base64url");
const { d } = await crypto.subtle.exportKey("jwk", k.privateKey);
console.log(`VAPID_PUBLIC_KEY=${pub}\nVAPID_PRIVATE_KEY=${d}`);
