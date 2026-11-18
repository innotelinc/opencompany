-- Ending a session here should also end it at the identity provider. That needs the
-- identity token the provider issued for this browser, so sign-out can hand it back.
ALTER TABLE auth_sessions ADD COLUMN id_token TEXT;
