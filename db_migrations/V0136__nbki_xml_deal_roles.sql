ALTER TABLE nbki_deals
    ADD COLUMN IF NOT EXISTS deal_role VARCHAR(20) NOT NULL DEFAULT 'borrower'
    CHECK (deal_role IN ('borrower', 'guarantor'));

ALTER TABLE nbki_deals
    DROP CONSTRAINT IF EXISTS nbki_deals_match_status_check;

ALTER TABLE nbki_deals
    ADD CONSTRAINT nbki_deals_match_status_check
    CHECK (match_status IN ('unmatched', 'matched', 'review', 'not_in_crm', 'guarantor'));

UPDATE nbki_deals d
SET deal_role='guarantor', match_status='guarantor',
    match_reason='УИД поручителя: договор поручительства не является займом CRM',
    loan_id=NULL, updated_at=NOW()
FROM nbki_event_deals e
WHERE e.org_id=d.org_id AND e.uid=d.uid AND e.role='guarantor'
  AND d.deal_role<>'guarantor';
