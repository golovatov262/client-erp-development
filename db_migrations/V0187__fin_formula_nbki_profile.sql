-- Source requisites from GU01LL000001_20261006_145023.xml supplied by the operator.
INSERT INTO nbki_source_settings(org_id,source_id,source_code,registration_date,registration_number,creditor_code)
SELECT id,'GU01LL000001','3',DATE '2016-05-24','1163668081895','3'
FROM organizations WHERE inn='3666209530' AND ogrn='1163668081895'
ON CONFLICT(org_id) DO NOTHING;
-- Historical acceptance explicitly attested by the operator, without a fabricated receipt.
ALTER TABLE nbki_source_files ADD COLUMN IF NOT EXISTS acceptance_basis text;
ALTER TABLE nbki_source_files ADD COLUMN IF NOT EXISTS confirmed_period_end date;
-- Guarantee numbers may be reused for distinct guarantee UIDs; borrower numbers remain unique.
ALTER TABLE nbki_deals DROP CONSTRAINT IF EXISTS nbki_deals_org_contract_unique;
CREATE UNIQUE INDEX IF NOT EXISTS nbki_deals_org_borrower_contract_unique
ON nbki_deals(org_id,contract_no) WHERE deal_role='borrower';
-- Operator confirmed the same NBKI encryption/receipt certificates. Never copy
-- the organization's signer, TLS identity or power of attorney. Sending stays disabled.
INSERT INTO nbki_exchange_settings(org_id,config)
SELECT target.org_id,
       (origin.config - 'signer_thumbprint' - 'tls_thumbprint' - 'mchd_base64')
       || '{"transport":"disabled"}'::jsonb
FROM nbki_exchange_settings origin
JOIN nbki_source_settings source ON source.org_id=origin.org_id AND source.source_id='QY01GG000001'
JOIN nbki_source_settings target ON target.source_id='GU01LL000001'
ON CONFLICT(org_id) DO NOTHING;
