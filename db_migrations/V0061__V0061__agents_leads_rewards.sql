-- Таблица агентов
CREATE TABLE agents (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    email VARCHAR(255),
    login VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active', -- active, blocked
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Заявки от агентов (потенциальные пайщики)
CREATE TABLE agent_leads (
    id SERIAL PRIMARY KEY,
    agent_id INTEGER NOT NULL REFERENCES agents(id),
    -- Данные потенциального пайщика
    org_name VARCHAR(500) NOT NULL,       -- Наименование ЮЛ или ФИО ИП
    inn VARCHAR(20) NOT NULL,
    phone VARCHAR(50),
    email VARCHAR(255),
    contact_name VARCHAR(255),            -- ФИО контактного лица
    comment TEXT,
    -- Статус обработки
    status VARCHAR(20) NOT NULL DEFAULT 'new', -- new, processing, member, rejected
    -- Если стал пайщиком
    member_id INTEGER REFERENCES members(id),
    -- Кто обработал
    processed_by_user_id INTEGER REFERENCES users(id),
    processed_at TIMESTAMP,
    reject_reason TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Вознаграждения агентов
CREATE TABLE agent_rewards (
    id SERIAL PRIMARY KEY,
    agent_id INTEGER NOT NULL REFERENCES agents(id),
    lead_id INTEGER NOT NULL REFERENCES agent_leads(id),
    member_id INTEGER REFERENCES members(id),
    reward_month DATE NOT NULL,           -- Первое число месяца начисления
    base_amount NUMERIC(12,2) NOT NULL DEFAULT 5000, -- Базовое за пайщика
    bonus_amount NUMERIC(12,2) NOT NULL DEFAULT 0,   -- Бонус за объём
    total_amount NUMERIC(12,2) NOT NULL,             -- Итого
    status VARCHAR(20) NOT NULL DEFAULT 'pending',   -- pending, paid
    paid_at TIMESTAMP,
    note TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Индексы
CREATE INDEX idx_agent_leads_agent_id ON agent_leads(agent_id);
CREATE INDEX idx_agent_leads_status ON agent_leads(status);
CREATE INDEX idx_agent_leads_member_id ON agent_leads(member_id);
CREATE INDEX idx_agent_rewards_agent_id ON agent_rewards(agent_id);
CREATE INDEX idx_agent_rewards_reward_month ON agent_rewards(reward_month);
CREATE INDEX idx_agent_rewards_status ON agent_rewards(status);
