-- Договор 300-000000423012024 (Лозина К.А.): платежи за 05.10 и 06.10
-- перепроведены в хронологическом порядке движком v2.
-- Миграция фиксирует и проверяет результат ручного production-replay.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM loan_payments
        WHERE loan_id = 76 AND payment_date = DATE '2026-10-05'
          AND amount = 13250.00 AND interest_part = 13250.00
          AND principal_part = 0 AND penalty_part = 0
          AND source = 'bank' AND source_ref = 'bank_txn:660'
          AND engine_version = 'v2'
    ) OR NOT EXISTS (
        SELECT 1 FROM loan_payments
        WHERE loan_id = 76 AND payment_date = DATE '2026-10-06'
          AND amount = 1000.00 AND interest_part = 1000.00
          AND principal_part = 0 AND penalty_part = 0
          AND source = 'bank' AND source_ref = 'bank_txn:661'
          AND engine_version = 'v2'
    ) THEN
        RAISE EXCEPTION 'Платежи Лозиной за 05.10/06.10 не соответствуют проверенному v2-разнесению';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM loans
        WHERE id = 76 AND balance = 704216.00 AND status = 'overdue'
    ) THEN
        RAISE EXCEPTION 'Остаток или статус договора Лозиной изменился после v2-пересчёта';
    END IF;

    UPDATE loan_payments
    SET description = 'Авто из выписки 2026-10-05'
    WHERE loan_id = 76 AND source_ref = 'bank_txn:660';

    UPDATE loan_payments
    SET description = 'Авто из выписки 2026-10-06'
    WHERE loan_id = 76 AND source_ref = 'bank_txn:661';
END $$;
