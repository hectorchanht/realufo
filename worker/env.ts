export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  ASSETS: Fetcher;
  ANON_SALT: string;
  FEATURE_AUTH: string;
  RATE_MAX?: string;
  RATE_WINDOW_SEC?: string;
  UPLOAD_BASE?: string; // public URL prefix for uploads/<name>; default same-origin /api/u/
}
