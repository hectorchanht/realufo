export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  ASSETS: Fetcher;
  ANON_SALT: string;
  ADMIN_TOKEN?: string; // secret; enables POST /__tick (scripts/publish.sh)
  RATE_MAX?: string;
  RATE_WINDOW_SEC?: string;
  API_RATE_MAX?: string; // public API v1: requests per window per IP (default 600)
  API_RATE_WINDOW_SEC?: string; // public API v1: window seconds (default 60)
  UPLOAD_BASE?: string; // public URL prefix for uploads/<name>; default same-origin /api/u/
  FILE_CDN_FALLBACK?: string; // local dev only (.dev.vars): R2 miss in /api/file redirects to the CDN copy
  AI: Ai;
  VECTORIZE: Vectorize;
  FEATURE_ASK?: string; // off | hidden | on
  ASK_DAILY_MAX?: string;
  ASK_MIN_SCORE?: string;
  FEATURE_X?: string; // off | dry | on (Spec 4)
  X_DAILY_MAX?: string;
  X_PICK_HOURS?: string; // UTC hours for daily picks, e.g. "15,18,21"; default "14"
  X_MONTHLY_USD_CAP?: string;
  X_HIGHLIGHT_MIN_VOTES?: string;
  X_SINCE?: string; // "YYYY-MM-DD"; empty = no release posts
  X_FORCE_SHOWCASE?: string; // record ID; with X_SHOWCASE_TEXT posts showcase/<archive>/<ID>.mp4 (/__tick only)
  X_SHOWCASE_TEXT?: string;
  X_FORCE_PICK?: string; // "ID[,ID]": post these records next, outside pick slots (scripts/publish.sh)
  X_POLLS?: string; // "on" = post story polls on X (Spec 9); anything else = off
  X_API_KEY?: string; // secrets: OAuth 1.0a user context for the bot account
  X_API_SECRET?: string;
  X_ACCESS_TOKEN?: string;
  X_ACCESS_SECRET?: string;
  // Social fan-out (Spec 5): each off | dry | on
  FEATURE_SOCIAL_FB?: string;
  FEATURE_SOCIAL_IG?: string;
  FEATURE_SOCIAL_THREADS?: string;
  FEATURE_SOCIAL_BSKY?: string;
  FEATURE_SOCIAL_YT?: string;
  FEATURE_SOCIAL_TIKTOK?: string;
  SOCIAL_SINCE?: string; // "YYYY-MM-DD"; x_posts created before it are never mirrored; empty = mirror nothing
  YT_DAILY_MAX?: string; // default "5" (Data API quota ≈ 6 uploads/day)
  TIKTOK_PRIVACY?: string; // SELF_ONLY until TikTok's audit passes, then PUBLIC_TO_EVERYONE
  META_PAGE_ID?: string; // secrets
  META_PAGE_TOKEN?: string;
  IG_USER_ID?: string;
  THREADS_USER_ID?: string;
  BSKY_HANDLE?: string;
  BSKY_APP_PASSWORD?: string;
  YT_CLIENT_ID?: string;
  YT_CLIENT_SECRET?: string;
  YT_REFRESH_TOKEN?: string;
  TIKTOK_CLIENT_KEY?: string;
  TIKTOK_CLIENT_SECRET?: string;
  FEATURE_PUSH?: string; // off | on (spec 2026-10-03-realufo-pwa-push-design)
  VAPID_PUBLIC_KEY?: string; // base64url uncompressed P-256 point (scripts/vapid-keys.mjs)
  VAPID_PRIVATE_KEY?: string; // secret: base64url private scalar `d`
  VAPID_SUBJECT?: string; // mailto: contact push services may use
  // Telegram admin center (spec 2026-10-04-realufo-telegram-gate-design)
  FEATURE_GATE?: string; // "on" = every post path waits for the owner's tap on Telegram
  FEATURE_SOCIAL_TG?: string; // off | dry | on: Telegram channel as a fan-out platform
  TELEGRAM_CHANNEL?: string; // channel chat id, e.g. "-1004320401355" (or "@username" once public)
  TELEGRAM_BOT_TOKEN?: string; // secrets
  TELEGRAM_WEBHOOK_SECRET?: string;
  TELEGRAM_OWNER_ID?: string;
  // Email alerts via Resend (spec: email alerts as notification)
  RESEND_API_KEY?: string; // secrets
  EMAIL_FROM?: string; // e.g. "RealUFO <alerts@realufo.org>"; default that
}
