-- Owner explicitly confirmed that principal is original loan amount less
-- principal repaid in CRM. The restored schedule is not an alternative debt.
-- Record the decision without changing payments, balances, or interest.
DO $$
DECLARE principal numeric; current_balance numeric; state jsonb;
BEGIN
 PERFORM id FROM loans WHERE id=16 FOR UPDATE;
 SELECT l.amount-COALESCE(SUM(p.principal_part),0),l.balance
 INTO principal,current_balance FROM loans l
 LEFT JOIN loan_payments p ON p.loan_id=l.id
 WHERE l.id=16 AND l.org_id=2 AND l.contract_no='100-000000527012022'
 GROUP BY l.id;
 IF principal IS DISTINCT FROM 96772.08::numeric OR current_balance IS DISTINCT FROM principal
 THEN RAISE EXCEPTION 'Loan 16 principal changed; review owner confirmation before applying'; END IF;
 state := jsonb_build_object('loan_id',16,'payment_id',2730,
   'confirmed_principal',principal,'crm_balance',current_balance,
   'source','loans.amount - SUM(loan_payments.principal_part)',
   'scope','Principal after payment 2730; subsequent payments continue to reduce principal',
   'schedule_principal_is_authoritative',false);
 INSERT INTO loan_payment_correction_audit
 (correction_key,loan_id,payment_id,reason,before_state,after_state)
 VALUES ('loan16-owner-confirmed-ledger-principal-96772-08',16,2730,
   'Owner confirmed 96772.08 as sole authoritative principal after payment 2730; schedule difference does not increase borrower debt',
   state,state || jsonb_build_object('owner_confirmed',true));
END $$;
