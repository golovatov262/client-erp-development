CREATE TABLE IF NOT EXISTS saving_applications (
    id SERIAL PRIMARY KEY,
    application_no VARCHAR(50) UNIQUE,
    status VARCHAR(30) NOT NULL DEFAULT 'new',
    member_id INTEGER,
    org_id INTEGER,

    amount NUMERIC(15,2),
    term_months INTEGER,
    rate NUMERIC(8,4),
    payout_type VARCHAR(20) DEFAULT 'monthly',

    last_name VARCHAR(150),
    first_name VARCHAR(150),
    middle_name VARCHAR(150),
    birth_date DATE,
    birth_place VARCHAR(300),
    inn VARCHAR(20),
    passport_series VARCHAR(10),
    passport_number VARCHAR(10),
    passport_dept_code VARCHAR(10),
    passport_issue_date DATE,
    passport_issued_by TEXT,
    registration_address TEXT,
    phone VARCHAR(30),
    email VARCHAR(150),
    telegram VARCHAR(100),
    bank_bik VARCHAR(15),
    bank_account VARCHAR(30),
    marital_status VARCHAR(30),
    spouse_fio VARCHAR(300),
    spouse_phone VARCHAR(30),
    extra_phone VARCHAR(30),
    extra_contact_fio VARCHAR(300),

    curator_user_id INTEGER,
    agent_name VARCHAR(300),
    is_curator_personal BOOLEAN DEFAULT FALSE,
    commission_amount NUMERIC(15,2),

    created_saving_id INTEGER,
    rejection_reason TEXT,
    specialist_comment TEXT,

    created_by INTEGER,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saving_apps_status ON saving_applications(status);
CREATE INDEX IF NOT EXISTS idx_saving_apps_member ON saving_applications(member_id);
CREATE INDEX IF NOT EXISTS idx_saving_apps_created ON saving_applications(created_at DESC);