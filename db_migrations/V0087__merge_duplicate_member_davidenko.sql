UPDATE members SET
  birth_date = '1953-10-25',
  birth_place = 'гор. Шахты Ростовской обл.',
  passport_series = '8797',
  passport_number = '079638',
  passport_dept_code = '113-003',
  passport_issue_date = '2000-07-13',
  passport_issued_by = 'ВОРГАШОРСКИМ ГОРОДСКИМ ОМ Г. ВОРКУТЫ РЕСП. КОМИ',
  registration_address = '169933, респ Коми, г Воркута, пгт Воргашор, ул Энтузиастов, д 21 к 2, кв 30',
  updated_at = NOW()
WHERE id = 225;

UPDATE savings SET member_id = 225 WHERE member_id = 226;
UPDATE saving_applications SET member_id = 225 WHERE member_id = 226;
UPDATE members SET status = 'inactive', updated_at = NOW() WHERE id = 226;
