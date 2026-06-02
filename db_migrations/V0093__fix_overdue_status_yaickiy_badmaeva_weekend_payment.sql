-- Исправление статусов периодов 13 по займам 19 (Яицкий) и 118 (Бадмаева).
-- Срок платежа 31.05.2026 (воскресенье) → эффективная дата 01.06.2026 (понедельник).
-- Оба платежа поступили в срок (30.05 и 01.06 соответственно).
-- Пеня была начислена ошибочно и вручную обнулена менеджером.
-- Приводим paid_amount, penalty_amount и статус в соответствие с фактом.

-- Яицкий: платёж 16161.27 покрывает period полностью (p+i без пени)
UPDATE t_p25513958_client_erp_developme.loan_schedule
SET paid_amount   = 16161.27,
    penalty_amount = 0.00,
    status        = 'paid',
    overdue_days  = 0,
    paid_date     = DATE '2026-05-30'
WHERE id = 115260;

-- Бадмаева: платёж 27570.00 покрывает period полностью (p+i без пени)
UPDATE t_p25513958_client_erp_developme.loan_schedule
SET paid_amount   = 27570.00,
    penalty_amount = 0.00,
    status        = 'paid',
    overdue_days  = 0,
    paid_date     = DATE '2026-06-01'
WHERE id = 140307;

-- Восстанавливаем статус займов в active (нет реально просроченных периодов)
UPDATE t_p25513958_client_erp_developme.loans
SET status = 'active', updated_at = NOW()
WHERE id IN (19, 118) AND status = 'overdue';
