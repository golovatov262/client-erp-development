INSERT INTO t_p25513958_client_erp_developme.loan_collateral (loan_id, collateral_type, pledger_name, description, collateral_value, identifier)
SELECT l.id, 'Залог недвижимого имущества', NULL, 'земельный участок по адресу Ростовская область, г. Шахты, ул. Ново-Восточная, д. 23', 200000.0, '61:59:0040408:20' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000056711122023' AND l.org_id=2
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', 'Поварнина Наталья Семеновна', 'квартира по адресу Россия, Ростовская обл., г. Белая Калитва, ул. Совхозная, дом №16А, кв. 26. Площадь 36,4', 435000.0, '61:47:0010302:1171' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000035408112022' AND l.org_id=2
UNION ALL
SELECT l.id, 'Залог движимого имущества', 'Потакова Ирина Николаевна', 'автомобиль Volkswagen, Polo, 2012 г.в.', 640000.0, 'XW8ZZZ61ZDG002022' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000001111082025' AND l.org_id=2
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', 'Проскуренко Егор Владимирович/Проскуренко Ирина Григорьевна', '1/3 доли квартиры по адресу Ростовская область, г. Шахты, ул. Искра, д. 53а, кв. 50', 1710000.0, '61:59:0040342:1458' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000031106092024' AND l.org_id=2
UNION ALL
SELECT l.id, 'Поручительство', NULL, 'Проскуренко Ирина Григорьевна', NULL, NULL FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000031106092024' AND l.org_id=2
UNION ALL
SELECT l.id, 'Залог движимого имущества', 'Рыбкин Артём Игоревич', 'Автомобиль КАМАЗ 5320, 1989 г.в.', 1712000.0, 'XTC532000K0329192' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000006028022024' AND l.org_id=2
UNION ALL
SELECT l.id, 'Залог движимого имущества', NULL, 'Прицеп общего назначения ГКБ 8350, 1985 г.в.', NULL, 'номер шасси 196525' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000006028022024' AND l.org_id=2
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', 'Салтыкова Ольга Васильевна', '1/2 доли жилого дом по адресу Ростовская область, г. Новошахтинск, ул. Советской Конституции, д. 83. Площадь 75', 616617.0, '61:56:0120468:190' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000041430102020' AND l.org_id=2
UNION ALL
SELECT l.id, 'Залог движимого имущества', 'Севостьянов Александр Михайлович', 'Автомобиль Lada Largus RS045L, серебристый, 2019 г.в.', 1120000.0, 'XTARS045LL1242092' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000048629102023' AND l.org_id=2
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', 'Секрий Елена Владимировна/Секрий Елена Владимировна', 'Жилой дом по адресу Ростовская область, г. Новошахтинск, ул. Таганрогская, д. 109. Площадь 47.8 м2', 1038400.0, '61:56:0060222:91' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000042707112024' AND l.org_id=2
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', NULL, 'Земельный участок по адресу Ростовская область, г. Новошахтинск, ул. Таганрогская, д. 109', NULL, '61:56:0060222:28' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000042707112024' AND l.org_id=2
UNION ALL
SELECT l.id, 'Поручительство', NULL, 'Секрий Елена Владимировна', NULL, NULL FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000042707112024' AND l.org_id=2
UNION ALL
SELECT l.id, 'Залог движимого имущества', 'Сергеевич Станислав Александрович', 'Автомобиль КИА СЕРАТО, седан, золотистый, 2006 г.в.', 436000.0, 'KNEFE222265308787' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000020825072023' AND l.org_id=2
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', 'Агафонова Яна Александровна/Агафонова Яна Александровна', 'квартира по адресу Ростовская область, г Шахты, пер Театральный, д. 7, кв. 2. Площадь 45,1', 1000000.0, '61:59:0050101:5994' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000037219092023' AND l.org_id=2
UNION ALL
SELECT l.id, 'Поручительство', NULL, 'Агафонова Яна Александровна', NULL, NULL FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000037219092023' AND l.org_id=2
UNION ALL
SELECT l.id, 'Залог движимого имущества', 'Снегирев Сергей Георгиевич/Снегирева Алла Борисовна', 'Автомобиль BRILLIANCE V3, 2019 г.в.', 1200000.0, 'LSYYDACB7KC016899' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000050210112023' AND l.org_id=2
UNION ALL
SELECT l.id, 'Поручительство', NULL, 'Снегирева Алла Борисовна', NULL, NULL FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000050210112023' AND l.org_id=2
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', 'Сорокина Ирина Александровна', 'квартира по адресу Ростовская область, р-н Красносулинский, с/п Комиссаровское, п Розет, ул Черемушки, д 4, кв 12. Площадь 42,2', 453026.0, '61:18:0070502:658' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000016530102019' AND l.org_id=2
UNION ALL
SELECT l.id, 'Залог движимого имущества', 'Спицына Юлия Анлреевна', 'Автомобиль Renault LOGAN, 2012 г.в.', 400000.0, 'X7LLSRB2HCH521048' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000000629052025' AND l.org_id=2
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', 'Христенко Нина Владимировна', 'жилой дом по адресу Краснодарский край, Кавказский р-н, ст. Дмитриевская, ул Мира, д. 366. Площадь 59,9', 584128.0, '23:09:0502001:864' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='55cfedca-a34a-11eb-9485-001e6777911d-1' AND l.org_id=2;
