-- OpenCompany initial schema (SQLite).
-- Every business row carries company_id; access is enforced server-side.
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  mission TEXT NOT NULL,
  operating_principles TEXT NOT NULL DEFAULT '',
  halted_at TEXT,
  halted_reason TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS human_members (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'owner',
  authority TEXT NOT NULL DEFAULT 'owner',
  created_at TEXT NOT NULL,
  UNIQUE (company_id, email)
);

CREATE TABLE IF NOT EXISTS departments (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  charter TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  UNIQUE (company_id, name)
);

CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  department_id TEXT REFERENCES departments(id),
  manager_id TEXT REFERENCES employees(id),
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  role_instructions TEXT NOT NULL,
  backend TEXT NOT NULL DEFAULT 'deterministic',
  model TEXT,
  status TEXT NOT NULL DEFAULT 'idle',
  paused INTEGER NOT NULL DEFAULT 0,
  concurrency_limit INTEGER NOT NULL DEFAULT 1,
  allowed_tools TEXT NOT NULL DEFAULT '[]',
  authority TEXT NOT NULL DEFAULT 'internal',
  spend_limit_cents INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_employees_company ON employees(company_id);

CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  created_by TEXT NOT NULL,
  budget_cents INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_goals_company ON goals(company_id);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  goal_id TEXT REFERENCES goals(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  manager_id TEXT REFERENCES employees(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_projects_company ON projects(company_id);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  project_id TEXT REFERENCES projects(id),
  parent_task_id TEXT REFERENCES tasks(id),
  review_of_task_id TEXT REFERENCES tasks(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'work',
  acceptance_criteria TEXT NOT NULL DEFAULT '[]',
  required_checks TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending',
  assignee_id TEXT REFERENCES employees(id),
  created_by_id TEXT REFERENCES employees(id),
  delegation_depth INTEGER NOT NULL DEFAULT 0,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 2,
  review_round INTEGER NOT NULL DEFAULT 0,
  max_review_rounds INTEGER NOT NULL DEFAULT 2,
  priority INTEGER NOT NULL DEFAULT 50,
  blocked_reason TEXT,
  cancel_requested INTEGER NOT NULL DEFAULT 0,
  idempotency_key TEXT,
  due_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_company_status ON tasks(company_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_idempotency
  ON tasks(company_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS task_dependencies (
  company_id TEXT NOT NULL,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  depends_on_task_id TEXT NOT NULL REFERENCES tasks(id),
  PRIMARY KEY (task_id, depends_on_task_id)
);

CREATE TABLE IF NOT EXISTS task_runs (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  task_id TEXT NOT NULL REFERENCES tasks(id),
  employee_id TEXT NOT NULL REFERENCES employees(id),
  attempt INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  mode TEXT NOT NULL DEFAULT 'simulated',
  worker_id TEXT,
  lease_expires_at TEXT,
  heartbeat_at TEXT,
  started_at TEXT,
  finished_at TEXT,
  summary TEXT,
  error TEXT,
  cancel_requested INTEGER NOT NULL DEFAULT 0,
  cost_estimate_cents INTEGER NOT NULL DEFAULT 0,
  tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE (task_id, attempt)
);
CREATE INDEX IF NOT EXISTS idx_runs_status ON task_runs(company_id, status);
CREATE INDEX IF NOT EXISTS idx_runs_lease ON task_runs(status, lease_expires_at);

CREATE TABLE IF NOT EXISTS run_events (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  run_id TEXT,
  task_id TEXT,
  employee_id TEXT,
  type TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_run_events_company ON run_events(company_id, created_at);

CREATE TABLE IF NOT EXISTS computers (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  employee_id TEXT NOT NULL UNIQUE REFERENCES employees(id),
  status TEXT NOT NULL DEFAULT 'stopped',
  workspace_path TEXT NOT NULL,
  browser_status TEXT NOT NULL DEFAULT 'not_configured',
  browser_profile_path TEXT,
  human_lock_by TEXT,
  human_lock_until TEXT,
  last_seen_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS deliverables (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  project_id TEXT REFERENCES projects(id),
  task_id TEXT REFERENCES tasks(id),
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'website',
  current_version INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS deliverable_versions (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  deliverable_id TEXT NOT NULL REFERENCES deliverables(id),
  version INTEGER NOT NULL,
  artifact_path TEXT NOT NULL,
  manifest TEXT NOT NULL DEFAULT '[]',
  entry_file TEXT NOT NULL DEFAULT 'index.html',
  notes TEXT NOT NULL DEFAULT '',
  checks TEXT NOT NULL DEFAULT '[]',
  checks_passed INTEGER NOT NULL DEFAULT 0,
  created_by_employee_id TEXT,
  run_id TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (deliverable_id, version)
);

CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  requested_by_employee_id TEXT REFERENCES employees(id),
  task_id TEXT REFERENCES tasks(id),
  project_id TEXT REFERENCES projects(id),
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  business_reason TEXT NOT NULL DEFAULT '',
  action_json TEXT NOT NULL,
  action_hash TEXT NOT NULL,
  risk TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'pending',
  decided_by TEXT,
  decided_at TEXT,
  resolution_note TEXT,
  invalidated_reason TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_decisions_company ON decisions(company_id, status);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  employee_id TEXT,
  task_id TEXT,
  run_id TEXT,
  kind TEXT NOT NULL,            -- estimated | recorded | verified_charge | revenue | expense
  category TEXT NOT NULL,        -- model | computer | external | other
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  description TEXT NOT NULL DEFAULT '',
  provider TEXT,
  provider_ref TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ledger_company ON ledger_entries(company_id, created_at);

CREATE TABLE IF NOT EXISTS policies (
  company_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (company_id, key)
);

CREATE TABLE IF NOT EXISTS knowledge_docs (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'document',
  body TEXT NOT NULL DEFAULT '',
  access_scope TEXT NOT NULL DEFAULT 'company',  -- company | department | private
  department_id TEXT,
  owner_employee_id TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_knowledge_company ON knowledge_docs(company_id);

CREATE TABLE IF NOT EXISTS knowledge_doc_versions (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  doc_id TEXT NOT NULL REFERENCES knowledge_docs(id),
  version INTEGER NOT NULL,
  body TEXT NOT NULL,
  edited_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (doc_id, version)
);

CREATE TABLE IF NOT EXISTS activity_events (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  actor_type TEXT NOT NULL,      -- human | employee | system
  actor_id TEXT,
  type TEXT NOT NULL,
  summary TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  task_id TEXT,
  project_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activity_company ON activity_events(company_id, created_at);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'ceo_operating',
  goal_id TEXT,
  title TEXT NOT NULL,
  body_md TEXT NOT NULL,
  metrics TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS external_actions (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  decision_id TEXT REFERENCES decisions(id),
  task_id TEXT,
  kind TEXT NOT NULL,            -- local_preview | email | public_deploy | ...
  target TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  action_hash TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'proposed', -- proposed|approved|executing|succeeded|failed|uncertain
  attempts INTEGER NOT NULL DEFAULT 0,
  result TEXT,
  claimed_by TEXT,
  claimed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (company_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS routines (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  name TEXT NOT NULL,
  instructions TEXT NOT NULL,
  assignee_id TEXT REFERENCES employees(id),
  interval_minutes INTEGER NOT NULL DEFAULT 1440,
  next_run_at TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_run_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS leases (
  name TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);
