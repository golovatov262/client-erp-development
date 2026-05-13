-- Сбросить статус заявки ЗЗ-000003 чтобы менеджер мог корректно одобрить через UI
UPDATE loan_applications 
SET status = 'in_review', member_id = NULL, created_loan_id = NULL, updated_at = NOW()
WHERE id = 3 AND application_no = 'ЗЗ-000003' AND created_loan_id IS NULL AND member_id IS NULL;