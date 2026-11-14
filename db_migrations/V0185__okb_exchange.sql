-- OKB delivery is independent of NBKI, while financial operation evidence is shared.
CREATE TABLE okb_settings (org_id integer PRIMARY KEY REFERENCES organizations(id), config jsonb NOT NULL DEFAULT '{}', updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE okb_agents (id bigserial PRIMARY KEY, org_id integer NOT NULL REFERENCES organizations(id), token_hash text NOT NULL UNIQUE, active boolean NOT NULL DEFAULT true, last_seen_at timestamptz, diagnostic jsonb NOT NULL DEFAULT '{}');
CREATE TABLE okb_packages (
 id bigserial PRIMARY KEY, org_id integer NOT NULL REFERENCES organizations(id),
 file_name text NOT NULL UNIQUE, xml_payload bytea NOT NULL, xml_sha256 text NOT NULL, config jsonb NOT NULL,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processing','sending','sent','delivery_unknown','completed','failed','cancelled')),
 agent_id bigint REFERENCES okb_agents(id), lease_token text, lease_until timestamptz,
 encrypted_payload bytea, evidence jsonb NOT NULL DEFAULT '{}', error text,
 receipt_stage smallint NOT NULL DEFAULT 1 CHECK(receipt_stage IN(1,2,3)), next_poll_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE okb_package_events (
 package_id bigint NOT NULL REFERENCES okb_packages(id), event_id bigint NOT NULL REFERENCES nbki_crm_events(id),
 order_num integer NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','accepted','rejected')),
 PRIMARY KEY(package_id,event_id), UNIQUE(package_id,order_num));
CREATE INDEX ON okb_package_events(event_id,status);
CREATE INDEX ON okb_packages(org_id,status);
CREATE TABLE okb_receipts (
 id bigserial PRIMARY KEY, org_id integer NOT NULL REFERENCES organizations(id), package_id bigint NOT NULL REFERENCES okb_packages(id),
 provider_name text NOT NULL, sha256 text NOT NULL, xml_payload bytea NOT NULL, encrypted_payload bytea NOT NULL,
 result jsonb NOT NULL, evidence jsonb NOT NULL, acknowledged boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(package_id,sha256), UNIQUE(org_id,provider_name));
