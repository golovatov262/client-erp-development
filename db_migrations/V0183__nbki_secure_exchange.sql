CREATE TABLE nbki_exchange_settings (
 org_id integer PRIMARY KEY REFERENCES organizations(id), config jsonb NOT NULL DEFAULT '{}',
 updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE nbki_exchange_agents (
 id bigserial PRIMARY KEY, org_id integer NOT NULL REFERENCES organizations(id),
 name text NOT NULL, token_hash text NOT NULL UNIQUE, active boolean NOT NULL DEFAULT true,
 last_seen_at timestamptz, diagnostic jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE nbki_exchange_packages (
 id bigserial PRIMARY KEY, org_id integer NOT NULL REFERENCES organizations(id),
 file_name text NOT NULL, reg_number text NOT NULL UNIQUE, xml_payload bytea NOT NULL, xml_sha256 text NOT NULL,
 event_ids bigint[] NOT NULL, config jsonb NOT NULL,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processing','prepared','sending','sent','delivery_unknown','completed','failed','cancelled')),
 agent_id bigint REFERENCES nbki_exchange_agents(id), lease_token text, lease_until timestamptz,
 encrypted_payload bytea, encrypted_sha256 text, encrypted_name text, evidence jsonb,
 error text, created_by integer, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE nbki_exchange_receipts (
 id bigserial PRIMARY KEY, org_id integer NOT NULL REFERENCES organizations(id), package_id bigint NOT NULL REFERENCES nbki_exchange_packages(id),
 sha256 text NOT NULL, payload bytea NOT NULL, encrypted_payload bytea NOT NULL,
 agent_id bigint NOT NULL REFERENCES nbki_exchange_agents(id), evidence jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(package_id,sha256));
CREATE INDEX ON nbki_exchange_packages(org_id,status);
