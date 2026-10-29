CREATE TABLE IF NOT EXISTS approved_loan_schedule_replacements (
    id bigserial PRIMARY KEY,
    org_id integer NOT NULL REFERENCES organizations(id),
    loan_id integer NOT NULL REFERENCES loans(id),
    source_key text NOT NULL,
    source_note text NOT NULL,
    approved_plan jsonb NOT NULL,
    before_state jsonb NOT NULL,
    after_state jsonb NOT NULL DEFAULT '{}'::jsonb,
    applied_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (org_id, loan_id, source_key)
);
