-- Reservations are replaced by recorded usage without losing the audit trail.
ALTER TABLE ledger_entries ADD COLUMN superseded_by TEXT;
