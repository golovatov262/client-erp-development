ALTER TABLE loans
    ADD COLUMN IF NOT EXISTS bki_enabled BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_loans_bki_enabled_status
    ON loans(org_id, status) WHERE bki_enabled IS TRUE;
