CREATE TABLE agent_sessions (
    id SERIAL PRIMARY KEY,
    agent_id INTEGER NOT NULL REFERENCES agents(id),
    token VARCHAR(128) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_agent_sessions_token ON agent_sessions(token);
CREATE INDEX idx_agent_sessions_agent_id ON agent_sessions(agent_id);
