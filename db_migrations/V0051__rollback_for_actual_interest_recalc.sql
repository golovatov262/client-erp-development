-- Откат платежей 1824-1826 для пересчёта с фактическими процентами

-- 1. Восстанавливаем балансы
UPDATE loans SET balance = balance + 3354.18, status = 'active', updated_at = NOW() WHERE id = 85;
UPDATE loans SET balance = balance + 66150.21, status = 'active', updated_at = NOW() WHERE id = 15;
UPDATE loans SET balance = balance + 494062.51, status = 'active', updated_at = NOW() WHERE id = 35;

-- 2. Сбрасываем периоды графика
UPDATE loan_schedule SET paid_amount = 0, paid_date = NULL, status = 'pending', payment_id = NULL
WHERE payment_id IN (1824, 1825, 1826);

UPDATE loan_schedule SET status = 'overdue'
WHERE loan_id IN (15, 35, 85) AND status = 'pending' AND payment_date < '2026-04-04';

-- 3. Обнуляем отменённые платежи
UPDATE loan_payments SET amount = 0.01, principal_part = 0, interest_part = 0, penalty_part = 0, description = 'ОТМЕНЕНО: пересчёт с факт. процентами' WHERE id IN (1824, 1825, 1826);

-- 4. Сбрасываем банковские транзакции
UPDATE bank_transactions SET match_status = 'pending', payment_id = NULL, matched_contract_no = NULL, matched_entity = NULL, matched_entity_id = NULL WHERE payment_id IN (1824, 1825, 1826);

-- 5. Обнуляем счётчики выписки
UPDATE bank_statements SET matched_count = 0, unmatched_count = 0 WHERE id = 1;