INSERT INTO t_p25513958_client_erp_developme.loan_collateral (loan_id, collateral_type, pledger_name, description, collateral_value, identifier)
SELECT l.id, 'Иное', NULL, 'земельный участок адрес: Ростовская обл., г. Новошахтинск, ул. Просвещения, 4-а', 351000.0, '61:56:0120400:10' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000000116012024' AND l.org_id=3
UNION ALL
SELECT l.id, 'Залог движимого имущества', 'Трухин Сергей Сергеевич', 'автомобиль Хендэ Элантра, 2005 г.в.', NULL, 'KMHDM41BP6U262838' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000042019082025' AND l.org_id=3
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', 'Чахалова Гулизар Намозовна', 'Земельный участок 447048 м2 по адресу Волгоградская область, р-н Быковский, п Раздолье', 564300.0, '34:02:020007:719' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000033916062025' AND l.org_id=3
UNION ALL
SELECT l.id, 'Поручительство', 'Черникова Алена Игоревна', NULL, NULL, NULL FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000000920042026' AND l.org_id=3
UNION ALL
SELECT l.id, 'Поручительство', 'Куликова Анастасия Андреевна', NULL, NULL, NULL FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000000513042026' AND l.org_id=3
UNION ALL
SELECT l.id, 'Поручительство', 'Фоменко Виталий Валерьевич', NULL, NULL, NULL FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000000409042026' AND l.org_id=3
UNION ALL
SELECT l.id, 'Поручительство', 'Шунина Елена Анатольевна', NULL, NULL, NULL FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000034718062025' AND l.org_id=3
UNION ALL
SELECT l.id, 'Залог движимого имущества', 'Шунин Андрей Сергеевич', 'автомобиль VOLKSWAGEN (XW8) JETTA, 2014', 658360.0, 'XW8ZZZ16ZFN905628' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000034718062025' AND l.org_id=3
UNION ALL
SELECT l.id, 'Залог движимого имущества', 'Шунина Елена Анатольевна', 'Автомобиль ВАЗ 21093, 1992 г.в.', 304000.0, 'XTA210930P1203575' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000008002092024' AND l.org_id=3
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', 'Щербакова Галина Юрьевна', 'жилой дом по адресу Ростовская область, г. Шахты, ул. Заречная, д. 73', NULL, '61:59:0050201:7667' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000004822052024' AND l.org_id=3
UNION ALL
SELECT l.id, 'Иное', NULL, 'земельный участок по адресу Ростовская область, г. Шахты, ул. Заречная, д. 73', NULL, '61:59:0050201:246' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000004822052024' AND l.org_id=3
UNION ALL
SELECT l.id, 'Залог движимого имущества', 'Якушева Юлия Николаевна', 'Автомобиль Hyundai Sonata, 2012 года', 1200000.0, '5NPEB4AC4DH565683' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000036913112023' AND l.org_id=3
UNION ALL
SELECT l.id, 'Поручительство', 'Заводчикова Наталья Васильевна', 'Заводчикова Наталья Васильевна', NULL, NULL FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000049401112023' AND l.org_id=2
UNION ALL
SELECT l.id, 'Залог движимого имущества', 'Алиев Руслан Сергеевич/ ООО Фарматика', 'Автомобиль CHERY TIGGO 7PRO Черный, 2021 г.в.', 1500000.0, 'LVVDB21B3MD334454' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000000527012022' AND l.org_id=2
UNION ALL
SELECT l.id, 'Поручительство', NULL, 'ООО Фарматика', NULL, NULL FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000000527012022' AND l.org_id=2
UNION ALL
SELECT l.id, 'Залог движимого имущества', 'Анохина Кристина Владимировна', 'Автомобиль OPEL ASTRA, белый, 2012 г.в.', 923400.0, 'XUFPE6DC8C3064191' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000023003072024' AND l.org_id=2
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', 'Архипова Анастасия Николаевна', 'жилое помещение по адресу Ростовская область, г Таганрог, ул Шевченко, д 64, Номер(а) на этаже 2,3,7,8,18,15,17,16. Площадь 50,4', 3120000.0, '61:58:0001071:260' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000001522082025' AND l.org_id=2
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', 'Асташова Наталья Николаевна', 'Квартира по адресу Ростовская область, г Шахты, пер Ковровый, двлд. 14, кв. 3. Площадь 54.1м2', 905625.0, '61:59:0040361:511' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000038621102024' AND l.org_id=2
UNION ALL
SELECT l.id, 'Залог движимого имущества', 'Борванова Оксана Владимировна', 'Автомобиль KIA RIO, 2012 г.в.', 1000000.0, 'Z94CC41BBDR097403' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000022026062024' AND l.org_id=2
UNION ALL
SELECT l.id, 'Поручительство', 'Бурмистрова Ирина Юрьевна', 'Бурмистрова Ирина Юрьевна', NULL, NULL FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000003512042019' AND l.org_id=2;
