import type { Env } from "../env";
import { error } from "../lib/json";
import { UPLOAD_NAME_RE } from "../lib/upload";

// Serve a user-uploaded image. Name is validated so only `uploads/` is reachable.
export async function viewUpload(_req: Request, env: Env, p: Record<string, string>) {
  if (!UPLOAD_NAME_RE.test(p.name)) return error(404, "not found");
  const obj = await env.MEDIA.get("uploads/" + p.name);
  if (!obj) return error(404, "not found");
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  headers.set("x-content-type-options", "nosniff");
  headers.set("content-security-policy", "default-src 'none'");
  return new Response(obj.body, { headers });
}
