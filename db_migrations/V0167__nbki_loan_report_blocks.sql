-- Per-loan precedent for two conditional FL_Event_2_3 blocks, derived from
-- the organization's own historical NBKI files (received from 1C, several
-- already confirmed accepted). Across 623 real historical events, FL_22 and
-- FL_55 presence is consistent per loan UID - always included or always
-- omitted, never mixed within the same loan's history. Reusing that
-- precedent (rather than guessing a blanket rule) is the only evidence-based
-- way to decide these for a loan with no new confirmed calculation of its own.
CREATE TABLE IF NOT EXISTS nbki_loan_report_blocks (
    loan_id INTEGER PRIMARY KEY REFERENCES loans(id),
    org_id INTEGER NOT NULL REFERENCES organizations(id),
    include_total_cost BOOLEAN NOT NULL,
    include_application BOOLEAN NOT NULL,
    -- json (not jsonb): field order must round-trip exactly for XSD sequence
    -- validity when the serializer replays these elements.
    application_block JSON,
    source_file_id BIGINT REFERENCES nbki_source_files(id),
    basis VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CHECK (NOT include_application OR application_block IS NOT NULL)
);
