CREATE TABLE IF NOT EXISTS t_p25513958_client_erp_developme.cron_run_log (
    id BIGSERIAL PRIMARY KEY,
    job_name VARCHAR(100) NOT NULL,
    run_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'running',
    result JSONB,
    started_at TIMESTAMP NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMP,
    UNIQUE(job_name, run_date)
);
