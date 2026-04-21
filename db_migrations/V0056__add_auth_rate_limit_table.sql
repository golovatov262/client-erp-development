CREATE TABLE IF NOT EXISTS auth_rate_limit (
    id SERIAL PRIMARY KEY,
    key VARCHAR(100) NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 1,
    blocked_until TIMESTAMP,
    last_attempt_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_rate_limit_key ON auth_rate_limit(key);
CREATE INDEX IF NOT EXISTS idx_auth_rate_limit_blocked ON auth_rate_limit(blocked_until) WHERE blocked_until IS NOT NULL;

COMMENT ON TABLE auth_rate_limit IS 'Rate limiting for auth attempts (SMS, password login, staff login)';
COMMENT ON COLUMN auth_rate_limit.key IS 'ip:action or phone:action';
