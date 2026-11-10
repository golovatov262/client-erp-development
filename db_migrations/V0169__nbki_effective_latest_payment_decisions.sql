-- Authorizes treating a specific payment as "effectively latest" for
-- split_latest_crm_debt/estimate_current_interest even though a later
-- payment exists on the loan, when that later payment is proven (by the
-- code, not assumed) to never touch any schedule row due on or before the
-- row nearest this event - i.e. nothing relevant to this event's debt/
-- interest split could have changed since it was posted.
CREATE TABLE IF NOT EXISTS nbki_effective_latest_payment_decisions (
    payment_id INTEGER PRIMARY KEY REFERENCES loan_payments(id),
    loan_id INTEGER NOT NULL REFERENCES loans(id),
    org_id INTEGER NOT NULL REFERENCES organizations(id),
    basis VARCHAR(64) NOT NULL,
    note TEXT NOT NULL,
    confirmed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- Payment 2652 (loan 63, 27.10.2026): the only later payment on this loan
-- (2745, 09.11.2026) allocates exclusively to schedule row 131394 (due
-- 30.11.2026), a strictly later installment than the one 2652 itself
-- touched (131393, due 31.10.2026); every row due before 2652 was already
-- 'paid' beforehand. The operator confirmed 10.11.2026 to treat 2652 as
-- effectively latest for this reconstruction.
INSERT INTO nbki_effective_latest_payment_decisions (payment_id,loan_id,org_id,basis,note)
SELECT 2652,63,org_id,'operator_confirmation',
       'Пользователь подтвердил 10.11.2026: единственный более поздний платёж (2745) '
       'относится к строго более поздней строке графика, чем сама операция 2652; '
       'ничего, относящегося к расчёту на 27.10.2026, не изменилось после неё.'
FROM loans WHERE id=63
ON CONFLICT (payment_id) DO NOTHING;
