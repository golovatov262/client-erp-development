
CREATE TABLE max_subscribers (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    chat_id BIGINT NOT NULL,
    user_id_max BIGINT,
    username TEXT,
    first_name TEXT,
    subscribed_at TIMESTAMP NOT NULL DEFAULT NOW(),
    active BOOLEAN NOT NULL DEFAULT true,
    UNIQUE(user_id, chat_id)
);

CREATE INDEX idx_max_subscribers_user ON max_subscribers(user_id);
CREATE INDEX idx_max_subscribers_chat ON max_subscribers(chat_id);

CREATE TABLE max_link_codes (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    code VARCHAR(64) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_max_link_codes_code ON max_link_codes(code);
CREATE INDEX idx_max_link_codes_expires ON max_link_codes(expires_at);

CREATE TABLE max_auto_log (
    id SERIAL PRIMARY KEY,
    loan_id INTEGER NOT NULL,
    schedule_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    reminder_type VARCHAR(30) NOT NULL,
    sent_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(loan_id, schedule_id, user_id, reminder_type)
);

CREATE INDEX idx_max_auto_log_schedule ON max_auto_log(schedule_id, reminder_type);

CREATE TABLE notification_settings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    channel VARCHAR(20) NOT NULL,
    setting_key VARCHAR(50) NOT NULL,
    setting_value TEXT NOT NULL DEFAULT 'true',
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, channel, setting_key)
);

CREATE INDEX idx_notification_settings_user ON notification_settings(user_id, channel);
