CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('text', 'file')),
  content TEXT,
  filename TEXT,
  mimetype TEXT,
  size INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_items_created_at ON items(created_at DESC);

CREATE TABLE IF NOT EXISTS shares (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  password TEXT,
  max_views INTEGER,
  views INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER,
  note TEXT,
  auto_delete_item INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_shares_created_at ON shares(created_at DESC);
