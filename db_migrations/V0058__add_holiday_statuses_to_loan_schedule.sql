ALTER TABLE loan_schedule DROP CONSTRAINT IF EXISTS loan_schedule_status_check;
ALTER TABLE loan_schedule ADD CONSTRAINT loan_schedule_status_check
  CHECK (status IN ('pending', 'paid', 'partial', 'overdue', 'holiday', 'holiday_pending'));