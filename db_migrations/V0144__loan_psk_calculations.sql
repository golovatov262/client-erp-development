CREATE TABLE IF NOT EXISTS loan_psk_calculations (
    loan_id INTEGER PRIMARY KEY REFERENCES loans(id),
    org_id INTEGER NOT NULL REFERENCES organizations(id),
    psk_percent NUMERIC(9,3) NOT NULL,
    psk_amount NUMERIC(15,2) NOT NULL,
    calculated_on DATE NOT NULL,
    principal NUMERIC(15,2) NOT NULL,
    annual_rate NUMERIC(7,3) NOT NULL,
    term_months INTEGER NOT NULL,
    schedule_type VARCHAR(20) NOT NULL,
    calculation_method TEXT NOT NULL,
    verification_status VARCHAR(24) NOT NULL CHECK (verification_status IN ('cross_checked','review')),
    verification_note TEXT NOT NULL,
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS idx_loan_psk_org_status ON loan_psk_calculations(org_id,verification_status);
