ALTER TABLE nbki_psk_manual_decisions DROP CONSTRAINT nbki_psk_manual_decisions_decision_check;
ALTER TABLE nbki_psk_manual_decisions ADD CONSTRAINT nbki_psk_manual_decisions_decision_check
    CHECK (decision IN ('override_origination_term', 'trust_crm_rate', 'trust_crm_value'));

-- Remaining 23 loans without a usable independent 1C PSK cross-check: either
-- the matched 1C event row has no cost block at all, the reported calculation
-- date/amount differs from CRM's current fields for reasons not individually
-- re-verified against primary documents (date offsets from -8 to +278 days,
-- amount gaps of varying size), or no 1C event matched the borrower's UID at
-- all (loan 191, a 0% loan). The user confirmed 10.11.2026 to trust the CRM
-- value for this whole batch rather than reconcile each contract individually.
INSERT INTO nbki_psk_manual_decisions
    (loan_id,org_id,decision,basis,note)
SELECT id,org_id,'trust_crm_value','operator_confirmation',
       'Пользователь подтвердил 10.11.2026: значения CRM принимаются как верные для всей '
       'оставшейся группы займов без надёжной независимой 1С-сверки (нет сопоставленного '
       'события, неполный блок ПСК в 1С, либо расхождение даты/суммы расчёта не проверено '
       'по первичным документам отдельно для каждого договора).'
FROM loans WHERE id IN (21,30,32,34,36,48,53,67,71,75,84,90,94,97,98,104,110,143,146,158,159,173,191)
  AND org_id=2
ON CONFLICT (loan_id) DO NOTHING;
