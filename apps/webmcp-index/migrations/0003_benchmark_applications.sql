CREATE TABLE IF NOT EXISTS benchmark_applications (
  id TEXT PRIMARY KEY,
  payload_hash TEXT NOT NULL,
  team TEXT NOT NULL,
  email TEXT NOT NULL,
  target TEXT NOT NULL,
  goal TEXT NOT NULL,
  surface TEXT NOT NULL,
  tasks TEXT NOT NULL,
  locale TEXT NOT NULL,
  consent_version TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'new'
);
CREATE INDEX IF NOT EXISTS benchmark_applications_created ON benchmark_applications(created_at);
