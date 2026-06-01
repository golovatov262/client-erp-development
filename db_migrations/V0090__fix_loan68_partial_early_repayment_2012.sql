-- Исправление разнесения платежа 29.05.2026 (id=2012) по займу 68 (Виноградов):
-- платёж должен быть частичным досрочным погашением (проценты за факт. дни + всё в ОД),
-- а не плановым платежом за июнь.

-- 1. Корректное разнесение платежа
UPDATE t_p25513958_client_erp_developme.loan_payments
SET principal_part = 20359.51,
    interest_part = 2640.49,
    penalty_part = 0.00,
    description = COALESCE(description,'') 
WHERE id = 2012 AND loan_id = 68;

-- 2. Освобождаем период 6 (июнь) — он не должен был закрываться этим платежом
UPDATE t_p25513958_client_erp_developme.loan_schedule
SET paid_amount = 0,
    paid_date = NULL,
    status = 'pending',
    payment_id = NULL
WHERE loan_id = 68 AND payment_no = 6 AND payment_id = 2012;

-- 3. Пересчитываем остаток основного долга:
-- старый balance 306034.65 + вернули старый pp 16514.60 - новый pp 20359.51 = 302189.74
UPDATE t_p25513958_client_erp_developme.loans
SET balance = 302189.74,
    updated_at = NOW()
WHERE id = 68;
