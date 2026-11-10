-- Payment #2649 (loan 87): manual correction on 03.11.2026 set penalty_part
-- to 21.63 but never inserted the matching loan_payment_allocations row,
-- leaving total allocations (13579.24) short of the payment amount
-- (13600.87) by exactly that penalty. The operator confirmed 10.11.2026
-- to attribute it to schedule row 143567 (31.10.2026, overdue, assessed
-- penalty 15.13).
DO $$
DECLARE changed_count INTEGER;
BEGIN
    INSERT INTO loan_payment_allocations (payment_id,schedule_id,component,amount,allocation_mode)
    SELECT 2649,143567,'penalty',21.63,'manual'
    WHERE NOT EXISTS (SELECT 1 FROM loan_payment_allocations
        WHERE payment_id=2649 AND component='penalty');
    GET DIAGNOSTICS changed_count = ROW_COUNT;
    IF changed_count <> 1 THEN
        RAISE EXCEPTION 'Expected to insert exactly 1 penalty allocation row for payment 2649, got %', changed_count;
    END IF;
END $$;
