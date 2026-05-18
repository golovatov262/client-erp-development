CREATE TABLE IF NOT EXISTS credit_checks (
    id BIGSERIAL PRIMARY KEY,
    member_id BIGINT NULL,
    upstream_check_id TEXT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    request_payload JSONB NULL,
    response_payload JSONB NULL,
    error_text TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_checks_member ON credit_checks(member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_checks_status ON credit_checks(status);
