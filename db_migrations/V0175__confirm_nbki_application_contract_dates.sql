-- Owner confirmed on 2026-11-11: use CRM contract dates for these two
-- applications at stage 5 (contract concluded). Preserve JSON key order.
CREATE TABLE IF NOT EXISTS nbki_application_date_corrections (
    loan_id INTEGER PRIMARY KEY REFERENCES loans(id),
    original_application_block JSON NOT NULL,
    confirmed_contract_date DATE NOT NULL,
    reason TEXT NOT NULL,
    corrected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
DECLARE
    item RECORD;
    previous_block JSON;
    crm_date DATE;
BEGIN
    FOR item IN SELECT * FROM (VALUES
        (21, '100-000020825072023', DATE '2023-07-25', '2023-07-26'),
        (75, '100-000034901102024', DATE '2024-09-30', '2024-10-01')
    ) AS confirmed(loan_id, contract_no, contract_date, old_stage_date)
    LOOP
        SELECT l.start_date, b.application_block INTO crm_date, previous_block
        FROM loans l JOIN nbki_loan_report_blocks b ON b.loan_id=l.id
        WHERE l.id=item.loan_id AND l.org_id=2 AND b.org_id=2
          AND l.contract_no=item.contract_no
        FOR UPDATE OF l,b;
        IF NOT FOUND OR crm_date IS DISTINCT FROM item.contract_date
           OR previous_block->>'stageCode' IS DISTINCT FROM '5'
           OR previous_block->>'stageDate' IS DISTINCT FROM item.old_stage_date THEN
            RAISE EXCEPTION 'Unexpected application or contract data for loan %', item.loan_id;
        END IF;
        INSERT INTO nbki_application_date_corrections
            (loan_id,original_application_block,confirmed_contract_date,reason)
        VALUES (item.loan_id,previous_block,crm_date,
            'Owner confirmed CRM contract date for stage 5 on 2026-11-11');
        UPDATE nbki_loan_report_blocks SET application_block=(
            SELECT json_object_agg(k, CASE WHEN k='stageDate' THEN to_json(crm_date::text)
                                          ELSE v END ORDER BY ord)
            FROM json_each(previous_block) WITH ORDINALITY AS fields(k,v,ord)
        ) WHERE loan_id=item.loan_id;
    END LOOP;
END $$;
