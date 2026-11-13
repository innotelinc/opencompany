-- Firing is a soft delete: the person leaves the roster, but tasks, runs,
-- ledger entries and audit events that reference them stay intact.
ALTER TABLE employees ADD COLUMN terminated_at TEXT;
ALTER TABLE employees ADD COLUMN termination_reason TEXT;
