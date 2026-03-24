CREATE TABLE member_checks (
    id SERIAL PRIMARY KEY,
    member_id INTEGER NOT NULL REFERENCES members(id),
    check_type VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    result JSONB DEFAULT '{}',
    comment TEXT DEFAULT '',
    checked_by_name VARCHAR(200) DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_member_checks_member_id ON member_checks(member_id);
CREATE INDEX idx_member_checks_type ON member_checks(check_type);