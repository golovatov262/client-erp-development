
CREATE TABLE chat_conversations (
    id SERIAL PRIMARY KEY,
    member_id INTEGER NOT NULL REFERENCES members(id),
    subject VARCHAR(200) DEFAULT '',
    status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
    assigned_staff_id INTEGER REFERENCES users(id),
    ai_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chat_conv_member ON chat_conversations(member_id);
CREATE INDEX idx_chat_conv_status ON chat_conversations(status);
CREATE INDEX idx_chat_conv_assigned ON chat_conversations(assigned_staff_id);

CREATE TABLE chat_messages (
    id SERIAL PRIMARY KEY,
    conversation_id INTEGER NOT NULL REFERENCES chat_conversations(id),
    sender_type VARCHAR(10) NOT NULL CHECK (sender_type IN ('client','staff','ai')),
    sender_id INTEGER REFERENCES users(id),
    body TEXT NOT NULL DEFAULT '',
    read_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chat_msg_conv ON chat_messages(conversation_id);
CREATE INDEX idx_chat_msg_created ON chat_messages(created_at);
