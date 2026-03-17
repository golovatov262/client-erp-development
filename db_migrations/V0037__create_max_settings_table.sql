CREATE TABLE max_settings (
    id SERIAL PRIMARY KEY,
    key VARCHAR(100) UNIQUE NOT NULL,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO max_settings (key, value) VALUES
    ('enabled', 'false'),
    ('reminder_days', '3,1,0'),
    ('overdue_notify', 'true'),
    ('savings_enabled', 'false'),
    ('savings_reminder_days', '30,15,7');