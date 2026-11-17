-- Explicit operator instruction: six historical UIDs, four reporting exclusions.
-- No accounting, payment dates or receipt acceptance is changed.
DO $$
DECLARE
    org integer;
    loan integer;
    old_uid text;
    enabled boolean;
    item record;
BEGIN
    SELECT id INTO STRICT org FROM organizations WHERE inn='3666209530' AND ogrn='1163668081895';
    FOR item IN SELECT * FROM (VALUES
        ('300-000000525012024','119bd715-bb5a-11ee-8cac-18c04d93e059-c'),
        ('300-000004717052024','e6bbd047-1354-11ef-8cb8-18c04d93e059-5'),
        ('300-000004822052024','e764943a-181e-11ef-8cb8-18c04d93e059-3'),
        ('300-000005020062023','0511da70-0f2c-11ee-8c99-18c04d93e059-6'),
        ('300-000020707082023','0f1f6339-34f6-11ee-8c9e-18c04d93e059-1'),
        ('300-000036808112023','6d08d2ab-7e3b-11ee-8ca6-18c04d93e059-1')
    ) AS v(contract_no,uid)
    LOOP
        SELECT id INTO STRICT loan FROM loans WHERE org_id=org AND contract_no=item.contract_no FOR UPDATE;
        SELECT loan_uid INTO old_uid FROM loan_bki_fields WHERE loan_id=loan;
        IF NULLIF(old_uid,'') IS NOT NULL AND old_uid<>item.uid THEN
            RAISE EXCEPTION 'Existing UID differs for %',item.contract_no;
        END IF;
        IF EXISTS (SELECT 1 FROM loan_bki_fields WHERE org_id=org AND loan_uid=item.uid AND loan_id<>loan)
           OR EXISTS (SELECT 1 FROM nbki_deals WHERE org_id=org AND uid=item.uid AND contract_no<>item.contract_no)
           OR EXISTS (SELECT 1 FROM nbki_event_deals WHERE org_id=org AND uid=item.uid AND contract_no<>item.contract_no) THEN
            RAISE EXCEPTION 'UID belongs to another contract: %',item.contract_no;
        END IF;
        INSERT INTO loan_bki_fields(loan_id,org_id,loan_uid,note)
        VALUES (loan,org,item.uid,'УИД предоставлен пользователем 17.11.2026')
        ON CONFLICT(loan_id) DO UPDATE SET loan_uid=EXCLUDED.loan_uid,updated_at=now();
        IF old_uid IS DISTINCT FROM item.uid THEN
            INSERT INTO audit_log(user_name,user_role,action,entity,entity_id,entity_label,details)
            VALUES ('По поручению пользователя','admin','update','loan_bki_fields',loan,item.contract_no,
                    'УИД предоставлен пользователем 17.11.2026: '||item.uid);
        END IF;
    END LOOP;
    FOR item IN SELECT * FROM (VALUES
        ('300-000007505072024'),('300-000018118122024'),
        ('300-000018218122024'),('300-000041805082025')
    ) AS v(contract_no)
    LOOP
        SELECT id,bki_enabled INTO STRICT loan,enabled FROM loans WHERE org_id=org AND contract_no=item.contract_no FOR UPDATE;
        UPDATE loans SET bki_enabled=false,updated_at=now() WHERE id=loan AND bki_enabled IS DISTINCT FROM false;
        UPDATE nbki_outbox_drafts SET status='excluded' WHERE loan_id=loan AND org_id=org AND status<>'excluded';
        IF enabled IS DISTINCT FROM false THEN
            INSERT INTO audit_log(user_name,user_role,action,entity,entity_id,entity_label,details)
            VALUES ('По поручению пользователя','admin','update','loan_bki_participation',loan,item.contract_no,
                    'Передача в БКИ отключена по прямому указанию пользователя 17.11.2026');
        END IF;
    END LOOP;
END $$;
