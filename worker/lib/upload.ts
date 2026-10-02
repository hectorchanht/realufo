import type { Env } from "../env";
import { error } from "./json";

// User-uploaded post images. Stored in R2 under `uploads/<uuid>.<ext>` and
// served same-origin by GET /api/u/:name (routes/upload.ts).
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const UPLOAD_NAME_RE = /^[0-9a-f-]{36}\.(jpg|png|gif|webp)$/;
export const uploadUrl = (key: string | null) => (key ? "/api/" + key.replace(/^uploads\//, "u/") : null);

// Type comes from magic bytes, never the client's Content-Type, so nothing but
// these four raster formats (no SVG/HTML) can be stored or served.
function sniff(b: Uint8Array): { mime: string; ext: string } | null {
  const at = (i: number, ...xs: number[]) => xs.every((x, j) => b[i + j] === x);
  if (at(0, 0xff, 0xd8, 0xff)) return { mime: "image/jpeg", ext: "jpg" };
  if (at(0, 0x89, 0x50, 0x4e, 0x47)) return { mime: "image/png", ext: "png" };
  if (at(0, 0x47, 0x49, 0x46, 0x38)) return { mime: "image/gif", ext: "gif" };
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return { mime: "image/webp", ext: "webp" };
  return null;
}

// Body of a write: JSON, or multipart/form-data carrying the same fields plus
// an optional `image` file.
export async function readBody(req: Request): Promise<{ b: any; image: File | null }> {
  if (!(req.headers.get("content-type") || "").startsWith("multipart/form-data")) {
    return { b: await req.json<any>().catch(() => ({})), image: null };
  }
  const form = await req.formData().catch(() => null);
  if (!form) return { b: {}, image: null };
  const b: Record<string, string> = {};
  let image: File | null = null;
  for (const [k, v] of form) {
    if (typeof v === "string") b[k] = v;
    else if (k === "image" && v.size > 0) image = v;
  }
  return { b, image };
}

// Validate + store. Returns the R2 key, or an error Response to send back.
export async function putImage(env: Env, file: File): Promise<string | Response> {
  if (file.size > MAX_IMAGE_BYTES) return error(413, "image too large (max 8 MB)");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const t = sniff(bytes);
  if (!t) return error(400, "image must be JPG, PNG, GIF or WebP");
  const key = `uploads/${crypto.randomUUID()}.${t.ext}`;
  await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: t.mime } });
  return key;
}
