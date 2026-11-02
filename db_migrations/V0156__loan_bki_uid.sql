ALTER TABLE loan_bki_fields
    ADD COLUMN IF NOT EXISTS loan_uid VARCHAR(100);
