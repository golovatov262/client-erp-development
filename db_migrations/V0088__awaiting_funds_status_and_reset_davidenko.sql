-- Поддержка статуса 'awaiting_funds' для savings и сторно-типа 'cancelled' для transactions
ALTER TABLE savings DROP CONSTRAINT IF EXISTS savings_status_check;
ALTER TABLE savings ADD CONSTRAINT savings_status_check CHECK (status IN ('active', 'closed', 'early_closed', 'awaiting_funds'));

ALTER TABLE savings_transactions DROP CONSTRAINT IF EXISTS savings_transactions_transaction_type_check;
ALTER TABLE savings_transactions ADD CONSTRAINT savings_transactions_transaction_type_check CHECK (transaction_type IN ('opening','deposit','withdrawal','partial_withdrawal','interest_payout','interest_accrual','term_change','rate_change','early_close','closing','final_payout','backfill','correction','cancelled'));

-- Сторно ошибочной opening-транзакции по договору Давиденко (100-000000922052026)
UPDATE savings_transactions
SET amount = 0,
    transaction_type = 'cancelled',
    description = 'Сторно ошибочного автооткрытия с балансом. Договор переведён в режим ожидания первого взноса.'
WHERE id = 565 AND saving_id = 146;

UPDATE savings
SET current_balance = 0,
    accrued_interest = 0,
    status = 'awaiting_funds',
    updated_at = NOW()
WHERE id = 146;
