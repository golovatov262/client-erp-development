-- SMS уведомления (SMSAero)

ALTER TABLE notification_channels DROP CONSTRAINT IF EXISTS notification_channels_channel_check;
ALTER TABLE notification_channels ADD CONSTRAINT notification_channels_channel_check
    CHECK (channel IN ('push', 'telegram', 'email', 'max', 'sms'));

CREATE TABLE IF NOT EXISTS sms_settings (
    id SERIAL PRIMARY KEY,
    key VARCHAR(100) NOT NULL UNIQUE,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sms_auto_log (
    id SERIAL PRIMARY KEY,
    loan_id INTEGER NOT NULL,
    schedule_id INTEGER NOT NULL,
    member_id INTEGER NOT NULL,
    reminder_type VARCHAR(40) NOT NULL,
    sent_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (loan_id, schedule_id, member_id, reminder_type)
);

CREATE INDEX IF NOT EXISTS idx_sms_auto_log_member ON sms_auto_log(member_id);

INSERT INTO notification_channels (channel, enabled, settings)
SELECT 'sms', false, '{}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM notification_channels WHERE channel = 'sms');

INSERT INTO sms_settings (key, value) VALUES
    ('enabled', 'false'),
    ('reminder_days', '3,1,0'),
    ('overdue_notify', 'true'),
    ('remind_time', '10:00'),
    ('savings_enabled', 'false'),
    ('savings_reminder_days', '7,1,0'),
    ('savings_remind_time', '10:00'),
    ('tpl_payment_today', 'Сегодня платеж по займу {contract_no}, сумма {amount} руб. КПК'),
    ('tpl_payment_tomorrow', 'Завтра платеж по займу {contract_no}, сумма {amount} руб. КПК'),
    ('tpl_payment_days', 'Через {days} дн. платеж по займу {contract_no}, сумма {amount} руб. КПК'),
    ('tpl_overdue', 'Просрочка по займу {contract_no}, сумма {amount} руб. Оплатите во избежание пени. КПК'),
    ('tpl_savings_today', 'Сегодня окончание договора сбережений {contract_no}, сумма {amount} руб. КПК'),
    ('tpl_savings_tomorrow', 'Завтра окончание договора сбережений {contract_no}, сумма {amount} руб. КПК'),
    ('tpl_savings_days', 'Через {days} дн. окончание договора сбережений {contract_no}, сумма {amount} руб. КПК')
ON CONFLICT (key) DO NOTHING;
