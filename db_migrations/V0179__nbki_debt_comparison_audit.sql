CREATE TABLE nbki_debt_change_reviews (
    id BIGSERIAL PRIMARY KEY,
    event_id BIGINT NOT NULL REFERENCES nbki_crm_events(id),
    baseline_file_id BIGINT REFERENCES nbki_source_files(id),
    decision TEXT NOT NULL,
    details JSONB NOT NULL,
    reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX nbki_debt_change_reviews_event ON nbki_debt_change_reviews(event_id,id DESC);
