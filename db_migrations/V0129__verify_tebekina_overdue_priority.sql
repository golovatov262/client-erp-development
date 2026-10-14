-- Договор 300-000001004052026 (Тебекина Е.С.): платёж 12.10.2026
-- сначала закрыл просроченные проценты и ОД; остаток направлен досрочно в ОД.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM loans WHERE id=160 AND contract_no='300-000001004052026'
          AND balance=390969.23 AND status='active' AND monthly_payment=14252.20
    ) THEN
        RAISE EXCEPTION 'Договор Тебекиной не соответствует проверенному пересчёту';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM loan_payments WHERE id=2548 AND loan_id=160 AND amount=15000
          AND interest_part=9627.68 AND principal_part=5372.32 AND payment_type='early_partial'
    ) THEN
        RAISE EXCEPTION 'Платёж Тебекиной 2548 разнесён неверно';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM loan_schedule WHERE id=146662 AND status='paid'
          AND paid_amount=14480.04 AND overdue_days=12
    ) OR NOT EXISTS (
        SELECT 1 FROM loan_schedule WHERE id=146663 AND status='pending'
          AND paid_amount=0 AND overdue_days=0
    ) THEN
        RAISE EXCEPTION 'Статусы графика Тебекиной не соответствуют проверенному пересчёту';
    END IF;
END $$;
