-- Explicit operator evidence for historical penalty dates; not new charges.
CREATE TABLE IF NOT EXISTS nbki_penalty_accrual_date_decisions (
    loan_id integer PRIMARY KEY REFERENCES loans(id),
    org_id integer NOT NULL REFERENCES organizations(id),
    accrued_on date NOT NULL,
    assessed_amount numeric(18,2) NOT NULL CHECK (assessed_amount >= 0),
    schedule_amounts jsonb NOT NULL,
    basis text NOT NULL,
    confirmed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
