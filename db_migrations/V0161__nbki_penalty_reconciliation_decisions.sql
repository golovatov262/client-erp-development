CREATE TABLE IF NOT EXISTS nbki_penalty_reconciliation_decisions (
    loan_id INTEGER PRIMARY KEY REFERENCES loans(id),
    org_id INTEGER NOT NULL REFERENCES organizations(id),
    accepted_variance NUMERIC(10,2) NOT NULL CHECK (accepted_variance >= 0),
    basis VARCHAR(32) NOT NULL,
    note TEXT NOT NULL,
    confirmed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- Loan 110: paid penalty (214.64) exceeds schedule-assessed penalty (209.63)
-- by 5.01 rub. Traced to payment #1778 (29.03.2026, paid 179.04 vs 173.44
-- assessed at the time) and #2278 (30.07.2026, paid 35.60 vs 36.19 assessed),
-- both predating the V0147 daily-accrual ledger (29.10.2026). No schedule
-- replacement exists for this loan; today's penalty_amount is a recalculation
-- by the current engine, not a preserved historical charge. The operator
-- confirmed 10.11.2026 to accept this known historical-reconstruction gap.
INSERT INTO nbki_penalty_reconciliation_decisions (loan_id,org_id,accepted_variance,basis,note)
SELECT id,org_id,5.01,'operator_confirmation',
       'Пользователь подтвердил 10.11.2026: превышение оплаченной пени (214,64 ₽) над начисленной '
       'по графику (209,63 ₽) на 5,01 ₽ отнесено на известный пробел исторического начисления до '
       'миграции V0147 (движок пени до 29.10.2026 не вёл журнал начислений), не на ошибку данных.'
FROM loans WHERE id=110 AND org_id=2
ON CONFLICT (loan_id) DO NOTHING;
