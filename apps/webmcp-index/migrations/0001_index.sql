CREATE TABLE projects (
  key TEXT PRIMARY KEY,
  repository TEXT NOT NULL COLLATE NOCASE,
  manifest_path TEXT NOT NULL,
  repository_id INTEGER,
  entry_id TEXT,
  entry_json TEXT,
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','indexed','failed','duplicate')),
  canonical_key TEXT,
  error TEXT,
  failures INTEGER NOT NULL DEFAULT 0,
  checked_at INTEGER,
  next_check INTEGER NOT NULL DEFAULT 0,
  lease_until INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  UNIQUE(repository, manifest_path),
  UNIQUE(repository_id, manifest_path)
);
CREATE INDEX projects_due ON projects(enabled, next_check, lease_until);
CREATE TABLE discovery (id INTEGER PRIMARY KEY CHECK(id = 1), page INTEGER NOT NULL DEFAULT 1, next_check INTEGER NOT NULL DEFAULT 0);
INSERT INTO discovery(id) VALUES(1);
-- Existing NGA listing is a bootstrap candidate; the service verifies it before publishing.
INSERT INTO projects(key, repository, manifest_path, repository_id, entry_id, created_at)
VALUES('nga-forums-webmcp', 'https://github.com/jo32/nga-forums-webmcp', 'webmcp.json', 1365304362, 'nga-forums-webmcp', 0);
CREATE TABLE github_budget (id INTEGER PRIMARY KEY CHECK(id = 1), hour INTEGER NOT NULL DEFAULT 0, used INTEGER NOT NULL DEFAULT 0);
INSERT INTO github_budget(id) VALUES(1);
