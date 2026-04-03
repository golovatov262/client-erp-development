CREATE TABLE bank_sync_log (
    id SERIAL PRIMARY KEY,
    started_at TIMESTAMP NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMP,
    source VARCHAR(20) NOT NULL DEFAULT 'email',
    status VARCHAR(20) NOT NULL DEFAULT 'running',
    emails_found INTEGER DEFAULT 0,
    statements_loaded INTEGER DEFAULT 0,
    transactions_total INTEGER DEFAULT 0,
    transactions_matched INTEGER DEFAULT 0,
    errors TEXT,
    details JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);