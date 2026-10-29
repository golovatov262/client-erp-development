-- Latest imported 1C event indicators, kept separate from CRM accounting.
-- Every value is traceable to the exact source file and row.
CREATE TABLE IF NOT EXISTS nbki_1c_loan_facts (
    loan_id INTEGER PRIMARY KEY REFERENCES loans(id),
    org_id INTEGER NOT NULL REFERENCES organizations(id),
    uid VARCHAR(100) NOT NULL,
    source_id BIGINT NOT NULL,
    source_row_num INTEGER NOT NULL,
    event_time TIMESTAMP NOT NULL,
    event_type VARCHAR(150) NOT NULL,
    indicators JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (source_id, source_row_num)
        REFERENCES nbki_event_rows(source_id, row_num),
    CHECK (jsonb_typeof(indicators) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_nbki_1c_loan_facts_org
    ON nbki_1c_loan_facts(org_id, event_time DESC);
