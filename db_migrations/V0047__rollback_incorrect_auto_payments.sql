-- Откат некорректных автоматических разнесений из выписки 03.04.2026

-- 1. Восстанавливаем балансы займов (balance + principal_part обратно)
UPDATE loans SET balance = balance + 2971.92, status = 'active', updated_at = NOW() WHERE id = 85;
UPDATE loans SET balance = balance + 27126.99, status = 'active', updated_at = NOW() WHERE id = 15;
UPDATE loans SET balance = balance + 98752.95, status = 'active', updated_at = NOW() WHERE id = 35;

-- 2. Сбрасываем все периоды графика, которые были отмечены этими платежами
UPDATE loan_schedule SET paid_amount = 0, paid_date = NULL, status = 'pending', payment_id = NULL
WHERE payment_id IN (1821, 1822, 1823);

-- Восстанавливаем просроченные/частичные если были до автоматики
UPDATE loan_schedule SET status = 'overdue'
WHERE loan_id IN (15, 35, 85) AND status = 'pending' AND payment_date < '2026-04-04';

-- 3. Сбрасываем банковские транзакции — убираем привязку
UPDATE bank_transactions SET match_status = 'matched', payment_id = NULL
WHERE payment_id IN (1821, 1822, 1823);

-- 4. Обновляем выписку — обнуляем счётчики
UPDATE bank_statements SET matched_count = 0, unmatched_count = 0, transaction_count = 5 WHERE id = 1;