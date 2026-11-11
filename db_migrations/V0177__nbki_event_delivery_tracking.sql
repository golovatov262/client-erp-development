ALTER TABLE nbki_file_events ADD COLUMN IF NOT EXISTS crm_event_id BIGINT REFERENCES nbki_crm_events(id);
ALTER TABLE nbki_file_events ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (delivery_status IN ('pending','accepted','rejected'));
CREATE INDEX IF NOT EXISTS idx_nbki_file_events_crm ON nbki_file_events(crm_event_id);
CREATE TABLE IF NOT EXISTS nbki_receipt_uploads (
    id BIGSERIAL PRIMARY KEY,
    source_file_id BIGINT NOT NULL REFERENCES nbki_source_files(id),
    sha256 CHAR(64) NOT NULL,
    receipt_kind INTEGER NOT NULL CHECK (receipt_kind IN (1,2)),
    payload BYTEA NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(source_file_id,sha256)
);

ALTER TABLE nbki_file_events ADD COLUMN IF NOT EXISTS source_uid TEXT;
ALTER TABLE nbki_file_events ADD COLUMN IF NOT EXISTS source_contract_no TEXT;
