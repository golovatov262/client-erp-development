-- Снять статус overdue с договоров, у которых нет неоплаченных прошедших платежей
UPDATE loans SET status = 'active', updated_at = NOW()
WHERE id IN (91, 85, 130) AND status = 'overdue';

-- Сбросить overdue-статусы в графике (на случай если остались)
UPDATE loan_schedule SET status = 'pending', overdue_days = 0
WHERE loan_id IN (91, 85, 130) AND status = 'overdue';