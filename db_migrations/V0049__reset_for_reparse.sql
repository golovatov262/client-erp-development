-- Сбрасываем выписку для повторной загрузки
UPDATE bank_statements SET transaction_count = 0, matched_count = 0, unmatched_count = 0 WHERE id = 1;

-- Сбрасываем транзакции для повторного разнесения
UPDATE bank_transactions SET match_status = 'pending', payment_id = NULL, matched_contract_no = NULL, matched_entity = NULL, matched_entity_id = NULL WHERE statement_id = 1;