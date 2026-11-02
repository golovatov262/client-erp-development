-- Operator-entered NBKI details are kept apart from CRM accounting values
-- and immutable historical facts imported from submitted files.
CREATE TABLE IF NOT EXISTS nbki_loan_manual_fields (
    loan_id INTEGER PRIMARY KEY REFERENCES loans(id) ON DELETE CASCADE,
    org_id INTEGER NOT NULL REFERENCES organizations(id),
    deal_code VARCHAR(20),
    kind_code VARCHAR(20),
    purpose_code VARCHAR(20),
    payment_size_code VARCHAR(20),
    payment_schedule_code VARCHAR(20),
    note TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE loan_collateral
    ADD COLUMN IF NOT EXISTS nbki_collateral_code VARCHAR(30),
    ADD COLUMN IF NOT EXISTS nbki_collateral_start DATE,
    ADD COLUMN IF NOT EXISTS nbki_collateral_end DATE,
    ADD COLUMN IF NOT EXISTS nbki_collateral_sum NUMERIC(18,2),
    ADD COLUMN IF NOT EXISTS nbki_collateral_currency VARCHAR(3),
    ADD COLUMN IF NOT EXISTS nbki_assess_date DATE,
    ADD COLUMN IF NOT EXISTS nbki_price_code VARCHAR(20),
    ADD COLUMN IF NOT EXISTS nbki_actual_cost NUMERIC(18,2),
    ADD COLUMN IF NOT EXISTS nbki_calc_date DATE,
    ADD COLUMN IF NOT EXISTS nbki_actual_price_code VARCHAR(20),
    ADD COLUMN IF NOT EXISTS nbki_contract_total_sum NUMERIC(18,2),
    ADD COLUMN IF NOT EXISTS nbki_contract_count INTEGER,
    ADD COLUMN IF NOT EXISTS nbki_location VARCHAR(20);
