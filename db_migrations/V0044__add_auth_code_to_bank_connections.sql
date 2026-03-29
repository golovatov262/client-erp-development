ALTER TABLE bank_connections ADD COLUMN IF NOT EXISTS auth_code TEXT;
ALTER TABLE bank_connections ADD COLUMN IF NOT EXISTS auth_code_at TIMESTAMP;