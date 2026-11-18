-- User confirmed on 2026-11-18 that these 25 card saves were metadata
-- corrections, not changes to collateral. Preserve operations and evidence.
DO $$
DECLARE affected integer;
BEGIN
    IF EXISTS (SELECT 1 FROM nbki_crm_events e WHERE e.org_id=3 AND e.id BETWEEN 928 AND 952
        AND (EXISTS (SELECT 1 FROM nbki_file_events f WHERE f.crm_event_id=e.id)
          OR EXISTS (SELECT 1 FROM nbki_exchange_packages p WHERE e.id=ANY(p.event_ids)))) THEN
        RAISE EXCEPTION 'Metadata events already included in an export; review required';
    END IF;
    WITH changed AS (
        UPDATE nbki_crm_events e SET status='excluded'
        FROM nbki_lifecycle_operations o, organizations org
        WHERE e.org_id=org.id AND org.inn='3666209530' AND e.org_id=3
          AND e.id BETWEEN 928 AND 952 AND e.operation_id=o.id
          AND o.org_id=e.org_id AND o.kind='collateral_change'
          AND o.basis='Изменение карточки обеспечения CRM'
          AND e.event_kind='collateral_change' AND e.status<>'excluded'
        RETURNING e.id,e.loan_id
    )
    INSERT INTO audit_log(user_name,user_role,action,entity,entity_id,entity_label,details)
    SELECT 'По поручению пользователя','admin','update','nbki_crm_event',id,
           'Уточнение реквизитов обеспечения',
           'Исключено: пользователь подтвердил отсутствие фактического изменения залога; сохранены операция и снимок.'
    FROM changed;
    SELECT count(*) INTO affected FROM nbki_crm_events
      WHERE org_id=3 AND id BETWEEN 928 AND 952 AND status='excluded';
    IF affected<>25 THEN RAISE EXCEPTION 'Expected 25 metadata events, found %',affected; END IF;
END $$;
