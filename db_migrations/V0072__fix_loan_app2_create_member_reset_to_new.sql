INSERT INTO t_p25513958_client_erp_developme.members
  (member_no, member_type, last_name, first_name, middle_name, phone, inn, registration_address,
   birth_date, birth_place,
   passport_series, passport_number, passport_issue_date, passport_issued_by, passport_dept_code,
   bank_account, bank_bik,
   marital_status, spouse_fio, spouse_phone,
   extra_contact_fio, extra_phone,
   status)
VALUES
  ('П-000222', 'FL', 'Тебекина', 'Елена', 'Сергеевна', '79045090332', '080100870440',
   '346480, Ростовская обл, Октябрьский р-н, рп Каменоломни, Садовый пер, д 21В, кв 22',
   '1987-05-28', 'гор. Городовиковск, Калмыцкой АССР',
   '8510', '438422', '2010-11-26',
   'ТП ОФМС России ПО РЕСПУБЛИКЕ КАЛМЫКИЯ В ГОРОДОВИКОВСКОМ РАЙОНЕ', '080002',
   '40817810352220868348', '046015602',
   'married', 'Тебекин Виталий Юрьевич', '79185211994',
   'Богинская Евгения Викторовна', '79275961061',
   'active');

UPDATE t_p25513958_client_erp_developme.loan_applications
SET member_id = (SELECT id FROM t_p25513958_client_erp_developme.members WHERE member_no = 'П-000222'),
    status = 'new',
    created_loan_id = NULL,
    updated_at = NOW()
WHERE id = 2;
