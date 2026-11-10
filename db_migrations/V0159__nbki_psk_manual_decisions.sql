CREATE TABLE IF NOT EXISTS nbki_psk_manual_decisions (
    loan_id INTEGER PRIMARY KEY REFERENCES loans(id),
    org_id INTEGER NOT NULL REFERENCES organizations(id),
    decision VARCHAR(30) NOT NULL CHECK (decision IN ('override_origination_term', 'trust_crm_rate')),
    override_term_months INTEGER,
    basis VARCHAR(32) NOT NULL,
    note TEXT NOT NULL,
    confirmed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CHECK (decision <> 'override_origination_term' OR override_term_months IS NOT NULL)
);

-- Loan 51: CRM creation audit (25.02.2026) recorded term=24 months; the current
-- term_months=25 reflects a later legitimate extension with no audit trail of
-- the edit itself. The live loan correctly uses 25 for today's schedule; for
-- the 2024-05-22 origination PSK it is the original 24 that reproduces the
-- historical 1C figure almost exactly (35.141% / 37288.92 vs 35.113% / 37288.87).
INSERT INTO nbki_psk_manual_decisions
    (loan_id,org_id,decision,override_term_months,basis,note)
SELECT id,org_id,'override_origination_term',24,'operator_confirmation',
       'Пользователь подтвердил 10.11.2026: срок продлён легитимно (реструктуризация) с 24 до 25 мес. '
       'без отдельной записи аудита. Для расчёта ПСК на дату выдачи используется исходный срок 24 мес.'
FROM loans WHERE id=51 AND org_id=2 AND contract_no='48601810000100-000000122052024'
ON CONFLICT (loan_id) DO NOTHING;

-- Loans 44, 60, 81: CRM rate was never edited since creation (confirmed via
-- audit_log), but the historical 1C PSK at origination implies ~17% rather
-- than the current 20/21/26.9%. The user confirmed 10.11.2026 to trust the
-- CRM rate as correct rather than the 1C historical figure for these loans.
INSERT INTO nbki_psk_manual_decisions
    (loan_id,org_id,decision,basis,note)
SELECT id,org_id,'trust_crm_rate','operator_confirmation',
       'Пользователь подтвердил 10.11.2026: текущая ставка CRM принимается как верная; '
       'расхождение с историческим расчётом 1С (~17%) не меняет учётную ставку займа.'
FROM loans WHERE id IN (44,60,81) AND org_id=2
ON CONFLICT (loan_id) DO NOTHING;
