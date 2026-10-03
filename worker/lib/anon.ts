export async function actorId(req: Request, salt: string): Promise<string> {
  const raw = req.headers.get("X-Anon-Id");
  return raw ? saltedHash(raw, salt) : "anon:none";
}
// Poster identity for posts.actor_id; null without an anon id, so header-less
// posters never "match" each other.
export async function postActor(req: Request, env: { ANON_SALT: string }): Promise<string | null> {
  return req.headers.get("X-Anon-Id") ? actorId(req, env.ANON_SALT) : null;
}
export async function saltedHash(raw: string, salt: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw + salt));
  return [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, "0")).join("");
}
export const newId = () => Array.from({ length: 8 }, () => Math.floor(Math.random()*16).toString(16)).join("").toUpperCase();
export const newNo = () => Math.floor(24419000 + Math.random()*9000);
