-- Таблица обеспечения по договорам займа (залоги/поручительства)
CREATE TABLE t_p25513958_client_erp_developme.loan_collateral (
    id SERIAL PRIMARY KEY,
    loan_id INTEGER NOT NULL REFERENCES t_p25513958_client_erp_developme.loans(id),
    collateral_type VARCHAR(100) NOT NULL,
    pledger_name VARCHAR(500),
    description TEXT,
    collateral_value NUMERIC(15,2),
    identifier VARCHAR(200),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_loan_collateral_loan_id ON t_p25513958_client_erp_developme.loan_collateral(loan_id);
