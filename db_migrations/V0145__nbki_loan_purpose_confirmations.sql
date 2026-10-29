CREATE TABLE IF NOT EXISTS nbki_loan_purpose_confirmations (
    loan_id INTEGER PRIMARY KEY REFERENCES loans(id),
    org_id INTEGER NOT NULL REFERENCES organizations(id),
    purpose VARCHAR(24) NOT NULL CHECK (purpose IN ('consumer', 'business', 'unknown')),
    basis VARCHAR(32) NOT NULL,
    note TEXT NOT NULL,
    confirmed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

INSERT INTO nbki_loan_purpose_confirmations
    (loan_id,org_id,purpose,basis,note)
SELECT id,org_id,'consumer','operator_confirmation',
       'Потребительская цель подтверждена пользователем 29.10.2026; историческая 1С содержит «Цель не определена».'
FROM loans WHERE id=105 AND org_id=2 AND contract_no='100-000002209122025'
ON CONFLICT (loan_id) DO NOTHING;

INSERT INTO nbki_loan_purpose_confirmations
    (loan_id,org_id,purpose,basis,note)
SELECT id,org_id,'consumer','operator_confirmation',
       'Потребительская цель подтверждена пользователем 29.10.2026; указание 1С «Пополнение оборотных средств» признано ошибкой.'
FROM loans WHERE id=143 AND org_id=2 AND contract_no='100-000000230092025'
ON CONFLICT (loan_id) DO NOTHING;
