-- Owner confirmed 02.11.2026 12:00:15 MSK. Manual accounting correction
-- already includes 15.46 penalty; restore its missing allocation only.
CREATE TABLE IF NOT EXISTS loan_payment_correction_audit (
 correction_key text PRIMARY KEY, loan_id integer NOT NULL, payment_id integer NOT NULL,
 reason text NOT NULL, before_state jsonb NOT NULL, after_state jsonb NOT NULL,
 corrected_at timestamptz NOT NULL DEFAULT clock_timestamp());
DO $$
DECLARE old_state jsonb; new_state jsonb; n integer;
BEGIN
 PERFORM id FROM loans WHERE id=16 FOR UPDATE;
 PERFORM id FROM loan_payments WHERE id=2730 FOR UPDATE;
 IF NOT EXISTS (SELECT 1 FROM loan_payments p JOIN loans l ON l.id=p.loan_id
   WHERE p.id=2730 AND p.loan_id=16 AND l.org_id=2
     AND p.payment_date=DATE '2026-11-02' AND p.amount=35000.00
     AND p.principal_part=33450.49 AND p.interest_part=1534.05 AND p.penalty_part=15.46)
 THEN RAISE EXCEPTION 'Payment 2730 changed'; END IF;
 SELECT jsonb_build_object(
   'payment',(SELECT to_jsonb(p) FROM loan_payments p WHERE id=2730),
   'event',(SELECT to_jsonb(e) FROM nbki_crm_events e WHERE id=36),
   'allocations',(SELECT jsonb_agg(a ORDER BY a.id) FROM loan_payment_allocations a WHERE payment_id=2730)) INTO old_state;
 IF EXISTS (SELECT 1 FROM loan_payment_allocations WHERE payment_id=2730 AND component='penalty')
 THEN RAISE EXCEPTION 'Penalty allocation already exists; review before applying'; END IF;
 IF (SELECT SUM(amount) FROM loan_payment_allocations WHERE payment_id=2730) <> 34984.54
 THEN RAISE EXCEPTION 'Payment 2730 allocations changed'; END IF;
 INSERT INTO loan_payment_allocations(payment_id,schedule_id,component,amount,allocation_mode)
 VALUES (2730,NULL,'penalty',15.46,'manual');
 UPDATE loan_payments SET nbki_event_occurred_at=TIMESTAMPTZ '2026-11-02 12:00:15+03',
   nbki_event_time_basis='operator_entered' WHERE id=2730;
 UPDATE nbki_crm_events SET event_occurred_at=TIMESTAMPTZ '2026-11-02 12:00:15+03'
 WHERE id=36 AND loan_id=16 AND source_type='loan_payment' AND source_id=2730;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN RAISE EXCEPTION 'Payment 2730 event changed'; END IF;
 SELECT jsonb_build_object(
   'payment',(SELECT to_jsonb(p) FROM loan_payments p WHERE id=2730),
   'event',(SELECT to_jsonb(e) FROM nbki_crm_events e WHERE id=36),
   'allocations',(SELECT jsonb_agg(a ORDER BY a.id) FROM loan_payment_allocations a WHERE payment_id=2730)) INTO new_state;
 INSERT INTO loan_payment_correction_audit(correction_key,loan_id,payment_id,reason,before_state,after_state)
 VALUES ('nbki-2730-confirmed-time-and-penalty',16,2730,
   'Owner confirmed event date/time; reconcile missing penalty allocation to existing manually corrected payment, without changing loan or schedule amounts',old_state,new_state);
END $$;
