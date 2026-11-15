-- Real sign-in: one password per human member, and server-side sessions.
ALTER TABLE human_members ADD COLUMN password_hash TEXT;

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  human_member_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_member ON auth_sessions(human_member_id);

-- Failed sign-ins, so a password cannot be guessed at unbounded speed.
CREATE TABLE IF NOT EXISTS auth_attempts (
  id TEXT PRIMARY KEY,
  attempt_key TEXT NOT NULL,
  attempted_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_attempts_key ON auth_attempts(attempt_key, attempted_at);
