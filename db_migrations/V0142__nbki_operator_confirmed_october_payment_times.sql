-- КПК «Эксперт Финанс»: exact MSK times supplied by the operator for four
-- identified CRM payments. Do not infer timestamps for other payments.
DO $$
DECLARE changed_count INTEGER;
BEGIN
    WITH confirmed(payment_id, loan_id, payment_date, amount, occurred_at) AS (
        VALUES
            (2649, 87, DATE '2026-10-26', 13600.87::NUMERIC,
                TIMESTAMPTZ '2026-10-26 10:42:15+03:00'),
            (2652, 63, DATE '2026-10-27', 18000.00::NUMERIC,
                TIMESTAMPTZ '2026-10-27 10:45:12+03:00'),
            (2656, 17, DATE '2026-10-28', 28888.97::NUMERIC,
                TIMESTAMPTZ '2026-10-28 10:46:18+03:00'),
            (2657, 50, DATE '2026-10-28', 19300.00::NUMERIC,
                TIMESTAMPTZ '2026-10-28 10:47:11+03:00')
    )
    UPDATE loan_payments p
    SET nbki_event_occurred_at = confirmed.occurred_at,
        nbki_event_time_basis = 'operator_entered'
    FROM confirmed JOIN loans l ON l.id = confirmed.loan_id
    WHERE p.id = confirmed.payment_id
      AND p.loan_id = confirmed.loan_id
      AND p.payment_date = confirmed.payment_date
      AND p.amount = confirmed.amount
      AND l.org_id = 2
      AND p.nbki_event_occurred_at IS NULL
      AND p.nbki_event_time_basis IS NULL;
    GET DIAGNOSTICS changed_count = ROW_COUNT;
    IF changed_count <> 4 THEN
        RAISE EXCEPTION 'NBKI payment time update expected 4 rows, got %', changed_count;
    END IF;
END $$;
