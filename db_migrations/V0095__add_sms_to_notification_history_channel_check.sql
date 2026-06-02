-- Добавляем 'sms' в список разрешённых каналов notification_history.
-- Ранее канал 'sms' отсутствовал в CHECK-констрейнте, из-за чего отправка SMS
-- падала с ошибкой нарушения check constraint.

ALTER TABLE t_p25513958_client_erp_developme.notification_history
    DROP CONSTRAINT IF EXISTS notification_history_channel_check;

ALTER TABLE t_p25513958_client_erp_developme.notification_history
    ADD CONSTRAINT notification_history_channel_check
    CHECK (channel = ANY (ARRAY['push'::text, 'telegram'::text, 'email'::text, 'max'::text, 'sms'::text]));
