INSERT INTO t_p25513958_client_erp_developme.loan_collateral (loan_id, collateral_type, pledger_name, description, collateral_value, identifier)
SELECT l.id, 'Поручительство', NULL, 'Донченко Юрий Алексеевич', NULL, NULL FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000006805032024' AND l.org_id=2
UNION ALL
SELECT l.id, 'Залог движимого имущества', 'Коротеева Елена Владимировна', 'Автомобиль SUBARU STELLA, 2017 г.в.', 880000.0, 'номер кузова LA150F-0022512' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000000230092025' AND l.org_id=2
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', 'Коротун Наталья Павловна', 'жилой дом по адресу Ростовская область, г. Шахты, пер. Морской, д. 79/ Площадь 65,4', 4400000.0, '61:59:0010211:419' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000000130042026' AND l.org_id=2
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', NULL, 'земельный участок по адресу Ростовская область, г. Шахты, пер. Морской, д. 79', NULL, '61:59:0010211:88' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000000130042026' AND l.org_id=2
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', 'Красоткина Инна Геннадьевна', 'квартира по адресу Ростовская обл, г Шахты, ул Ворошилова, д 3, кв 69. Площадь 29,3', 1120000.0, '61:59:0020209:890' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000001313082025' AND l.org_id=2
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', 'Кудрин Евгений Владимирович', 'жилой дом по адресу Ростовская область, г. Шахты, пер. 2-й Украинский, д. 6. Площадь 197,7', 5600000.0, '61:59:0010210:250' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000000101042025' AND l.org_id=2
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', NULL, 'земельный участок по адресу Ростовская область, г. Шахты, пер. 2-й Украинский, д. 6', NULL, '61:59:0010210:63' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000000101042025' AND l.org_id=2
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', 'Кулева Елизавета Дмитриевна/Бабаков Олег Александрович', 'жилой дом по адресу Ставропольский край, р-н Шпаковский, г Михайловск, ул Владислава Листьева, д. 6/9. Площадь 74,6', 1000000.0, '26:11:020501:11827' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000011704042022' AND l.org_id=2
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', NULL, 'земельный участок по адресу Ставропольский край, р-н Шпаковский, г Михайловск, ул Владислава Листьева, д. 6/9. Площадь 74,6', 500000.0, '26:11:020501:11561' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000011704042022' AND l.org_id=2
UNION ALL
SELECT l.id, 'Поручительство', NULL, 'Бабаков Олег Александрович', NULL, NULL FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000011704042022' AND l.org_id=2
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', 'Марусин Николай Александрович', 'Квартира по адресу Ростовская область, р-н Октябрьский, рп Каменоломни, ул им Крупской, д. 59, кв 11. Площадь 58,6', 4000000.0, '61:28:0120104:341' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000001301022024' AND l.org_id=2
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', 'Меркулов Константин Александрович', 'жилой дом по адресу Ростовская область, р-н. Каменский, с/п. Волченское, х. Светлый, ул. Цветочная, д. 15. Площадь 77,1', 1386500.0, '61:15:0040901:397' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000002508022024' AND l.org_id=2
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', NULL, 'земельный участок по адресу Ростовская область, р-н. Каменский, с/п. Волченское, х. Светлый, ул. Цветочная, д. 15', 500.0, '61:15:0040901:201' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000002508022024' AND l.org_id=2
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', 'Мордовин Алексей Сергеевич', 'квартира по адресу Краснодарский край, г.Новороссийск, Центральный округ,ул. Мысхакское шоссе, д. 71, кв.32. Площадь 36,4', 1952224.82, '23:47:0304052:567' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000015208052024' AND l.org_id=2
UNION ALL
SELECT l.id, 'Залог движимого имущества', 'Нанаев Николай Олегович/Сирота Максим Сергеевич', 'Автомобиль шевроле ланос, 2008 г.в.', 320000.0, 'Y6DTF69Y080143855' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000000515052025' AND l.org_id=2
UNION ALL
SELECT l.id, 'Поручительство', NULL, 'Сирота Максим Сергеевич', NULL, NULL FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000000515052025' AND l.org_id=2
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', 'Денщикова Валентина Васильевна', 'квартира по адресу Ростовская область, г Шахты, ул Индустриальная, д. 3а, кв. 17. Площадь 47,8', 2939700.0, '61:59:0020213:2076' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000017829052024' AND l.org_id=2
UNION ALL
SELECT l.id, 'Залог движимого имущества', 'Парфенова Наталья Юрьевна', 'Автомобиль SSANG YONG DJ KYRON M200, 2006 г.в.', 520000.0, 'XU3S0A1KS7Z000182' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000029628082024' AND l.org_id=2
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', 'Петров Константин Юрьевич', 'квартира по адресу Ростовская область, г Шахты, пер Мостовой, д. 8, кв. 2. Площадь 49,7', 2000000.0, '61:59:0050301:10547' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000022903072024' AND l.org_id=2
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', 'Пилосян Эдгар Акопович совместно с Шириметовой Софией Сергеевной', 'жилой дом по адресу Ростовская область, г. Шахты, ул. Ново-Восточная, д. 23. Площадь 57,2', 1300000.0, '61:59:0040408:90' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000056711122023' AND l.org_id=2;
