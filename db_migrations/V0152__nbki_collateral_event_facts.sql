-- Preserve the full 2.4 collateral facts from prior GUTDF files, separately
-- from CRM master data. The importer links only an unambiguous CRM contract
-- and collateral row; mismatching source identifiers remain visible as evidence.
CREATE TABLE IF NOT EXISTS nbki_collateral_facts (
    id BIGSERIAL PRIMARY KEY,
    source_file_id BIGINT NOT NULL REFERENCES nbki_source_files(id),
    org_id INTEGER NOT NULL REFERENCES organizations(id),
    loan_id INTEGER REFERENCES loans(id),
    collateral_id INTEGER REFERENCES loan_collateral(id) ON DELETE SET NULL,
    uid VARCHAR(100) NOT NULL,
    contract_no VARCHAR(100) NOT NULL,
    event_order INTEGER NOT NULL,
    event_time TIMESTAMPTZ,
    operation_code VARCHAR(20),
    property_id VARCHAR(200),
    collateral_code VARCHAR(30) NOT NULL,
    payload JSONB NOT NULL,
    match_status VARCHAR(20) NOT NULL
        CHECK (match_status IN ('matched','review','not_in_crm')),
    match_reason TEXT,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (source_file_id,event_order,property_id,collateral_code)
);

CREATE INDEX IF NOT EXISTS idx_nbki_collateral_facts_loan
    ON nbki_collateral_facts (loan_id,event_time DESC);

CREATE INDEX IF NOT EXISTS idx_nbki_collateral_facts_match
    ON nbki_collateral_facts (org_id,match_status,event_time DESC);
