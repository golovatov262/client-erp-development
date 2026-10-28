CREATE TABLE IF NOT EXISTS nbki_source_files (
    id BIGSERIAL PRIMARY KEY,
    org_id INTEGER NOT NULL REFERENCES organizations(id),
    source_id VARCHAR(20) NOT NULL,
    reg_number VARCHAR(80) NOT NULL UNIQUE,
    schema_version VARCHAR(10) NOT NULL,
    document_time TIMESTAMPTZ,
    xml_sha256 CHAR(64) NOT NULL,
    xml_gzip BYTEA NOT NULL,
    subjects_count INTEGER NOT NULL,
    events_count INTEGER NOT NULL,
    receipt_status VARCHAR(20) NOT NULL DEFAULT 'unknown'
        CHECK (receipt_status IN ('unknown', 'received', 'accepted', 'partial', 'rejected')),
    events_accepted INTEGER,
    events_rejected INTEGER,
    receipt_signature_verified BOOLEAN NOT NULL DEFAULT FALSE,
    receipt_time TIMESTAMPTZ,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (subjects_count >= 0 AND events_count >= 0)
);

CREATE TABLE IF NOT EXISTS nbki_deals (
    id BIGSERIAL PRIMARY KEY,
    org_id INTEGER NOT NULL REFERENCES organizations(id),
    uid VARCHAR(100) NOT NULL,
    contract_no VARCHAR(100) NOT NULL,
    subject_type VARCHAR(2) NOT NULL CHECK (subject_type IN ('FL', 'UL')),
    subject_name VARCHAR(500),
    subject_inn VARCHAR(12),
    birth_date DATE,
    deal_date DATE,
    original_amount NUMERIC(15,2),
    currency VARCHAR(3),
    deal_code VARCHAR(20),
    kind_code VARCHAR(20),
    purpose_code VARCHAR(20),
    last_event_time TIMESTAMPTZ,
    last_source_file_id BIGINT REFERENCES nbki_source_files(id),
    loan_id INTEGER UNIQUE REFERENCES loans(id),
    match_status VARCHAR(30) NOT NULL DEFAULT 'unmatched'
        CHECK (match_status IN ('unmatched', 'matched', 'review', 'not_in_crm')),
    match_reason TEXT,
    reported_accepted BOOLEAN NOT NULL DEFAULT FALSE,
    accepted_file_id BIGINT REFERENCES nbki_source_files(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (org_id, uid)
);

CREATE INDEX IF NOT EXISTS idx_nbki_deals_org_contract ON nbki_deals(org_id, contract_no);
CREATE INDEX IF NOT EXISTS idx_nbki_deals_match ON nbki_deals(org_id, match_status);

CREATE TABLE IF NOT EXISTS nbki_file_deals (
    source_file_id BIGINT NOT NULL REFERENCES nbki_source_files(id),
    deal_id BIGINT NOT NULL REFERENCES nbki_deals(id),
    event_count INTEGER NOT NULL,
    last_event_time TIMESTAMPTZ,
    PRIMARY KEY (source_file_id, deal_id)
);

CREATE TABLE IF NOT EXISTS nbki_file_events (
    source_file_id BIGINT NOT NULL REFERENCES nbki_source_files(id),
    order_num INTEGER NOT NULL,
    deal_id BIGINT REFERENCES nbki_deals(id),
    event_name VARCHAR(60) NOT NULL,
    event_time TIMESTAMPTZ,
    operation_code VARCHAR(20),
    reported_accepted BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (source_file_id, order_num)
);

CREATE INDEX IF NOT EXISTS idx_nbki_file_events_deal_time
    ON nbki_file_events(deal_id, event_time);
