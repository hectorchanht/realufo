-- Dawn Studio Admin D1 schema (idempotent)
CREATE TABLE IF NOT EXISTS magic_tokens (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS manual_keys (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  label TEXT,
  app TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_magic_expires ON magic_tokens(expires_at);

CREATE TABLE IF NOT EXISTS spends_recurring (
  id TEXT PRIMARY KEY,
  vendor TEXT NOT NULL,
  amount REAL,
  currency TEXT,
  cadence TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  category TEXT,
  last_charged TEXT,
  next_renewal TEXT,
  notes TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS spends_oneoff (
  id TEXT PRIMARY KEY,
  spent_on TEXT,
  vendor TEXT NOT NULL,
  amount REAL,
  currency TEXT,
  category TEXT,
  subject TEXT,
  created_at INTEGER NOT NULL
);
