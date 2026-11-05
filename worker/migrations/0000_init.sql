-- Baseline schema. A fresh database is created by migrations alone. Existing
-- databases already have these tables; CREATE IF NOT EXISTS makes this a no-op.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS reactions (
  slug TEXT NOT NULL,
  type TEXT NOT NULL,
  voter TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (slug, type, voter)
);

CREATE INDEX IF NOT EXISTS reactions_slug_idx ON reactions (slug, type);
CREATE INDEX IF NOT EXISTS reactions_created_idx ON reactions (created_at);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  voter TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS comments_slug_status_idx ON comments (slug, status, created_at);
CREATE INDEX IF NOT EXISTS comments_status_idx ON comments (status, created_at);

CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'read', 'archived')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS submissions_created_idx ON submissions (created_at);

CREATE TABLE IF NOT EXISTS rebuild_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  voter TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS rebuild_requests_voter_idx ON rebuild_requests (voter, created_at);
