-- Operator authorized approximate MSK times for historical payments lacking
-- timestamps. Keep these distinct from operator-confirmed exact times.
ALTER TABLE loan_payments
    DROP CONSTRAINT IF EXISTS chk_nbki_payment_event_time_basis;

ALTER TABLE loan_payments
    ADD CONSTRAINT chk_nbki_payment_event_time_basis
    CHECK ((nbki_event_occurred_at IS NULL AND nbki_event_time_basis IS NULL)
        OR (nbki_event_occurred_at IS NOT NULL
            AND nbki_event_time_basis IN ('operator_entered', 'operator_approximate')));

DO $$
DECLARE changed_count INTEGER;
BEGIN
    WITH approximate(payment_id, loan_id, payment_date, amount, occurred_at) AS (
        VALUES
            (2709, 28, DATE '2026-10-29', 58172.00::NUMERIC, TIMESTAMPTZ '2026-10-29 10:00:00+03:00'),
            (2708, 44, DATE '2026-10-29', 22000.00::NUMERIC, TIMESTAMPTZ '2026-10-29 11:00:00+03:00'),
            (2703, 77, DATE '2026-10-29', 3974.00::NUMERIC, TIMESTAMPTZ '2026-10-29 12:00:00+03:00'),
            (2707, 81, DATE '2026-10-29', 20685.00::NUMERIC, TIMESTAMPTZ '2026-10-29 13:00:00+03:00'),
            (2704, 102, DATE '2026-10-29', 6610.79::NUMERIC, TIMESTAMPTZ '2026-10-29 14:00:00+03:00'),
            (2710, 159, DATE '2026-10-29', 62974.00::NUMERIC, TIMESTAMPTZ '2026-10-29 15:00:00+03:00'),
            (2720, 46, DATE '2026-10-30', 20000.00::NUMERIC, TIMESTAMPTZ '2026-10-30 10:00:00+03:00'),
            (2717, 92, DATE '2026-10-30', 9472.00::NUMERIC, TIMESTAMPTZ '2026-10-30 12:00:00+03:00'),
            (2718, 93, DATE '2026-10-30', 15500.00::NUMERIC, TIMESTAMPTZ '2026-10-30 14:00:00+03:00'),
            (2724, 166, DATE '2026-10-30', 5000.00::NUMERIC, TIMESTAMPTZ '2026-10-30 16:00:00+03:00'),
            (2727, 31, DATE '2026-10-31', 17850.00::NUMERIC, TIMESTAMPTZ '2026-10-31 12:00:00+03:00'),
            (2730, 16, DATE '2026-11-01', 35000.00::NUMERIC, TIMESTAMPTZ '2026-11-01 12:00:00+03:00'),
            (2734, 31, DATE '2026-11-03', 100.00::NUMERIC, TIMESTAMPTZ '2026-11-03 12:00:00+03:00')
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
    IF changed_count <> 13 THEN
        RAISE EXCEPTION 'NBKI approximate payment time update expected 13 rows, got %', changed_count;
    END IF;
END $$;
