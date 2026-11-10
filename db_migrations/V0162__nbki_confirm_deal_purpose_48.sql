-- Loan 48: historical 1C reporting (9 events, May-Sep 2026) consistently used
-- purposeCode=17, a code retired from the current GUTDF 5.1 dictionary
-- (refLoanGoalType has no value 17) and already rejected by
-- scripts/nbki_seed_crm_deal_codes.py. The historical startDate (28.02.2024)
-- matches the contract number but predates CRM's current start_date
-- (01.05.2025), confirmed by the operator 10.11.2026 as a legitimate
-- refinancing/extension - CRM's current terms are authoritative. kindCode=99
-- (generic, collateral-compatible) is kept from history since the loan is
-- secured (КАМАЗ truck + trailer); only the retired purpose code is replaced
-- with 9 = refinancing debt to a creditor other than this lender.
INSERT INTO nbki_loan_terms_versions
    (loan_id,valid_from,deal_code,kind_code,purpose_code,basis)
SELECT l.id,l.start_date::timestamp AT TIME ZONE 'Europe/Moscow',
       '1','99','9','operator_third_party_refinance_20261110'
FROM loans l
WHERE l.id=48 AND l.org_id=2 AND l.contract_no='100-000006028022024'
  AND NOT EXISTS (SELECT 1 FROM nbki_loan_terms_versions v WHERE v.loan_id=l.id);
