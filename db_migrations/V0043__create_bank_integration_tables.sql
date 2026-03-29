
CREATE TABLE bank_connections (
    id SERIAL PRIMARY KEY,
    org_id INTEGER NOT NULL REFERENCES organizations(id),
    bank_name VARCHAR(50) NOT NULL DEFAULT 'sber',
    account_number VARCHAR(20) NOT NULL,
    client_id VARCHAR(200) NOT NULL DEFAULT '',
    client_secret_ref VARCHAR(100) NOT NULL DEFAULT '',
    access_token TEXT DEFAULT '',
    refresh_token TEXT DEFAULT '',
    token_expires_at TIMESTAMP,
    scope VARCHAR(500) NOT NULL DEFAULT 'openid GET_STATEMENT_ACCOUNT',
    is_active BOOLEAN NOT NULL DEFAULT false,
    last_sync_at TIMESTAMP,
    last_sync_status VARCHAR(20) DEFAULT 'never',
    last_sync_error TEXT DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_bank_connections_org_account ON bank_connections(org_id, account_number);

CREATE TABLE bank_statements (
    id SERIAL PRIMARY KEY,
    connection_id INTEGER NOT NULL REFERENCES bank_connections(id),
    statement_date DATE NOT NULL,
    opening_balance NUMERIC(15,2),
    closing_balance NUMERIC(15,2),
    debit_turnover NUMERIC(15,2),
    credit_turnover NUMERIC(15,2),
    transaction_count INTEGER DEFAULT 0,
    matched_count INTEGER DEFAULT 0,
    unmatched_count INTEGER DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'loaded',
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_bank_statements_conn_date ON bank_statements(connection_id, statement_date);

CREATE TABLE bank_transactions (
    id SERIAL PRIMARY KEY,
    statement_id INTEGER NOT NULL REFERENCES bank_statements(id),
    sber_uuid VARCHAR(100),
    operation_date TIMESTAMP NOT NULL,
    document_date DATE,
    document_number VARCHAR(50),
    amount NUMERIC(15,2) NOT NULL,
    direction VARCHAR(10) NOT NULL,
    payment_purpose TEXT,
    payer_name TEXT,
    payer_inn VARCHAR(12),
    payer_account VARCHAR(25),
    payer_bank_name TEXT,
    payer_bik VARCHAR(9),
    payee_name TEXT,
    payee_inn VARCHAR(12),
    payee_account VARCHAR(25),
    payee_bank_name TEXT,
    payee_bik VARCHAR(9),
    matched_contract_no VARCHAR(100),
    matched_entity VARCHAR(20),
    matched_entity_id INTEGER,
    match_status VARCHAR(20) NOT NULL DEFAULT 'pending',
    payment_id INTEGER,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bank_transactions_statement ON bank_transactions(statement_id);
CREATE INDEX idx_bank_transactions_match ON bank_transactions(match_status);
CREATE INDEX idx_bank_transactions_sber_uuid ON bank_transactions(sber_uuid);
CREATE INDEX idx_bank_transactions_contract ON bank_transactions(matched_contract_no);
