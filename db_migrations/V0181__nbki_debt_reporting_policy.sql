CREATE TABLE nbki_debt_reporting_triggers (
 id BIGSERIAL PRIMARY KEY,
 loan_id BIGINT NOT NULL REFERENCES loans(id),
 event_id BIGINT UNIQUE REFERENCES nbki_crm_events(id),
 following_event_id BIGINT REFERENCES nbki_crm_events(id),
 trigger_key TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('payment_accrual','due_accrual','payment_due','overdue','periodic')),
 trigger_date DATE NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(loan_id,trigger_key)
);
CREATE TABLE nbki_debt_reporting_observations (
 loan_id BIGINT PRIMARY KEY REFERENCES loans(id),
 observed_on DATE NOT NULL,
 state JSONB NOT NULL,
 observed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
