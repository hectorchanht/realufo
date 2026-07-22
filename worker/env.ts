export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  ASSETS: Fetcher;
  ANON_SALT: string;
  FEATURE_AUTH: string;
}
