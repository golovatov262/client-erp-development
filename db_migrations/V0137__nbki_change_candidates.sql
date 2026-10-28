CREATE TABLE IF NOT EXISTS nbki_change_candidates (
    id BIGSERIAL PRIMARY KEY,
    org_id INTEGER NOT NULL REFERENCES organizations(id),
    loan_id INTEGER NOT NULL REFERENCES loans(id),
    uid VARCHAR(100) NOT NULL,
    from_draft_id BIGINT NOT NULL REFERENCES nbki_outbox_drafts(id),
    to_draft_id BIGINT NOT NULL REFERENCES nbki_outbox_drafts(id),
    change_summary JSONB NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'pending_mapping'
        CHECK (status IN ('pending_mapping')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (org_id, loan_id, from_draft_id, to_draft_id),
    CHECK (from_draft_id <> to_draft_id)
);

CREATE INDEX IF NOT EXISTS idx_nbki_change_candidates_org_created
    ON nbki_change_candidates(org_id, created_at DESC);
