-- Authorizes reconstructing a specific intermediate payment's before/after
-- principal balance from the immutable loan_payments ledger (instead of a
-- frozen posting snapshot) inside estimate_posting_snapshot_interest. This
-- never applies generically - only to payment IDs explicitly listed here,
-- each with its own evidence and basis.
CREATE TABLE IF NOT EXISTS nbki_payment_ledger_reconstruction_decisions (
    payment_id INTEGER PRIMARY KEY REFERENCES loan_payments(id),
    loan_id INTEGER NOT NULL REFERENCES loans(id),
    org_id INTEGER NOT NULL REFERENCES organizations(id),
    basis VARCHAR(64) NOT NULL,
    note TEXT NOT NULL,
    confirmed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- Payment 2604 (loan 28, 14.10.2026) is a v2-engine payment with an exact
-- ledger principal_part, but predates the posting-snapshot mechanism by
-- exactly one day (the earliest snapshot anywhere in the system is dated
-- 15.10.2026). The operator confirmed 10.11.2026 to reconstruct its
-- before/after balance from the payment ledger instead.
INSERT INTO nbki_payment_ledger_reconstruction_decisions (payment_id,loan_id,org_id,basis,note)
SELECT 2604,28,org_id,'operator_confirmation',
       'Пользователь подтвердил 10.11.2026: платёж 2604 на день раньше появления механизма '
       'снимков проводки (первый снимок в системе — 15.10.2026). Остаток ОД до/после '
       'восстанавливается суммой журнала платежей, а не снимком.'
FROM loans WHERE id=28
ON CONFLICT (payment_id) DO NOTHING;
