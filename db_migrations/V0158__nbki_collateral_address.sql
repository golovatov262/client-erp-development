ALTER TABLE loan_collateral
    ADD COLUMN IF NOT EXISTS nbki_location_address TEXT;

CREATE TABLE IF NOT EXISTS nbki_collateral_autofill_audit (
    id BIGSERIAL PRIMARY KEY,
    collateral_id BIGINT NOT NULL UNIQUE,
    loan_id BIGINT NOT NULL,
    before_values JSONB NOT NULL,
    after_values JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Apply the organization-approved default mapping to active BKI pledge records.
-- Historical source XML is retained separately in nbki_collateral_facts.
INSERT INTO nbki_collateral_autofill_audit
    (collateral_id, loan_id, before_values, after_values)
SELECT lc.id, lc.loan_id,
       jsonb_build_object(
           'nbki_collateral_start', lc.nbki_collateral_start,
           'nbki_collateral_end', lc.nbki_collateral_end,
           'nbki_collateral_sum', lc.nbki_collateral_sum,
           'nbki_collateral_currency', lc.nbki_collateral_currency,
           'nbki_assess_date', lc.nbki_assess_date,
           'nbki_actual_cost', lc.nbki_actual_cost,
           'nbki_calc_date', lc.nbki_calc_date,
           'nbki_contract_total_sum', lc.nbki_contract_total_sum,
           'nbki_contract_count', lc.nbki_contract_count,
           'nbki_location_address', lc.nbki_location_address),
       jsonb_build_object(
           'nbki_collateral_start', l.start_date,
           'nbki_collateral_end', l.end_date,
           'nbki_collateral_sum', l.amount,
           'nbki_collateral_currency', 'RUB',
           'nbki_assess_date', l.start_date,
           'nbki_actual_cost', l.amount,
           'nbki_calc_date', l.start_date,
           'nbki_contract_total_sum', l.amount,
           'nbki_contract_count', 1,
           'nbki_location_address', CASE
               WHEN lc.collateral_type = 'Залог движимого имущества'
                   THEN COALESCE(NULLIF(lc.nbki_location_address, ''), NULLIF(m.registration_address, ''))
               WHEN lc.collateral_type = 'Залог недвижимого имущества'
                   THEN COALESCE(NULLIF(lc.nbki_location_address, ''), NULLIF(lc.description, ''))
               ELSE lc.nbki_location_address
           END)
FROM loan_collateral lc
JOIN loans l ON l.id = lc.loan_id
JOIN members m ON m.id = l.member_id
WHERE lc.collateral_type IN ('Залог недвижимого имущества', 'Залог движимого имущества')
  AND l.bki_enabled IS TRUE
  AND l.status IN ('active', 'overdue', 'holiday')
  AND l.start_date IS NOT NULL AND l.end_date IS NOT NULL AND l.amount IS NOT NULL
  AND (
      lc.nbki_collateral_start IS DISTINCT FROM l.start_date OR
      lc.nbki_collateral_end IS DISTINCT FROM l.end_date OR
      lc.nbki_collateral_sum IS DISTINCT FROM l.amount OR
      lc.nbki_collateral_currency IS DISTINCT FROM 'RUB' OR
      lc.nbki_assess_date IS DISTINCT FROM l.start_date OR
      lc.nbki_actual_cost IS DISTINCT FROM l.amount OR
      lc.nbki_calc_date IS DISTINCT FROM l.start_date OR
      lc.nbki_contract_total_sum IS DISTINCT FROM l.amount OR
      lc.nbki_contract_count IS DISTINCT FROM 1 OR
      (lc.collateral_type = 'Залог движимого имущества' AND lc.nbki_location_address IS NULL AND m.registration_address IS NOT NULL) OR
      (lc.collateral_type = 'Залог недвижимого имущества' AND lc.nbki_location_address IS NULL AND lc.description IS NOT NULL)
  )
ON CONFLICT (collateral_id) DO NOTHING;

UPDATE loan_collateral lc
SET nbki_collateral_start = l.start_date,
    nbki_collateral_end = l.end_date,
    nbki_collateral_sum = l.amount,
    nbki_collateral_currency = 'RUB',
    nbki_assess_date = l.start_date,
    nbki_actual_cost = l.amount,
    nbki_calc_date = l.start_date,
    nbki_contract_total_sum = l.amount,
    nbki_contract_count = 1,
    nbki_location_address = CASE
        WHEN lc.collateral_type = 'Залог движимого имущества'
            THEN COALESCE(NULLIF(lc.nbki_location_address, ''), NULLIF(m.registration_address, ''))
        WHEN lc.collateral_type = 'Залог недвижимого имущества'
            THEN COALESCE(NULLIF(lc.nbki_location_address, ''), NULLIF(lc.description, ''))
        ELSE lc.nbki_location_address
    END,
    updated_at = NOW()
FROM loans l
JOIN members m ON m.id = l.member_id
WHERE lc.loan_id = l.id
  AND lc.collateral_type IN ('Залог недвижимого имущества', 'Залог движимого имущества')
  AND l.bki_enabled IS TRUE
  AND l.status IN ('active', 'overdue', 'holiday')
  AND l.start_date IS NOT NULL
  AND l.end_date IS NOT NULL
  AND l.amount IS NOT NULL
  AND (
      lc.nbki_collateral_start IS DISTINCT FROM l.start_date OR
      lc.nbki_collateral_end IS DISTINCT FROM l.end_date OR
      lc.nbki_collateral_sum IS DISTINCT FROM l.amount OR
      lc.nbki_collateral_currency IS DISTINCT FROM 'RUB' OR
      lc.nbki_assess_date IS DISTINCT FROM l.start_date OR
      lc.nbki_actual_cost IS DISTINCT FROM l.amount OR
      lc.nbki_calc_date IS DISTINCT FROM l.start_date OR
      lc.nbki_contract_total_sum IS DISTINCT FROM l.amount OR
      lc.nbki_contract_count IS DISTINCT FROM 1 OR
      (lc.collateral_type = 'Залог движимого имущества' AND
       lc.nbki_location_address IS NULL AND m.registration_address IS NOT NULL) OR
      (lc.collateral_type = 'Залог недвижимого имущества' AND
       lc.nbki_location_address IS NULL AND lc.description IS NOT NULL)
  );
