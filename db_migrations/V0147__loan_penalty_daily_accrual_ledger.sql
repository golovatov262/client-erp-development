-- Forward-only evidence of actual daily CRM penalty accruals. No backfill:
-- historical schedule totals cannot establish their individual daily entries.
CREATE TABLE IF NOT EXISTS loan_penalty_daily_accruals (
    id bigserial PRIMARY KEY,
    loan_id integer NOT NULL REFERENCES loans(id),
    schedule_id integer NOT NULL,
    accrual_date date NOT NULL,
    effective_due_date date NOT NULL,
    principal_base numeric(18,2) NOT NULL CHECK (principal_base > 0),
    daily_rate numeric(12,9) NOT NULL CHECK (daily_rate > 0),
    amount numeric(18,2) NOT NULL CHECK (amount > 0),
    penalty_before numeric(18,2) NOT NULL,
    penalty_after numeric(18,2) NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (schedule_id, accrual_date),
    CHECK (penalty_after = penalty_before + amount)
);
CREATE INDEX IF NOT EXISTS idx_loan_penalty_daily_accruals_loan_date
    ON loan_penalty_daily_accruals (loan_id, accrual_date);
