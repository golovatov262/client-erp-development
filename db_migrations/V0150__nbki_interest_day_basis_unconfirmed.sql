-- Do not silently assert a day-count convention for historical contracts.
ALTER TABLE nbki_loan_terms_versions
    ALTER COLUMN interest_day_basis DROP DEFAULT,
    ALTER COLUMN interest_day_basis DROP NOT NULL;
