-- Платежи из выписки за 06.10.2026 были загружены 07.10.2026, но попали
-- в legacy-движок из-за даты операции. По обоим займам имелась незакрытая
-- просрочка, поэтому вся сумма должна погашать проценты, а не основной долг.

DO $$
BEGIN
    -- Миграция идемпотентна и не трогает записи, если они уже исправлены.
    IF EXISTS (
        SELECT 1 FROM loan_payments
        WHERE id = 2503 AND engine_version = 'v2'
          AND interest_part = 1000.00 AND principal_part = 0
    ) AND EXISTS (
        SELECT 1 FROM loan_payments
        WHERE id = 2504 AND engine_version = 'v2'
          AND interest_part = 6200.00 AND principal_part = 0
    ) THEN
        RETURN;
    END IF;

    -- Прерываемся, если исходные суммы уже были изменены кем-то ещё.
    IF NOT EXISTS (
        SELECT 1 FROM loan_payments
        WHERE id = 2503 AND loan_id = 76 AND amount = 1000.00
          AND interest_part = 0 AND principal_part = 1000.00
          AND engine_version = 'legacy'
    ) OR NOT EXISTS (
        SELECT 1 FROM loan_payments
        WHERE id = 2504 AND loan_id = 106 AND amount = 6200.00
          AND interest_part = 3514.33 AND principal_part = 2685.67
          AND engine_version = 'legacy'
    ) THEN
        RAISE EXCEPTION 'Исходное разнесение платежей 2503/2504 изменилось; автокоррекция отменена';
    END IF;

    -- Восстанавливаем ОД, который legacy-движок ошибочно уменьшил.
    UPDATE loans SET balance = balance + 1000.00, updated_at = NOW() WHERE id = 76;
    UPDATE loans SET balance = balance + 2685.67, updated_at = NOW() WHERE id = 106;

    -- Займ 76: убираем 1000 руб. ОД из частично закрытого периода 21
    -- и переносим их на проценты периода 22.
    UPDATE loan_schedule
    SET paid_amount = 12798.94
    WHERE id = 84678 AND loan_id = 76 AND payment_no = 21;

    UPDATE loan_schedule
    SET paid_amount = 1000.00, paid_date = DATE '2026-10-06',
        payment_id = 2503, status = 'overdue'
    WHERE id = 84679 AND loan_id = 76 AND payment_no = 22;

    -- Займ 106: все 6200 руб. идут на проценты периодов 24 и 25.
    UPDATE loan_schedule
    SET paid_amount = 3232.45, paid_date = DATE '2026-10-06',
        payment_id = 2504, status = 'overdue'
    WHERE id = 145121 AND loan_id = 106 AND payment_no = 24;

    UPDATE loan_schedule
    SET paid_amount = 2967.55, paid_date = DATE '2026-10-06',
        payment_id = 2504, status = 'overdue'
    WHERE id = 145122 AND loan_id = 106 AND payment_no = 25;

    INSERT INTO loan_payment_allocations
        (payment_id, schedule_id, component, amount, allocation_mode)
    VALUES
        (2503, 84679, 'interest', 1000.00, 'automatic'),
        (2504, 145121, 'interest', 3232.45, 'automatic'),
        (2504, 145122, 'interest', 2967.55, 'automatic');

    UPDATE loan_payments
    SET principal_part = 0, interest_part = 1000.00, penalty_part = 0,
        source = 'bank', source_ref = 'bank_txn:661', engine_version = 'v2'
    WHERE id = 2503;

    UPDATE loan_payments
    SET principal_part = 0, interest_part = 6200.00, penalty_part = 0,
        source = 'bank', source_ref = 'bank_txn:662', engine_version = 'v2'
    WHERE id = 2504;
END $$;
