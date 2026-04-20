CREATE TABLE IF NOT EXISTS loan_applications (
    id SERIAL PRIMARY KEY,
    application_no VARCHAR(50) UNIQUE,
    status VARCHAR(30) NOT NULL DEFAULT 'new',
    member_id INTEGER,
    org_id INTEGER,

    amount NUMERIC(15,2),
    term_months INTEGER,
    loan_program VARCHAR(100),
    collateral_types TEXT,

    full_name VARCHAR(300),
    birth_date DATE,
    birth_place VARCHAR(300),
    passport_series_number VARCHAR(20),
    passport_issue_date DATE,
    passport_issued_by TEXT,
    passport_division_code VARCHAR(10),
    registration_address TEXT,
    mobile_phone VARCHAR(30),
    email VARCHAR(150),
    inn VARCHAR(20),
    bank_account VARCHAR(30),
    bik VARCHAR(15),
    bank_name VARCHAR(200),

    official_income NUMERIC(15,2),
    income_confirmation TEXT,
    employer_inn VARCHAR(20),
    employer_name VARCHAR(300),
    position VARCHAR(200),
    additional_income_type VARCHAR(100),
    additional_income NUMERIC(15,2),
    additional_income_other VARCHAR(300),

    current_loans_payments NUMERIC(15,2),
    mandatory_expenses NUMERIC(15,2),
    has_active_loans VARCHAR(20),

    marital_status VARCHAR(50),
    has_minor_children VARCHAR(20),
    children_count INTEGER,
    spouse_name VARCHAR(300),
    spouse_phone VARCHAR(30),
    spouse_income NUMERIC(15,2),
    has_maternal_capital VARCHAR(20),

    real_estate_type VARCHAR(100),
    cadastral_number VARCHAR(50),
    property_address TEXT,
    land_cadastral_number VARCHAR(50),
    land_address TEXT,

    car_brand VARCHAR(100),
    car_model VARCHAR(100),
    car_year INTEGER,
    car_market_value NUMERIC(15,2),

    other_collateral_description TEXT,

    contact_full_name VARCHAR(300),
    contact_phone VARCHAR(30),

    passport_files TEXT,
    income_files TEXT,
    collateral_files TEXT,
    other_files TEXT,
    guarantor_files TEXT,

    curator_user_id INTEGER,
    agent_user_id INTEGER,
    commission_amount NUMERIC(15,2),
    specialist_comment TEXT,
    association VARCHAR(200),

    created_loan_id INTEGER,
    rejection_reason TEXT,

    created_by INTEGER,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loan_apps_status ON loan_applications(status);
CREATE INDEX IF NOT EXISTS idx_loan_apps_member ON loan_applications(member_id);
CREATE INDEX IF NOT EXISTS idx_loan_apps_created ON loan_applications(created_at DESC);