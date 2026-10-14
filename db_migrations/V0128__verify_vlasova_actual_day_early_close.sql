-- Договор 300-000043726112025 (Власова О.С.): досрочное погашение
-- пересчитано по фактическим дням и закрыто 13.10.2026.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM loans WHERE id=134 AND contract_no='300-000043726112025'
          AND balance=0 AND status='closed' AND end_date=DATE '2026-10-13'
    ) THEN
        RAISE EXCEPTION 'Договор Власовой не соответствует проверенному досрочному закрытию';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM loan_payments WHERE id=2550 AND loan_id=134
          AND principal_part=38491.33 AND interest_part=2044.70
    ) OR NOT EXISTS (
        SELECT 1 FROM loan_payments WHERE id=2555 AND loan_id=134
          AND principal_part=149864.41 AND interest_part=135.59
    ) OR NOT EXISTS (
        SELECT 1 FROM loan_payments WHERE id=2557 AND loan_id=134
          AND principal_part=107.77 AND payment_type='early_full' AND source='adjustment'
    ) THEN
        RAISE EXCEPTION 'Платежи Власовой не соответствуют фактическому дневному расчёту';
    END IF;
END $$;
