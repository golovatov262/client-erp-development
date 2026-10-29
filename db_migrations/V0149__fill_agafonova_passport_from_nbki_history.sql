-- One-time CRM master-data repair from the supplied 06.10.2026 NBKI XML.
-- UID 6938d6de-78aa-11ee-8ca6-18c04d93e059-0; the name and birth date
-- are matched before filling only empty fields. No runtime 1C dependency.
UPDATE members
SET passport_series = COALESCE(passport_series, '6021'),
    passport_number = COALESCE(passport_number, '562294'),
    passport_issue_date = COALESCE(passport_issue_date, DATE '2021-10-26'),
    passport_issued_by = COALESCE(passport_issued_by,
        'ГУ МВД РОССИИ ПО РОСТОВСКОЙ ОБЛАСТИ'),
    passport_dept_code = COALESCE(passport_dept_code, '610-009'),
    updated_at = now()
WHERE id=249 AND last_name='Агафонова' AND first_name='Яна'
  AND birth_date=DATE '1989-09-19'
  AND (passport_series IS NULL OR passport_number IS NULL
       OR passport_issue_date IS NULL OR passport_issued_by IS NULL
       OR passport_dept_code IS NULL);
