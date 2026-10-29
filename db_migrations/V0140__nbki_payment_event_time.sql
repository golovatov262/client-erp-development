-- Event occurrence is distinct from CRM registration and XML generation.
-- Existing payments have no verified occurrence time; do not backfill them.
ALTER TABLE loan_payments
    ADD COLUMN IF NOT EXISTS nbki_recorded_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS nbki_event_occurred_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS nbki_event_time_basis VARCHAR(30);

ALTER TABLE loan_payments
    ADD CONSTRAINT chk_nbki_payment_event_time_basis
    CHECK ((nbki_event_occurred_at IS NULL AND nbki_event_time_basis IS NULL)
        OR (nbki_event_occurred_at IS NOT NULL AND nbki_event_time_basis = 'operator_entered'));
