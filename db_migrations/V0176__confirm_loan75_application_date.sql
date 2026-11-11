-- Owner confirms application and contract date are both 2024-09-30.
-- V0175 retained the original complete application JSON in the audit table.
DO $$
DECLARE previous_block JSON;
BEGIN
    SELECT b.application_block INTO previous_block
    FROM nbki_loan_report_blocks b JOIN loans l ON l.id=b.loan_id
    WHERE l.id=75 AND l.org_id=2 AND b.org_id=2
      AND l.contract_no='100-000034901102024' AND l.start_date=DATE '2024-09-30'
    FOR UPDATE OF b,l;
    IF NOT FOUND OR previous_block->>'stageDate' IS DISTINCT FROM '2024-09-30'
       OR previous_block->>'applicationDate' IS DISTINCT FROM '2024-10-01'
       OR previous_block->>'stageCode' IS DISTINCT FROM '5' THEN
        RAISE EXCEPTION 'Unexpected application data for loan 75';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM nbki_application_date_corrections
                   WHERE loan_id=75 AND original_application_block->>'applicationDate'='2024-10-01') THEN
        RAISE EXCEPTION 'Original application backup missing for loan 75';
    END IF;
    UPDATE nbki_loan_report_blocks SET application_block=(
        SELECT json_object_agg(k, CASE WHEN k='applicationDate' THEN to_json('2024-09-30'::text)
                                      ELSE v END ORDER BY ord)
        FROM json_each(previous_block) WITH ORDINALITY AS fields(k,v,ord)
    ) WHERE loan_id=75;
    UPDATE nbki_application_date_corrections
    SET reason=reason || '; owner also confirmed application date 2024-09-30 on 2026-11-11'
    WHERE loan_id=75;
END $$;
