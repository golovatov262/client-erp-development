-- Polling is shared by all Windows workers and survives restarts.
ALTER TABLE nbki_exchange_packages ADD COLUMN receipt_stage smallint NOT NULL DEFAULT 1 CHECK (receipt_stage IN (1,2,3));
ALTER TABLE nbki_exchange_packages ADD COLUMN receipt_next_poll_at timestamptz;
ALTER TABLE nbki_exchange_packages ADD COLUMN upload_started_at timestamptz;
UPDATE nbki_exchange_packages p SET receipt_stage=CASE WHEN status='completed' THEN 3 ELSE 2 END
WHERE status='completed' OR EXISTS (SELECT 1 FROM nbki_exchange_receipts r WHERE r.package_id=p.id AND r.evidence->>'receipt_kind'='1' AND r.evidence->>'receipt_status'='received');
