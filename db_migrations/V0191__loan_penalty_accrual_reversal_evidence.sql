-- Preserve erroneous accrual entries while explicitly reversing their effect.
ALTER TABLE loan_penalty_daily_accruals ADD COLUMN IF NOT EXISTS voided_at timestamptz;
ALTER TABLE loan_penalty_daily_accruals ADD COLUMN IF NOT EXISTS void_reason text;
