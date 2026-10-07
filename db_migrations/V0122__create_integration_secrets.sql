CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS t_p25513958_client_erp_developme.integration_secrets (
 key VARCHAR(100) PRIMARY KEY, encrypted_value BYTEA NOT NULL,
 updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
 updated_by INTEGER REFERENCES t_p25513958_client_erp_developme.users(id) ON DELETE SET NULL
);
REVOKE ALL ON t_p25513958_client_erp_developme.integration_secrets FROM PUBLIC;
