-- Published packages are validated from the request and written immediately.
-- Keep legacy records and their moderation state; no GitHub polling is needed.
ALTER TABLE projects ADD COLUMN publisher_token_hash TEXT;
ALTER TABLE projects ADD COLUMN publication_digest TEXT;
ALTER TABLE projects ADD COLUMN manifest_json TEXT;
