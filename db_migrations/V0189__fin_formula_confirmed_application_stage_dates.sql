-- Operator confirmed these stage dates on 2026-11-18. Preserve XML field order.
DO $$
DECLARE item record; loan integer; previous_block json; contract_date date;
BEGIN
 FOR item IN SELECT * FROM (VALUES
  ('300-000042629092025',DATE '2025-09-29'),
  ('300-000044610122025',DATE '2025-12-10')
 ) AS v(contract_no,stage_date)
 LOOP
  SELECT l.id,l.start_date,b.application_block INTO STRICT loan,contract_date,previous_block
  FROM loans l JOIN organizations o ON o.id=l.org_id
  JOIN nbki_loan_report_blocks b ON b.loan_id=l.id AND b.org_id=l.org_id
  WHERE o.inn='3666209530' AND l.contract_no=item.contract_no FOR UPDATE OF l,b;
  IF contract_date<>item.stage_date OR previous_block IS NULL THEN
   RAISE EXCEPTION 'Unexpected application data for %',item.contract_no;
  END IF;
  IF previous_block->>'stageDate' IS DISTINCT FROM item.stage_date::text THEN
   INSERT INTO nbki_application_date_corrections(loan_id,original_application_block,confirmed_contract_date,reason)
   VALUES(loan,previous_block,contract_date,'Дата стадии обращения подтверждена пользователем 18.11.2026')
   ON CONFLICT(loan_id) DO NOTHING;
   UPDATE nbki_loan_report_blocks SET application_block=(
    SELECT json_object_agg(k, CASE WHEN k='stageDate' THEN to_json(item.stage_date::text) ELSE v END ORDER BY ord)
    FROM json_each(previous_block) WITH ORDINALITY AS fields(k,v,ord)
   ) WHERE loan_id=loan;
   INSERT INTO audit_log(user_name,user_role,action,entity,entity_id,entity_label,details)
   VALUES('По поручению пользователя','admin','update','nbki_application_date',loan,item.contract_no,
    'Дата стадии обращения: '||item.stage_date::text||'; подтверждение пользователя 18.11.2026');
  END IF;
 END LOOP;
END $$;
