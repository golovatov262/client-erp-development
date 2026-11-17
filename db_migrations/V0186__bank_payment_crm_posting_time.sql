-- Actual CRM posting timestamp for new automatically posted bank payments.
-- Existing timestamps and payment dates are not rewritten.
ALTER TABLE loan_payments DROP CONSTRAINT IF EXISTS chk_nbki_payment_event_time_basis;
ALTER TABLE loan_payments ADD CONSTRAINT chk_nbki_payment_event_time_basis
CHECK ((nbki_event_occurred_at IS NULL AND nbki_event_time_basis IS NULL)
    OR (nbki_event_occurred_at IS NOT NULL AND nbki_event_time_basis IN
        ('operator_entered', 'operator_approximate', 'crm_posted')));
