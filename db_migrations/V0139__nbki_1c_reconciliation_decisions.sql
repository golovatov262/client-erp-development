-- Per-event operator choice. A later 1C event requires a new decision.
CREATE TABLE IF NOT EXISTS nbki_1c_reconciliation_decisions (
    id BIGSERIAL PRIMARY KEY,
    org_id INTEGER NOT NULL REFERENCES organizations(id),
    loan_id INTEGER NOT NULL REFERENCES loans(id),
    uid VARCHAR(100) NOT NULL,
    source_id BIGINT NOT NULL,
    source_row_num INTEGER NOT NULL,
    field VARCHAR(50) NOT NULL CHECK (field = 'last_payment'),
    choice VARCHAR(30) NOT NULL CHECK (choice = 'crm'),
    selected_payment_ids INTEGER[] NOT NULL,
    decision_source VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (source_id, source_row_num)
        REFERENCES nbki_event_rows(source_id, row_num),
    UNIQUE (org_id, loan_id, field, source_id, source_row_num),
    CHECK (cardinality(selected_payment_ids) > 0)
);
