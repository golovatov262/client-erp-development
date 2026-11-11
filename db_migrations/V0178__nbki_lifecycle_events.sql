-- Separate legal termination from the accounting status (zero principal).
CREATE TABLE nbki_lifecycle_operations (
    id BIGSERIAL PRIMARY KEY,
    org_id BIGINT NOT NULL REFERENCES organizations(id),
    loan_id BIGINT NOT NULL REFERENCES loans(id),
    kind TEXT NOT NULL CHECK(kind IN ('close','terms_change','debt_change','collateral_change','guarantor_change','guarantor_debt_change')),
    occurred_at TIMESTAMPTZ NOT NULL,
    reason_code TEXT,
    collateral_reason_code TEXT,
    basis TEXT NOT NULL,
    snapshot JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX nbki_one_loan_closure ON nbki_lifecycle_operations(loan_id) WHERE kind='close';
ALTER TABLE nbki_crm_events ADD COLUMN event_payload JSONB;
ALTER TABLE nbki_crm_events ADD COLUMN event_name TEXT;
ALTER TABLE nbki_crm_events ADD COLUMN subject_uid TEXT;
ALTER TABLE nbki_crm_events ADD COLUMN operation_id BIGINT REFERENCES nbki_lifecycle_operations(id);
CREATE UNIQUE INDEX nbki_operation_subject_event ON nbki_crm_events(operation_id,subject_uid,event_name);
ALTER TABLE loan_collateral ADD COLUMN nbki_guarantor_member_id BIGINT REFERENCES members(id);
ALTER TABLE loan_collateral ADD COLUMN nbki_termination_date DATE;
ALTER TABLE loan_collateral ADD COLUMN nbki_termination_reason TEXT;
ALTER TABLE loan_collateral ADD COLUMN nbki_acquired BOOLEAN;
ALTER TABLE loan_collateral ADD COLUMN nbki_inhabited BOOLEAN;
ALTER TABLE loan_collateral ADD COLUMN nbki_insured BOOLEAN;
ALTER TABLE loan_collateral ADD COLUMN nbki_guarantee_contract_no TEXT;
ALTER TABLE loan_collateral ADD COLUMN nbki_guarantee_no_payments BOOLEAN;
CREATE TABLE nbki_event_payload_revisions (
    id BIGSERIAL PRIMARY KEY,
    event_id BIGINT NOT NULL REFERENCES nbki_crm_events(id),
    previous_payload JSONB NOT NULL,
    previous_sha256 CHAR(64) NOT NULL,
    revised_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE loan_collateral ADD COLUMN nbki_guarantee_no_debt BOOLEAN;
ALTER TABLE loan_collateral ADD COLUMN nbki_guarantor_accounting JSONB;
CREATE TABLE nbki_debt_scan_issues (
    loan_id BIGINT PRIMARY KEY REFERENCES loans(id),
    org_id BIGINT NOT NULL REFERENCES organizations(id),
    checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    reason TEXT NOT NULL
);
ALTER TABLE loan_collateral ADD COLUMN nbki_insurance_franchise BOOLEAN;
ALTER TABLE loan_collateral ADD COLUMN nbki_insurance_start DATE;
ALTER TABLE loan_collateral ADD COLUMN nbki_insurance_end DATE;
