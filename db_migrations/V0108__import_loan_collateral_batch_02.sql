INSERT INTO t_p25513958_client_erp_developme.loan_collateral (loan_id, collateral_type, pledger_name, description, collateral_value, identifier)
SELECT l.id, 'Залог движимого имущества', 'Погодин Сергей Владимирович', 'Автомобиль Hyundai SOLARIS, 2014', 600000.0, 'Z94CU41DAFR377321' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000043214102025' AND l.org_id=3
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', 'Пономарева Евгения Петровна', 'Жилой дом: м2, 346500, Ростовская область, г Шахты, пер Луговой, двлд. 20А', 2600000.0, '61:59:0020314:164' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000040419122023' AND l.org_id=3
UNION ALL
SELECT l.id, 'Иное', NULL, 'Земельный участок: 317 м2, 346500, Ростовская область, г Шахты, пер Луговой, двлд. 20А', NULL, '61:59:0020314:153' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000040419122023' AND l.org_id=3
UNION ALL
SELECT l.id, 'Поручительство', 'Секрий Елена Владимировна', NULL, NULL, NULL FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000000203042026' AND l.org_id=3
UNION ALL
SELECT l.id, 'Залог движимого имущества', 'Сериков Сергей Николаевич', 'автомобиль Лада 217030 Приора, 2008 г.в.', 300000.0, 'XTA21703080140423' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000004717052024' AND l.org_id=3
UNION ALL
SELECT l.id, 'Залог движимого имущества', 'Симоненкова Анна Сергеевна', 'Автомобиль MERCEDES BENZ (WDC) ML350', 1200000.0, 'WDC1641221A559506' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000043521102025' AND l.org_id=3
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', 'Симоненкова Анна Сергеевна', 'Земельный участок 899м2 по адресу Ростовская область, р-н Семикаракорский, г Семикаракорск, ул Садовая, д. 74', 800000.0, '61:35:0110301:46' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000043521102025' AND l.org_id=3
UNION ALL
SELECT l.id, 'Поручительство', 'Яремчук Иван Юрьевич', NULL, NULL, NULL FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000005607062024' AND l.org_id=3
UNION ALL
SELECT l.id, 'Поручительство', 'Смоленцев Евгений Борисович', NULL, NULL, NULL FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='510022023' AND l.org_id=3
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', 'Смоленцева Марина Михайловна', 'жилой дом по адресу Ростовская область, р-н. Октябрьский, сл. Красюковская, ул. М.Горького, д. 91. Площадь 59,1', 910000.0, '61:28:0070101:2140' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='510022023' AND l.org_id=3
UNION ALL
SELECT l.id, 'Иное', NULL, 'земельный участок по адресу Ростовская область, р-н. Октябрьский, сл. Красюковская, ул. М.Горького, д. 91. Площадь 59,1', NULL, '61:28:0070101:1019' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='510022023' AND l.org_id=3
UNION ALL
SELECT l.id, 'Залог движимого имущества', 'Соколовская Надежда Леонтьевна', 'Автомобиль HYUNDAI ACCENT, 2004 г.в.', 700000.0, 'X7MCF41GP5M024751' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000042126122023' AND l.org_id=3
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', 'Строганова Рита Леонидовна', 'жилой дом по адресу Ростовская область, г. Шахты, ул. Невского, д. 40', 2500000.0, '61:59:0040227:190' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000036808112023' AND l.org_id=3
UNION ALL
SELECT l.id, 'Иное', NULL, 'земельный участок по адресу Ростовская область, г. Шахты, ул. Невского, д. 40', NULL, '61:59:0040227:47' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000036808112023' AND l.org_id=3
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', 'Сычева Наталья Васильевна', 'Земельный участок по адресу Ростовская область, р-н Неклиновский, с Беглица', 4000000.0, '61:26:0600021:878' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000043420102025' AND l.org_id=3
UNION ALL
SELECT l.id, 'Иное', NULL, 'Земельный участок по адресу Ростовская область, р-н Неклиновский, с Беглица', 800000.0, '61:26:0600021:1021' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000043420102025' AND l.org_id=3
UNION ALL
SELECT l.id, 'Залог движимого имущества', 'Тараканов Кирилл Викторович', 'Автомобиль Skoda Oktavia, 2005', 767000.0, 'TMBDA11Z052047672' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000042227122023' AND l.org_id=3
UNION ALL
SELECT l.id, 'Поручительство', 'Федорова Надежда Владимировна', NULL, NULL, NULL FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000001219022024' AND l.org_id=3
UNION ALL
SELECT l.id, 'Поручительство', 'Закурнаева Марина Павловна', NULL, NULL, NULL FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000000116012024' AND l.org_id=3
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', 'Трухин Сергей Сергеевич', 'жилой дом площадью 68,80 адрес: Ростовская обл., г. Новошахтинск, ул. Просвещения, д. 4-а', 2683000.0, '61:56:0120400:26' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000000116012024' AND l.org_id=3;
