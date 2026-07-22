CREATE TABLE archives (id TEXT PRIMARY KEY, label TEXT, flag TEXT, accent TEXT, count INTEGER, coord TEXT);
CREATE TABLE boards (id TEXT PRIMARY KEY, slug TEXT, name TEXT, desc TEXT, accent TEXT, icon TEXT, online INTEGER DEFAULT 0, thread_count INTEGER DEFAULT 0);
CREATE TABLE cases (slug TEXT PRIMARY KEY, name TEXT, archive TEXT, archive_label TEXT, accent TEXT, coord TEXT, lede TEXT, pull TEXT, pull_cite TEXT, status TEXT);
CREATE TABLE records (
  id TEXT PRIMARY KEY, archive TEXT REFERENCES archives(id), agency TEXT, agency_full TEXT,
  title TEXT, summary TEXT, incident_date TEXT, location TEXT, doc_date TEXT,
  kind TEXT CHECK(kind IN ('pdf','image','video')) DEFAULT 'pdf',
  redacted INTEGER DEFAULT 0, featured INTEGER DEFAULT 0, virin TEXT,
  source_url TEXT, source_site TEXT, retrieved_at TEXT, license TEXT,
  status TEXT CHECK(status IN ('pending','fetched','processed','live','failed')) DEFAULT 'live',
  checksum TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE INDEX idx_records_archive ON records(archive);
CREATE INDEX idx_records_kind ON records(kind);
CREATE TABLE assets (id INTEGER PRIMARY KEY AUTOINCREMENT, record_id TEXT REFERENCES records(id),
  role TEXT CHECK(role IN ('thumb','full','original')), r2_key TEXT, cdn_url TEXT, mime TEXT, width INTEGER, height INTEGER, bytes INTEGER);
CREATE INDEX idx_assets_record ON assets(record_id);
CREATE TABLE threads (
  id TEXT PRIMARY KEY, no INTEGER, board_id TEXT REFERENCES boards(id),
  title TEXT, stance TEXT, op_body TEXT, op_handle TEXT, op_id TEXT, tags TEXT,
  votes INTEGER DEFAULT 0, reply_count INTEGER DEFAULT 0, img_count INTEGER DEFAULT 0, mins INTEGER,
  source_record_id TEXT REFERENCES records(id), case_slug TEXT REFERENCES cases(slug),
  hot INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')));
CREATE INDEX idx_threads_board ON threads(board_id);
CREATE INDEX idx_threads_source ON threads(source_record_id);
CREATE INDEX idx_threads_case ON threads(case_slug);
CREATE TABLE posts (
  id TEXT PRIMARY KEY, no INTEGER, thread_id TEXT REFERENCES threads(id),
  body TEXT, handle TEXT, stance TEXT, votes INTEGER DEFAULT 0,
  source_record_id TEXT REFERENCES records(id), image_r2_key TEXT, image_kind TEXT, image_label TEXT,
  reply_to TEXT, is_op INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')));
CREATE INDEX idx_posts_thread ON posts(thread_id);
CREATE TABLE comments (
  id TEXT PRIMARY KEY, no INTEGER, record_id TEXT REFERENCES records(id),
  body TEXT, handle TEXT, stance TEXT, votes INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')));
CREATE INDEX idx_comments_record ON comments(record_id);
CREATE TABLE sightings (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, lat REAL, lng REAL, count INTEGER, accent TEXT, case_slug TEXT REFERENCES cases(slug));
CREATE TABLE users (id TEXT PRIMARY KEY, handle TEXT, email TEXT, google_sub TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE votes (id INTEGER PRIMARY KEY AUTOINCREMENT, actor_id TEXT, target_type TEXT CHECK(target_type IN ('thread','post','comment')), target_id TEXT, created_at TEXT DEFAULT (datetime('now')), UNIQUE(actor_id, target_type, target_id));
CREATE TABLE stats (id INTEGER PRIMARY KEY CHECK(id=1), json TEXT);
CREATE TABLE ticker (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT, board TEXT, text TEXT, ago TEXT, sort INTEGER);
