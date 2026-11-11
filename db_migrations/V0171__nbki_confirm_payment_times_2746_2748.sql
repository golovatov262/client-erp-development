-- Exact MSK times supplied by the owner on 2026-11-11.
-- Preserve payment dates, amounts, allocations and immutable posting snapshots.
DO $$
DECLARE item RECORD; changed INTEGER;
BEGIN
 FOR item IN SELECT * FROM (VALUES
   (2748,60,72,38000.00::numeric,TIMESTAMPTZ '2026-11-10 11:43:15+03'),
   (2747,53,71,20000.00::numeric,TIMESTAMPTZ '2026-11-10 12:10:18+03'),
   (2746,67,70,13000.00::numeric,TIMESTAMPTZ '2026-11-10 13:27:10+03')
 ) AS t(payment_id,loan_id,event_id,amount,occurred_at)
 LOOP
  UPDATE loan_payments p SET nbki_event_occurred_at=item.occurred_at,
    nbki_event_time_basis='operator_entered'
  FROM loans l WHERE p.id=item.payment_id AND p.loan_id=item.loan_id
    AND l.id=p.loan_id AND l.org_id=2 AND p.payment_date=DATE '2026-11-10'
    AND p.amount=item.amount
    AND ((p.nbki_event_occurred_at IS NULL AND p.nbki_event_time_basis IS NULL)
      OR (p.nbki_event_occurred_at=item.occurred_at AND p.nbki_event_time_basis='operator_entered'));
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>1 THEN RAISE EXCEPTION 'Unexpected payment state: %',item.payment_id; END IF;
  UPDATE nbki_crm_events SET event_occurred_at=item.occurred_at
  WHERE id=item.event_id AND org_id=2 AND loan_id=item.loan_id
    AND source_type='loan_payment' AND source_id=item.payment_id
    AND (event_occurred_at IS NULL OR event_occurred_at=item.occurred_at);
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>1 THEN RAISE EXCEPTION 'Unexpected event state: %',item.event_id; END IF;
 END LOOP;
END $$;
