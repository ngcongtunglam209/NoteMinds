-- Only the extracted text is kept; the original file is discarded after processing.
CREATE TABLE documents (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'ready', 'failed')),
  error TEXT, -- ErrorCode when status = 'failed'
  text TEXT NOT NULL DEFAULT '',
  char_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX documents_user_created ON documents(user_id, created_at);

-- One row per accepted upload. Separate from documents so deleting a document
-- does not hand back daily quota.
CREATE TABLE upload_events (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX upload_events_user_created ON upload_events(user_id, created_at);
