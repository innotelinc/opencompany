-- Decisions have to reach the owner when the tab is closed.
--
-- Two rows make that possible: when the owner was last seen in the console, and
-- a single-use link that approves exactly one decision from an email. The token
-- itself is never stored, only its hash (bound to the deployment's secret), so a
-- copy of the database cannot be used to mint one.

CREATE TABLE IF NOT EXISTS owner_presence (
  company_id TEXT NOT NULL,
  human_member_id TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  PRIMARY KEY (company_id, human_member_id)
);

CREATE TABLE IF NOT EXISTS approval_links (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  decision_id TEXT NOT NULL REFERENCES decisions(id),
  human_member_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  emailed_at TEXT,
  used_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_approval_links_decision ON approval_links(decision_id);
CREATE INDEX IF NOT EXISTS idx_approval_links_company ON approval_links(company_id, created_at);
