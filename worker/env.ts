export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  ASSETS: Fetcher;
  ANON_SALT: string;
  FEATURE_AUTH: string;
  RATE_MAX?: string;
  RATE_WINDOW_SEC?: string;
  UPLOAD_BASE?: string; // public URL prefix for uploads/<name>; default same-origin /api/u/
  AI: Ai;
  VECTORIZE: Vectorize;
  FEATURE_ASK?: string; // off | hidden | on
  ASK_DAILY_MAX?: string;
  ASK_MIN_SCORE?: string;
  FEATURE_X?: string; // off | dry | on (Spec 4)
  X_DAILY_MAX?: string;
  X_MONTHLY_USD_CAP?: string;
  X_HIGHLIGHT_MIN_VOTES?: string;
  X_SINCE?: string; // "YYYY-MM-DD"; empty = no release posts
  X_API_KEY?: string; // secrets: OAuth 1.0a user context for the bot account
  X_API_SECRET?: string;
  X_ACCESS_TOKEN?: string;
  X_ACCESS_SECRET?: string;
}
