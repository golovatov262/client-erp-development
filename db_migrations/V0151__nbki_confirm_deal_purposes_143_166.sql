-- Current GUTDF 5.1 dictionary: 15 = household/current consumer needs;
-- 9 = refinancing debt to a creditor other than this lender.
-- The source deal/kind codes are the one-time migration from the supplied
-- historical report; purpose codes follow the operator's clarification.
INSERT INTO nbki_loan_terms_versions
    (loan_id,valid_from,deal_code,kind_code,purpose_code,basis)
SELECT l.id,l.start_date::timestamp AT TIME ZONE 'Europe/Moscow',
       '1','99','15','operator_consumer_purpose_20261029'
FROM loans l
WHERE l.id=143 AND l.org_id=2 AND l.contract_no='100-000000230092025'
  AND NOT EXISTS (SELECT 1 FROM nbki_loan_terms_versions v WHERE v.loan_id=l.id);

INSERT INTO nbki_loan_terms_versions
    (loan_id,valid_from,deal_code,kind_code,purpose_code,basis)
SELECT l.id,l.start_date::timestamp AT TIME ZONE 'Europe/Moscow',
       '1','14','9','operator_third_party_refinance_20261029'
FROM loans l
WHERE l.id=166 AND l.org_id=2 AND l.contract_no='100-000000311062026'
  AND NOT EXISTS (SELECT 1 FROM nbki_loan_terms_versions v WHERE v.loan_id=l.id);
