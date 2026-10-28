ALTER TABLE nbki_outbox_drafts
    DROP CONSTRAINT IF EXISTS nbki_outbox_drafts_status_check;

ALTER TABLE nbki_outbox_drafts
    ADD CONSTRAINT nbki_outbox_drafts_status_check
    CHECK (status IN ('blocked', 'draft', 'excluded'));

UPDATE nbki_outbox_drafts d
SET status='excluded'
FROM loans l
WHERE l.id=d.loan_id AND l.status='closed' AND d.status<>'excluded';
