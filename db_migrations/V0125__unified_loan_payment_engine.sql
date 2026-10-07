CREATE TABLE IF NOT EXISTS loan_payment_allocations (
    id BIGSERIAL PRIMARY KEY,
    payment_id INTEGER NOT NULL REFERENCES loan_payments(id) ON DELETE CASCADE,
    schedule_id INTEGER REFERENCES loan_schedule(id),
    component VARCHAR(24) NOT NULL CHECK (component IN ('interest','principal','penalty','early_principal','unapplied')),
    amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
    allocation_mode VARCHAR(16) NOT NULL DEFAULT 'automatic' CHECK (allocation_mode IN ('automatic','manual')),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loan_payment_allocations_payment ON loan_payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS idx_loan_payment_allocations_schedule ON loan_payment_allocations(schedule_id);

ALTER TABLE loan_payments ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'legacy';
ALTER TABLE loan_payments ADD COLUMN IF NOT EXISTS source_ref VARCHAR(160);
ALTER TABLE loan_payments ADD COLUMN IF NOT EXISTS engine_version VARCHAR(20) NOT NULL DEFAULT 'legacy';
CREATE UNIQUE INDEX IF NOT EXISTS uq_loan_payments_source_ref
    ON loan_payments(source, source_ref) WHERE source_ref IS NOT NULL;

INSERT INTO system_settings(key, value)
VALUES ('loan_payment_engine_effective_date', '2026-10-07')
ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW();
