INSERT INTO t_p25513958_client_erp_developme.loan_collateral (loan_id, collateral_type, pledger_name, description, collateral_value, identifier)
SELECT l.id, 'Залог недвижимого имущества', 'Высотина Вероника Андреевна', 'помещение по адресу Ставропольский край, м.о. Апанасенковский, п. Айгурский, ул. Садовая, д. 8, кв. 2', 650000.0, '26:03:090101:475' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000000417012022' AND l.org_id=2
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', NULL, 'земельный участок по адресу Ставропольский край, м.о. Апанасенковский, п. Айгурский, ул. Садовая, д. 8, кв. 2', NULL, '26:03:090101:139' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000000417012022' AND l.org_id=2
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', 'Гончарова Валентина Александровна', '1/2 доли жилого дома по адресу Ставропольский край, р-н Александровский, с Калиновское, ул Глазкова, д 70', 833024.74, '26:18:030379:47' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000015514052024' AND l.org_id=2
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', NULL, '1/2 доли земельного участка по адресу Ставропольский край, р-н Александровский, с Калиновское, ул Глазкова, д 70', 16975.26, '26:18:030379:20' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000015514052024' AND l.org_id=2
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', 'Григорьева Екатерина Александровна', 'квартира по адресу Ростовская область, г. Шахты, пер. Фучика, д. 1а, корп. 2, кв. 6. Площадь 31', 1120000.0, '61:59:0000000:17510' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000049131102023' AND l.org_id=2
UNION ALL
SELECT l.id, 'Залог движимого имущества', 'Диденко Игорь Вадимович/Лукашова Наталья Викторовна', 'Автомобиль КИА РИО, седан, белый, 2012 г.в.', 568000.0, 'Z94CB41BACR051836' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000000323012023' AND l.org_id=2
UNION ALL
SELECT l.id, 'Поручительство', NULL, 'Лукашова Наталья Викторовна', NULL, NULL FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000000323012023' AND l.org_id=2
UNION ALL
SELECT l.id, 'Залог движимого имущества', 'Елисеев Игорь Александрович/Елисеев Игорь Александрович', 'автомобиль CHERY TIGGO7 PRO MAX, серый, 2023 г.в.', 2040000.0, 'LVVDB21B1PD785774' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000040605102023' AND l.org_id=2
UNION ALL
SELECT l.id, 'Поручительство', NULL, 'Елисеев Игорь Александрович', NULL, NULL FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000040605102023' AND l.org_id=2
UNION ALL
SELECT l.id, 'Залог движимого имущества', 'Епур Татьяна Владимировна', 'Автомобиль PEUGEOT 308, седан, темно-серый, 2008 г.в.', 300000.0, 'VF34C5FWC55274132' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000027821082023' AND l.org_id=2
UNION ALL
SELECT l.id, 'Залог движимого имущества', 'Зеленьков Дмитрий Николаевич/Дзюба Марина Сергеевна', 'Автомобиль SSANG YONG KYRON II, 2010 г.в.', 1127360.0, 'Z8US0A1KSA0002138' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000038921102024' AND l.org_id=2
UNION ALL
SELECT l.id, 'Поручительство', NULL, 'Дзюба Марина Сергеевна', NULL, NULL FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000038921102024' AND l.org_id=2
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', 'Зеленькова Анна Сергеевна', 'жилой дом по адресу Ростовская область, г Шахты, пер Цеткин, двлд. 3. Площадь 42,7', 1000000.0, '61:59:0040313:148' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000003614022024' AND l.org_id=2
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', NULL, 'земельный участок по адресу Ростовская область, г Шахты, пер Цеткин, двлд. 3', 250000.0, '61:59:0040313:361' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000003614022024' AND l.org_id=2
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', 'Казакевич Марина Александровна', 'жилой дом по адресу Воронежская область, р-н. Бутурлиновский, с. Пузево, ул. Первомайская, д. 103. Площадь 64,1', 693144.1, '36:05:3100008:79' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000019415062022' AND l.org_id=2
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', NULL, 'земельный участок по адресу Воронежская область, р-н. Бутурлиновский, с. Пузево, ул. Первомайская, д. 103', 10000.0, '36:05:3100008:5' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000019415062022' AND l.org_id=2
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', 'Калашникова Мария Александровна', 'жилой дом по адресу Ростовская область, р-н. Шолоховский, х. Ушаковский, ул. Центральная, д. 95. Площадь 86,7', 239000.0, '61:43:0060701:135' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000084828072021' AND l.org_id=2
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', NULL, 'земельный участок по адресу Ростовская область, р-н. Шолоховский, х. Ушаковский, ул. Центральная, д. 95', 10000.0, '61:43:0060701:42' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000084828072021' AND l.org_id=2
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', 'Калиничева Юлия Геннадиевна', 'квартира по адресу Ростовская обл., г. Шахты, пер. Фучика, дом №1-а, корпус №1, кв. 21. Площадь 20,8', 1600000.0, '61:59:0040429:1001' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000050410112023' AND l.org_id=2
UNION ALL
SELECT l.id, 'Залог движимого имущества', 'Коротеев Денис Юрьевич/Донченко Юрий Алексеевич', 'Автомобиль FORD 22432D-14 специальное пассажирское, 2012 г.в.', 1200000.0, 'Z8X22432DC0000059' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='100-000006805032024' AND l.org_id=2;
