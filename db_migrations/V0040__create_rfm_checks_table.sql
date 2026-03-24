CREATE TABLE IF NOT EXISTS rfm_checks (
    id SERIAL PRIMARY KEY,
    check_date TIMESTAMP NOT NULL DEFAULT NOW(),
    total_members INTEGER NOT NULL DEFAULT 0,
    checked_count INTEGER NOT NULL DEFAULT 0,
    found_count INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'running',
    results JSONB DEFAULT '[]',
    started_by VARCHAR(200),
    completed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);