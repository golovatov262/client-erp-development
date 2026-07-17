INSERT INTO t_p25513958_client_erp_developme.loan_collateral (loan_id, collateral_type, pledger_name, description, collateral_value, identifier)
SELECT l.id, 'Залог недвижимого имущества', 'Кузьменко Оксана Анатольевна', 'Жилой дом: 48,3 м2, Ставропольский край, р-н Петровский, с Константиновское, ул Сараева, 215', 775928.25, '26:08:050307:46' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000005020062023' AND l.org_id=3
UNION ALL
SELECT l.id, 'Иное', NULL, 'Земельный участок: 2000м2, Ставропольский край, р-н Петровский, с Константиновское, ул Сараева, 215', 4371.25, '26:08:050307:27' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000005020062023' AND l.org_id=3
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', 'Курбанов Рассим Ахадович', 'Квартира: 62,2 м2, 346500, Ростовская область, г Шахты, ул Разина, д. 13в, кв. 1', 2800000.0, '61:59:0020332:428' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000043317102025' AND l.org_id=3
UNION ALL
SELECT l.id, 'Поручительство', 'Цветаева Людмила Владимировна', NULL, NULL, NULL FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000000613042026' AND l.org_id=3
UNION ALL
SELECT l.id, 'Поручительство', 'Лобанова Татьяна Александровна', NULL, NULL, NULL FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000044610122025' AND l.org_id=3
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', 'Лозина Кристина Алексеевна', 'Жилой дом: 43,3 м2, 346461, Ростовская область, р-н Октябрьский, х Киреевка, ул Садовая, д. 19', 1039000.0, '61:28:0020301:1371' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000000423012024' AND l.org_id=3
UNION ALL
SELECT l.id, 'Иное', NULL, 'Земельный участок: 900 м2, 346461, Ростовская область, р-н Октябрьский, х Киреевка, ул Садовая, д. 19', 477000.0, '61:28:0020301:156' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000000423012024' AND l.org_id=3
UNION ALL
SELECT l.id, 'Залог движимого имущества', 'Лупанова Диана Юрьевна', 'Автомобиль KIA RIO, 2012', 640000.0, 'Z94CC41BBDR079922' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000042909102025' AND l.org_id=3
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', 'Михай Арина Вячеславовна', 'Комната: 13,2 м2, 242604, Брянская область, р-н Дятьковский, г Дятьково, мкр. 12-й, д. 2, ком. 47', 80000.0, '32:29:0020503:342' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000016922042025' AND l.org_id=3
UNION ALL
SELECT l.id, 'Поручительство', 'Ниценко Екатерина Викторовна', NULL, NULL, NULL FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000008228102024' AND l.org_id=3
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', NULL, 'Квартира: 75,2 м2, 346660, Ростовская область, р-н Мартыновский, п Поречье, ул Центральная, д. 7, г-ж 1', 801599.21, '61:20:0081001:742' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000008228102024' AND l.org_id=3
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', 'Ниязова Марина Геннадьевна', '5/6 доли жилого дома: 54,6 м2, 347630, Ростовская область, р-н Сальский, г Сальск, ул Прохладная, д. 59', 694020.96, '61:57:0010596:131' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000031309062025' AND l.org_id=3
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', 'Ниязова Марина Геннадьевна', '5/6 доли земельного участка: 434 м2, 347630, Ростовская область, р-н Сальский, г Сальск, ул Прохладная, д. 59', 403926.69, '61:57:0010596:11' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000031309062025' AND l.org_id=3
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', 'Усиченко Дмитрий Геннадьевич', '1/6 доли жилого дома: 54,6 м2, 347630, Ростовская область, р-н Сальский, г Сальск, ул Прохладная, д. 59', 138804.19, '61:57:0010596:131' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000031309062025' AND l.org_id=3
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', 'Усиченко Дмитрий Геннадьевич', '1/6 доли земельного участка: 434м2, 347630, Ростовская область, р-н Сальский, г Сальск, ул Прохладная, д. 59', 80785.34, '61:57:0010596:11' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000031309062025' AND l.org_id=3
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', 'Обирин Алексей Григорьевич', 'Жилой дом: 39,9 м2, 356303, Ставропольский край, р-н Александровский, с Александровское, ул Фрунзе, д. 21', 621000.0, '26:18:040307:3' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000008308112024' AND l.org_id=3
UNION ALL
SELECT l.id, 'Иное', NULL, 'Земельный участок: 1177 м2, 356303, Ставропольский край, р-н Александровский, с Александровское, ул Фрунзе, д. 21', 327052.99, '26:18:060106:5' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000008308112024' AND l.org_id=3
UNION ALL
SELECT l.id, 'Залог движимого имущества', 'Палкин Сергей Борисович', 'Автомобиль RENAULT KAPTUR, 2019 г.в', 1520000.0, 'X7LASRBA564474236' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000033629092023' AND l.org_id=3
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', NULL, 'квартира по адресу Ростовская область, г Шахты, ул Комсомольская, двлд. 16, кв. 4', 1120000.0, '61:59:0000000:21273' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000033629092023' AND l.org_id=3
UNION ALL
SELECT l.id, 'Залог движимого имущества', 'Петросян Мурад Карапетович', 'Автомобиль LADA VESTA, 2019 г.в.', 680000.0, 'XTAGFL110JY120353' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000043009102025' AND l.org_id=3;
