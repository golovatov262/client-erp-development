-- Itemized errors from the Errors/Error block of both NBKI receipt types
-- (NotificationOfReceipt = envelope-level, NotificationOfAcceptance = per-
-- event). Previously only aggregate accepted/rejected counts were kept;
-- this is what a corrective file actually needs to know what to fix.
CREATE TABLE IF NOT EXISTS nbki_receipt_errors (
    id BIGSERIAL PRIMARY KEY,
    source_file_id BIGINT NOT NULL REFERENCES nbki_source_files(id) ON DELETE CASCADE,
    receipt_kind SMALLINT NOT NULL CHECK (receipt_kind IN (1, 2)),
    error_num INTEGER,
    event_date_time TIMESTAMPTZ,
    error_code VARCHAR(50),
    error_message TEXT,
    uid VARCHAR(100),
    order_num INTEGER,
    subject_code VARCHAR(50),
    subject_id VARCHAR(100),
    event_name VARCHAR(255),
    block_name VARCHAR(255),
    field_name VARCHAR(255),
    field_value TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS idx_nbki_receipt_errors_file ON nbki_receipt_errors(source_file_id, receipt_kind);
