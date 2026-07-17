INSERT INTO t_p25513958_client_erp_developme.loan_collateral (loan_id, collateral_type, pledger_name, description, collateral_value, identifier)
SELECT l.id, 'Залог недвижимого имущества', 'Шарова Марина Геннадьевна', 'жилой дом по адресу Ростовская область, г. Шахты, п. Аюта, пер. Нагорный, д. 8. Площадь 42,8', 1100000.0, '61:59:0050201:6377' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000034901102024' AND l.org_id=2
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', 'Шевченко Юрий Викторович', 'жилой дом по адресу Ростовская область, р-н. Октябрьский, х. Красный Кут, ул. Чистова, д. 1. Площадь 64,8', 2000000.0, '61:28:0080101:2213' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000055428112023' AND l.org_id=2
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', NULL, 'земельный участок по адресу Ростовская обл., р-н Октябрьский, х. Красный Кут, ул. Чистова, 1.', 600000.0, '61:28:0080101:184' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000055428112023' AND l.org_id=2
UNION ALL
SELECT l.id, 'Поручительство', 'Тищенко Людмила Анатольевна', 'Тищенко Людмила Анатольевна', NULL, NULL FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000032716092024' AND l.org_id=2;
