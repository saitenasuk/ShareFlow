CREATE TABLE IF NOT EXISTS clips (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('text', 'file')),
  content TEXT,
  filename TEXT,
  mimetype TEXT,
  size INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_clips_created_at ON clips(created_at DESC);
