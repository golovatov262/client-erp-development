-- Explicit, event-scoped authorization when the prior delivery archive is unavailable.
-- This records an operator decision, never an NBKI acceptance.
CREATE TABLE nbki_initial_debt_snapshots (
    event_id BIGINT PRIMARY KEY REFERENCES nbki_crm_events(id),
    org_id BIGINT NOT NULL,
    subject_uid TEXT NOT NULL,
    event_at TIMESTAMPTZ NOT NULL,
    financial_state JSONB NOT NULL,
    basis TEXT NOT NULL CHECK (length(btrim(basis)) > 0),
    authorized_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(org_id,subject_uid)
);
