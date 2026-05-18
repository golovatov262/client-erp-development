ALTER TABLE credit_checks
    ADD COLUMN IF NOT EXISTS idempotency_key TEXT NULL,
    ADD COLUMN IF NOT EXISTS callback_url TEXT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_credit_checks_idempotency ON credit_checks(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_credit_checks_upstream ON credit_checks(upstream_check_id) WHERE upstream_check_id IS NOT NULL;
