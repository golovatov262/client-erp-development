ALTER TABLE loans
  ADD COLUMN IF NOT EXISTS holiday_start DATE,
  ADD COLUMN IF NOT EXISTS holiday_months INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS holiday_end DATE;

ALTER TABLE loans DROP CONSTRAINT IF EXISTS loans_status_check;
ALTER TABLE loans ADD CONSTRAINT loans_status_check
  CHECK (status IN ('active', 'overdue', 'closed', 'holiday'));

COMMENT ON COLUMN loans.holiday_start IS 'Дата начала кредитных каникул';
COMMENT ON COLUMN loans.holiday_months IS 'Количество месяцев кредитных каникул (макс 12)';
COMMENT ON COLUMN loans.holiday_end IS 'Дата окончания кредитных каникул (holiday_start + holiday_months)';
