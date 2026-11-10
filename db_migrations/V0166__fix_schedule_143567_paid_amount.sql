-- Completes V0165: loan_schedule row 143567's paid_amount (1879.97) only
-- ever reflected the interest+principal allocations, not the 21.63 penalty
-- from payment #2649's manual correction. Bump it to match the now-complete
-- allocation set (1901.60) for the same row the operator confirmed.
DO $$
DECLARE changed_count INTEGER;
BEGIN
    UPDATE loan_schedule SET paid_amount=1901.60
    WHERE id=143567 AND paid_amount=1879.97;
    GET DIAGNOSTICS changed_count = ROW_COUNT;
    IF changed_count <> 1 THEN
        RAISE EXCEPTION 'Expected to update exactly 1 schedule row (143567), got %', changed_count;
    END IF;
END $$;
