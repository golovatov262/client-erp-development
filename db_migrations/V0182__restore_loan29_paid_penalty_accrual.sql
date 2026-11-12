-- Owner authorized on 2026-11-12: restore assessed penalties already paid,
-- so the remaining penalty is zero. This is an accounting correction, not
-- a new daily charge or a new payment. CRM collects penalties at final due.
DO $$
DECLARE
    before_row jsonb;
    after_row jsonb;
    paid numeric(14,2);
    assessed numeric(14,2);
BEGIN
    PERFORM id FROM loans
      WHERE id=29 AND org_id=2 AND contract_no='100-000048629102023' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Loan 29 identity changed'; END IF;
    IF EXISTS (SELECT 1 FROM audit_log WHERE action='penalty_accrual_correction'
        AND entity='loan' AND entity_id=29
        AND details::jsonb->>'correction_key'='loan29-paid-penalty-20261112') THEN
        RETURN;
    END IF;
    PERFORM id FROM loan_schedule WHERE loan_id=29 FOR UPDATE;
    PERFORM id FROM loan_payments WHERE loan_id=29 FOR UPDATE;
    SELECT COALESCE(SUM(penalty_amount),0) INTO assessed FROM loan_schedule WHERE loan_id=29;
    SELECT COALESCE(SUM(penalty_part),0) INTO paid FROM loan_payments WHERE loan_id=29;
    IF assessed <> 0.00 OR paid <> 362.49 THEN
        RAISE EXCEPTION 'Loan 29 penalty amounts changed: assessed %, paid %', assessed, paid;
    END IF;
    SELECT to_jsonb(s) INTO before_row FROM loan_schedule s
      WHERE id=141510 AND loan_id=29 AND payment_date=DATE '2030-10-31';
    IF before_row IS NULL THEN RAISE EXCEPTION 'Loan 29 final schedule row changed'; END IF;
    UPDATE loan_schedule SET penalty_amount=penalty_amount + (paid-assessed) WHERE id=141510;
    SELECT to_jsonb(s) INTO after_row FROM loan_schedule s WHERE id=141510;
    INSERT INTO audit_log(action,entity,entity_id,entity_label,details)
    VALUES ('penalty_accrual_correction','loan',29,'100-000048629102023',
        jsonb_build_object('correction_key','loan29-paid-penalty-20261112',
          'reason','Пользователь подтвердил доначисление уже оплаченных пеней до нулевого остатка 12.11.2026',
          'amount',paid-assessed,'assessed_before',assessed,'assessed_after',paid,
          'paid',paid,'remaining_after',0.00,'before',before_row,'after',after_row,
          'payments',(SELECT jsonb_agg(jsonb_build_object('id',p.id,'date',p.payment_date,'penalty',p.penalty_part) ORDER BY p.id)
                      FROM loan_payments p WHERE loan_id=29 AND penalty_part>0))::text);
END $$;
