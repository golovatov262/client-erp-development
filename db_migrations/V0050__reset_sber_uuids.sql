-- Сбрасываем sber_uuid для повторной загрузки
UPDATE bank_transactions SET sber_uuid = 'reset_' || id::text WHERE statement_id = 1;