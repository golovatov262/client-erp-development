-- Снимаем статус 'holiday' с договоров, у которых каникулы уже закончились.
-- Если есть просроченные платежи в графике — статус 'overdue', иначе 'active'.
UPDATE loans
SET status = CASE
    WHEN EXISTS (
        SELECT 1 FROM loan_schedule s
        WHERE s.loan_id = loans.id
          AND s.status = 'overdue'
    ) THEN 'overdue'
    ELSE 'active'
END,
updated_at = NOW()
WHERE status = 'holiday'
  AND holiday_end IS NOT NULL
  AND holiday_end <= CURRENT_DATE;
