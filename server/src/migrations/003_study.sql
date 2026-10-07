-- AI study artifacts: one row per document and kind; no row means 'none'.
-- payload survives a failed or cancelled regeneration so the learner keeps the last good version.
CREATE TABLE artifacts (
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('summary', 'mindmap', 'flashcards', 'quiz')),
  status TEXT NOT NULL CHECK (status IN ('generating', 'ready', 'failed')),
  error TEXT, -- ErrorCode when status = 'failed'
  payload TEXT, -- JSON: Summary | Mindmap | FlashcardDeck | Quiz
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (document_id, kind)
);

-- One reviewable card per flashcard, with its SM-2 state. Replaced when flashcards are regenerated.
CREATE TABLE cards (
  id INTEGER PRIMARY KEY,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  tag TEXT,
  ease REAL NOT NULL,
  interval_days INTEGER NOT NULL,
  reps INTEGER NOT NULL,
  due_at TEXT NOT NULL -- ISO timestamp, compared as text against new Date().toISOString()
);

CREATE INDEX cards_document_due ON cards(document_id, due_at);

-- Cleared when the quiz is regenerated: answers index into the quiz they were given for.
CREATE TABLE quiz_attempts (
  id INTEGER PRIMARY KEY,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  answers TEXT NOT NULL, -- JSON array: chosen option index per question, null when skipped
  score INTEGER NOT NULL,
  total INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX quiz_attempts_document ON quiz_attempts(document_id, created_at);

CREATE TABLE chat_messages (
  id INTEGER PRIMARY KEY,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX chat_messages_document ON chat_messages(document_id, id);

-- One row per question asked, for the daily chat quota. Keyed by user (like upload_events) so
-- deleting a document or its history does not hand back quota.
CREATE TABLE chat_events (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX chat_events_user_created ON chat_events(user_id, created_at);
