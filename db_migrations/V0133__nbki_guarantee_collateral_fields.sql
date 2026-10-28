ALTER TABLE loan_collateral
    ADD COLUMN IF NOT EXISTS nbki_guarantee_uid VARCHAR(100),
    ADD COLUMN IF NOT EXISTS nbki_guarantee_amount NUMERIC(15,2),
    ADD COLUMN IF NOT EXISTS nbki_guarantee_currency VARCHAR(3),
    ADD COLUMN IF NOT EXISTS nbki_guarantee_start DATE,
    ADD COLUMN IF NOT EXISTS nbki_guarantee_end DATE,
    ADD COLUMN IF NOT EXISTS nbki_event_source_id BIGINT REFERENCES nbki_event_sources(id);

CREATE INDEX IF NOT EXISTS idx_loan_collateral_nbki_guarantee_uid
    ON loan_collateral(nbki_guarantee_uid)
    WHERE nbki_guarantee_uid IS NOT NULL;
