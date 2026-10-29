-- CRM is the sole runtime source of outgoing NBKI events. Historical imports
-- may seed master data, never replace a CRM accounting operation.
CREATE TABLE IF NOT EXISTS nbki_source_settings (
    org_id integer PRIMARY KEY REFERENCES organizations(id),
    source_id varchar(12) NOT NULL UNIQUE,
    source_code varchar(20) NOT NULL,
    registration_date date,
    registration_number varchar(100),
    creditor_code varchar(20),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- One-time migration of source requisites from the supplied 06.10.2026 XML.
-- The CRM organization record remains authoritative for name, INN and OGRN.
INSERT INTO nbki_source_settings
    (org_id,source_id,source_code,registration_date,registration_number,creditor_code)
SELECT id,'QY01GG000001','3',DATE '2008-11-20','1084307001041','3'
FROM organizations WHERE inn='4307012081' AND NULLIF(trim(name),'') IS NOT NULL
ON CONFLICT (org_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS nbki_loan_terms_versions (
    id bigserial PRIMARY KEY,
    loan_id integer NOT NULL REFERENCES loans(id),
    valid_from timestamptz NOT NULL,
    valid_until timestamptz,
    deal_code varchar(20),
    kind_code varchar(20),
    purpose_code varchar(20),
    interest_day_basis integer NOT NULL DEFAULT 365
        CHECK (interest_day_basis IN (360, 365, 366)),
    annual_rate numeric(12,6),
    schedule_snapshot jsonb,
    basis varchar(100) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (valid_until IS NULL OR valid_until > valid_from)
);
CREATE INDEX IF NOT EXISTS idx_nbki_loan_terms_asof
    ON nbki_loan_terms_versions (loan_id, valid_from DESC);

CREATE TABLE IF NOT EXISTS nbki_opening_balances (
    id bigserial PRIMARY KEY,
    loan_id integer NOT NULL REFERENCES loans(id),
    as_of timestamptz NOT NULL,
    principal_due numeric(18,2) NOT NULL CHECK (principal_due >= 0),
    principal_overdue numeric(18,2) NOT NULL CHECK (principal_overdue >= 0),
    interest_due numeric(18,2) NOT NULL CHECK (interest_due >= 0),
    interest_overdue numeric(18,2) NOT NULL CHECK (interest_overdue >= 0),
    penalty_unpaid numeric(18,2) NOT NULL CHECK (penalty_unpaid >= 0),
    overdue_since date,
    basis varchar(100) NOT NULL,
    evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (loan_id, as_of)
);

CREATE TABLE IF NOT EXISTS nbki_crm_events (
    id bigserial PRIMARY KEY,
    org_id integer NOT NULL REFERENCES organizations(id),
    loan_id integer NOT NULL REFERENCES loans(id),
    source_type varchar(40) NOT NULL,
    source_id bigint NOT NULL,
    event_kind varchar(40) NOT NULL,
    event_occurred_at timestamptz,
    recorded_at timestamptz NOT NULL DEFAULT now(),
    evidence_sha256 char(64),
    status varchar(24) NOT NULL DEFAULT 'new'
        CHECK (status IN ('new','needs_data','ready','exported','accepted','rejected','excluded')),
    UNIQUE (source_type, source_id)
);
CREATE INDEX IF NOT EXISTS idx_nbki_crm_events_org_status
    ON nbki_crm_events (org_id, status, recorded_at, id);

-- The four operator-timed October payments are already CRM operations. Put
-- them into the same queue; do not fabricate a missing historical snapshot.
INSERT INTO nbki_crm_events
    (org_id,loan_id,source_type,source_id,event_kind,event_occurred_at,
     evidence_sha256,status)
SELECT l.org_id,p.loan_id,'loan_payment',p.id,'payment',
       p.nbki_event_occurred_at,s.evidence_sha256,'new'
FROM loan_payments p JOIN loans l ON l.id=p.loan_id
LEFT JOIN nbki_payment_posting_snapshots s ON s.payment_id=p.id
WHERE p.nbki_event_occurred_at IS NOT NULL
ON CONFLICT (source_type,source_id) DO NOTHING;
