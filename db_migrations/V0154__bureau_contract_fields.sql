-- Bureau-specific codes belong to a bureau namespace: identical-looking
-- codes in NBKI and OKB are not assumed interchangeable.
CREATE TABLE IF NOT EXISTS bureau_loan_fields (
    loan_id INTEGER NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
    org_id INTEGER NOT NULL REFERENCES organizations(id),
    bureau_code VARCHAR(16) NOT NULL CHECK (bureau_code IN ('NBKI','OKB')),
    deal_code VARCHAR(20),
    kind_code VARCHAR(20),
    purpose_code VARCHAR(20),
    payment_size_code VARCHAR(20),
    payment_schedule_code VARCHAR(20),
    note TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (loan_id,bureau_code)
);

INSERT INTO bureau_loan_fields
    (loan_id,org_id,bureau_code,deal_code,kind_code,purpose_code,
     payment_size_code,payment_schedule_code,note,updated_at)
SELECT loan_id,org_id,'NBKI',deal_code,kind_code,purpose_code,
       payment_size_code,payment_schedule_code,note,updated_at
FROM nbki_loan_manual_fields
ON CONFLICT (loan_id,bureau_code) DO NOTHING;
