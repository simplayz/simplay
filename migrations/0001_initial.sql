CREATE TABLE sessions (
  id TEXT PRIMARY KEY NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE saves (
  session_id TEXT PRIMARY KEY NOT NULL REFERENCES sessions(id),
  snapshot TEXT,
  revision INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
