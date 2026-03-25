CREATE TABLE member_organizations (
    id SERIAL PRIMARY KEY,
    member_id INTEGER NOT NULL REFERENCES members(id),
    org_id INTEGER NOT NULL REFERENCES organizations(id),
    joined_at DATE NOT NULL DEFAULT CURRENT_DATE,
    excluded_at DATE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_member_orgs_member ON member_organizations(member_id);
CREATE INDEX idx_member_orgs_org ON member_organizations(org_id);
CREATE INDEX idx_member_orgs_active ON member_organizations(org_id) WHERE excluded_at IS NULL;