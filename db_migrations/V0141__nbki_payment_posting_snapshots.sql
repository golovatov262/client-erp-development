-- Immutable accounting evidence captured inside the payment transaction.
-- It is not a regulatory FL_25-28 debt statement.
CREATE TABLE IF NOT EXISTS nbki_payment_posting_snapshots (
    payment_id INTEGER PRIMARY KEY,
    loan_id INTEGER NOT NULL,
    payment_date DATE NOT NULL,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    evidence_sha256 CHAR(64) NOT NULL,
    evidence JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_nbki_payment_snapshots_loan_date
    ON nbki_payment_posting_snapshots(loan_id,payment_date,payment_id);
