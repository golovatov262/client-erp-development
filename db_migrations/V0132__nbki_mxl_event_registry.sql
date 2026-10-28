CREATE TABLE IF NOT EXISTS nbki_event_sources (
    id BIGSERIAL PRIMARY KEY,
    org_id INTEGER NOT NULL REFERENCES organizations(id),
    file_sha256 CHAR(64) NOT NULL UNIQUE,
    original_name TEXT NOT NULL,
    raw_gzip BYTEA NOT NULL,
    row_count INTEGER NOT NULL,
    first_event_time TIMESTAMP NOT NULL,
    last_event_time TIMESTAMP NOT NULL,
    acceptance_basis VARCHAR(30) NOT NULL DEFAULT 'operator_assumed'
        CHECK (acceptance_basis IN ('operator_assumed')),
    imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nbki_event_deals (
    id BIGSERIAL PRIMARY KEY,
    org_id INTEGER NOT NULL REFERENCES organizations(id),
    uid VARCHAR(100) NOT NULL,
    contract_no VARCHAR(100) NOT NULL,
    nbki_contract_no VARCHAR(100) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('borrower', 'guarantor')),
    subject_name VARCHAR(500) NOT NULL,
    deal_date DATE,
    original_amount NUMERIC(15,2),
    loan_id INTEGER REFERENCES loans(id),
    match_status VARCHAR(30) NOT NULL CHECK (match_status IN ('matched', 'review', 'not_in_crm', 'guarantor')),
    match_reason TEXT,
    first_event_time TIMESTAMP NOT NULL,
    last_event_time TIMESTAMP NOT NULL,
    last_source_id BIGINT NOT NULL REFERENCES nbki_event_sources(id),
    assumed_accepted BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (org_id, uid)
);

CREATE INDEX IF NOT EXISTS idx_nbki_event_deals_contract ON nbki_event_deals(org_id, contract_no);
CREATE INDEX IF NOT EXISTS idx_nbki_event_deals_loan ON nbki_event_deals(loan_id);

CREATE TABLE IF NOT EXISTS nbki_event_rows (
    source_id BIGINT NOT NULL REFERENCES nbki_event_sources(id),
    row_num INTEGER NOT NULL,
    event_time TIMESTAMP NOT NULL,
    event_type VARCHAR(150) NOT NULL,
    role VARCHAR(20) NOT NULL,
    contract_no VARCHAR(100) NOT NULL,
    nbki_contract_no VARCHAR(100) NOT NULL,
    uid VARCHAR(100) NOT NULL,
    subject_name VARCHAR(500) NOT NULL,
    cells JSONB NOT NULL,
    PRIMARY KEY (source_id, row_num)
);

CREATE INDEX IF NOT EXISTS idx_nbki_event_rows_deal_time ON nbki_event_rows(uid, event_time);
