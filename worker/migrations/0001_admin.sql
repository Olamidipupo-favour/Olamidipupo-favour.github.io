-- Admin dashboard support.
-- Rebuild comments so the status CHECK accepts 'spam' and the moderation
-- columns exist. Existing rows are copied as-is; voter is already a salted
-- IP hash, so it is safe to seed ip_hash from it.

PRAGMA foreign_keys = OFF;

CREATE TABLE comments_admin_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'spam')),
  voter TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  spam_score REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO comments_admin_new
  (id, slug, name, body, status, voter, ip_hash, spam_score, created_at, updated_at)
SELECT
  id, slug, name, body, status, voter, voter, 0, created_at, created_at
FROM comments;

DROP TABLE comments;
ALTER TABLE comments_admin_new RENAME TO comments;

CREATE INDEX IF NOT EXISTS comments_slug_status_idx ON comments (slug, status, created_at);
CREATE INDEX IF NOT EXISTS comments_status_idx ON comments (status, created_at);
CREATE INDEX IF NOT EXISTS comments_ip_hash_idx ON comments (ip_hash, created_at);

PRAGMA foreign_keys = ON;

ALTER TABLE submissions ADD COLUMN read_at TEXT;
ALTER TABLE submissions ADD COLUMN archived_at TEXT;

CREATE INDEX IF NOT EXISTS submissions_read_idx ON submissions (read_at, archived_at, created_at);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS audit_log_created_idx ON audit_log (created_at);

CREATE TABLE IF NOT EXISTS blocklist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('word', 'ip_hash')),
  value TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (type, value)
);

CREATE INDEX IF NOT EXISTS blocklist_lookup_idx ON blocklist (type, value);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO app_settings (key, value) VALUES ('comment_auto_approve', 'off');

CREATE TABLE IF NOT EXISTS admin_rate_limits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  voter TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS admin_rate_limits_voter_idx ON admin_rate_limits (voter, created_at);
