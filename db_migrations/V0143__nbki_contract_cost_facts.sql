-- Contractual full cost sourced from the operator-provided 1C event register.
-- This is separate from loan accounting and is not export-approved by itself.
CREATE TABLE IF NOT EXISTS nbki_contract_cost_facts (
    loan_id INTEGER PRIMARY KEY REFERENCES loans(id),
    org_id INTEGER NOT NULL REFERENCES organizations(id),
    uid VARCHAR(100) NOT NULL,
    psk_percent NUMERIC(9,3) NOT NULL,
    psk_amount NUMERIC(15,2) NOT NULL,
    calculated_on DATE NOT NULL,
    source_loan_amount NUMERIC(15,2) NOT NULL,
    crm_loan_amount NUMERIC(15,2) NOT NULL,
    source_id BIGINT NOT NULL,
    source_row_num INTEGER NOT NULL,
    source_sha256 CHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL CHECK (status IN ('source_consistent','review')),
    imported_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    FOREIGN KEY (source_id, source_row_num)
        REFERENCES nbki_event_rows(source_id, row_num)
);

CREATE INDEX IF NOT EXISTS idx_nbki_contract_cost_facts_org_status
    ON nbki_contract_cost_facts(org_id,status);
