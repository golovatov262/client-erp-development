-- Operator authorized approximate MSK times (10:00-16:00) for 5 recent
-- payments without a confirmed exact acceptance time, per the same basis
-- as V0143. Approximate, not operator_entered.
DO $$
DECLARE changed_count INTEGER;
BEGIN
    WITH approximate(payment_id, loan_id, payment_date, amount, occurred_at) AS (
        VALUES
            (2653, 110, DATE '2026-10-27', 24000.00::NUMERIC, TIMESTAMPTZ '2026-10-27 10:00:00+03:00'),
            (2738, 28,  DATE '2026-11-06',    20.00::NUMERIC, TIMESTAMPTZ '2026-11-06 11:00:00+03:00'),
            (2739, 32,  DATE '2026-11-06', 34804.00::NUMERIC, TIMESTAMPTZ '2026-11-06 12:00:00+03:00'),
            (2744, 173, DATE '2026-11-09',  5000.00::NUMERIC, TIMESTAMPTZ '2026-11-09 13:00:00+03:00'),
            (2745, 63,  DATE '2026-11-09', 18000.00::NUMERIC, TIMESTAMPTZ '2026-11-09 14:00:00+03:00')
    )
    UPDATE loan_payments p
    SET nbki_event_occurred_at = approximate.occurred_at,
        nbki_event_time_basis = 'operator_approximate'
    FROM approximate JOIN loans l ON l.id = approximate.loan_id
    WHERE p.id = approximate.payment_id
      AND p.loan_id = approximate.loan_id
      AND p.payment_date = approximate.payment_date
      AND p.amount = approximate.amount
      AND l.org_id = 2
      AND p.nbki_event_occurred_at IS NULL
      AND p.nbki_event_time_basis IS NULL;
    GET DIAGNOSTICS changed_count = ROW_COUNT;
    IF changed_count <> 5 THEN
        RAISE EXCEPTION 'NBKI approximate payment time update expected 5 rows, got %', changed_count;
    END IF;
END $$;
