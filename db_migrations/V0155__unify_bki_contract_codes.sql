-- The same loan must carry identical credit information to every bureau.
-- Preserve any NBKI entries from the short-lived per-bureau table, then
-- return to one shared set of codes per loan.
INSERT INTO nbki_loan_manual_fields
    (loan_id,org_id,deal_code,kind_code,purpose_code,payment_size_code,
     payment_schedule_code,note,updated_at)
SELECT loan_id,org_id,deal_code,kind_code,purpose_code,payment_size_code,
       payment_schedule_code,note,updated_at
FROM bureau_loan_fields WHERE bureau_code='NBKI'
ON CONFLICT (loan_id) DO NOTHING;

DROP TABLE bureau_loan_fields;
ALTER TABLE nbki_loan_manual_fields RENAME TO loan_bki_fields;
