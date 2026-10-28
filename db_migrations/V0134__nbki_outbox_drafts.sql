CREATE TABLE IF NOT EXISTS nbki_outbox_drafts (
    id BIGSERIAL PRIMARY KEY,
    org_id INTEGER NOT NULL REFERENCES organizations(id),
    loan_id INTEGER NOT NULL REFERENCES loans(id),
    snapshot_sha256 CHAR(64) NOT NULL,
    snapshot JSONB NOT NULL,
    checks JSONB NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'blocked'
        CHECK (status IN ('blocked', 'draft')),
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (org_id, loan_id, snapshot_sha256)
);

CREATE INDEX IF NOT EXISTS idx_nbki_outbox_drafts_org_created
    ON nbki_outbox_drafts(org_id, created_at DESC);
