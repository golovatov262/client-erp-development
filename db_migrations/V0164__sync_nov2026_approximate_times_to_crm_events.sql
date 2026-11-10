-- Make the V0163 approximate times visible in the native CRM event queue too.
-- Payment 2653 (loan 110) has no posting snapshot and never got an
-- nbki_crm_events row at all (same as the pre-v2-engine payments V0149
-- covered); the other 4 already have a 'new' row with event_occurred_at NULL.
DO $$
DECLARE changed_count INTEGER;
BEGIN
    INSERT INTO nbki_crm_events
        (org_id,loan_id,source_type,source_id,event_kind,event_occurred_at,
         evidence_sha256,status)
    SELECT l.org_id,p.loan_id,'loan_payment',p.id,'payment',
           p.nbki_event_occurred_at,s.evidence_sha256,'new'
    FROM loan_payments p
    JOIN loans l ON l.id=p.loan_id
    LEFT JOIN nbki_payment_posting_snapshots s
      ON s.payment_id=p.id AND s.loan_id=p.loan_id
    WHERE l.org_id=2
      AND p.id IN (2653,2738,2739,2744,2745)
      AND p.nbki_event_time_basis='operator_approximate'
      AND p.nbki_event_occurred_at IS NOT NULL
    ON CONFLICT (source_type,source_id) DO UPDATE SET
        event_occurred_at=EXCLUDED.event_occurred_at,
        evidence_sha256=COALESCE(EXCLUDED.evidence_sha256,nbki_crm_events.evidence_sha256)
    WHERE nbki_crm_events.event_occurred_at IS NULL;
    GET DIAGNOSTICS changed_count = ROW_COUNT;
    IF changed_count <> 5 THEN
        RAISE EXCEPTION 'Expected 5 approximate timestamps to enter NBKI event queue, got %', changed_count;
    END IF;
END $$;
