INSERT INTO t_p25513958_client_erp_developme.loan_collateral (loan_id, collateral_type, pledger_name, description, collateral_value, identifier)
SELECT l.id, 'Залог недвижимого имущества', 'Аврорская Светлана Валерьевна', 'Квартира: 44,5 м2, 414042, Астраханская область, г Астрахань, ул Вячеслава Мейера, д. 7, кв. 79', 1336523.86, '30:12:040076:762' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000004006052024' AND l.org_id=3
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', NULL, 'Жилой дом: 125,4 м2, 356626, Ставропольский край, р-н Ипатовский, с Бурукшун, ул Гагарина, двлд. 111.', 1035000.0, '26:02:071605:9' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000004006052024' AND l.org_id=3
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', NULL, 'Земельный участок: 1683 м2, 356626, Ставропольский край, р-н Ипатовский, с Бурукшун, ул Гагарина, двлд. 111', 100000.0, '26:02:071604:20' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000004006052024' AND l.org_id=3
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', 'Бадмаева Дари Бальжинимаевна', 'Земельный учаток: 700 м2, 670045, Республика Бурятия, г Улан-Удэ, ул Феоктистова', 1520000.0, '03:24:022402:122' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000014914042025' AND l.org_id=3
UNION ALL
SELECT l.id, 'Поручительство', 'Гомбоев Даба Агбанович', NULL, NULL, NULL FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000014914042025' AND l.org_id=3
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', 'Бадмаева Дари Бальжинимаевна', 'Жилой дом: 57,5 м2 671339, Республика Бурятия, р-н Заиграевский, с Первомаевка, ул Комсомольская, д. 6, блок 2', 700000.0, '03:06:240104:231' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000042526092025' AND l.org_id=3
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', 'Бадмаева Дари Бальжинимаевна', 'Земельный участок: 975 м2, Российская Федерация, Республика Бурятия, м.р-н Заиграевский, с.п. Первомаевское, с. Первомаевка, ул. Комсомольская, з/у 6/2', 100000.0, '03:06:240104:43' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000042526092025' AND l.org_id=3
UNION ALL
SELECT l.id, 'Поручительство', 'Жигжитова Надежда Самбуевна', NULL, NULL, NULL FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000042526092025' AND l.org_id=3
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', 'Бадриашвили Нона Гивиевна', 'Нежилое помещение: 40,9 м2, 347933, Ростовская область, г Таганрог, ул Чучева, д. 42-а', 3200000.0, '61:58:0005281:5466' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000042409092025' AND l.org_id=3
UNION ALL
SELECT l.id, 'Залог движимого имущества', 'Баранов Максим Анатольевич', 'Автомобиль, ФОЛЬКСВАГЕН ТАУРЕГ 2005г.в. Цвет Черный', 1100000.0, 'WVGZZZ7LZ6D003945' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000000313012025' AND l.org_id=3
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', 'Бастричева Людмила Александровна', 'Жилой дом: 15,7 м2, 346886, Ростовская область, г Батайск, тер. ДНТ Дружба, ул Барбарисовая, д. 64', 823000.0, '61:46:0012704:837' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000007716072024' AND l.org_id=3
UNION ALL
SELECT l.id, 'Иное', NULL, 'Земельный участок: 640 м2, 346886, Ростовская область, г Батайск, тер. ДНТ Дружба, ул Барбарисовая, д. 64', 500000.0, '61:46:0012704:305' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000007716072024' AND l.org_id=3
UNION ALL
SELECT l.id, 'Залог движимого имущества', 'Виноградов Николай Николаевич', 'Автомобиль, HAVAL F7X СС6467UМ09С, 2022 г.в, Цвет белый, пробег 32800 тыс.км.', 1980000.0, 'XZGEF04A3NA617127' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000008114102024' AND l.org_id=3
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', 'Коротеева Елена Владимировна', '1/2 жилого дома: 45,1 м2, 346500, Ростовская область, г Шахты, пер Кирова, двлд. 35', 2000000.0, '61:59:0020316:828' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000005304062024' AND l.org_id=3
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', 'Коротеев Денис Юрьевич', '1/2 жилого дома: 45,1 м2, 346500, Ростовская область, г Шахты, пер Кирова, двлд. 35', 2000000.0, '61:59:0020316:828' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000005304062024' AND l.org_id=3
UNION ALL
SELECT l.id, 'Залог движимого имущества', 'Волкова Виктория Андреевна', 'Автомобиль: Рено Логан 2012 г.в.', 240000.0, 'X7LLSRB2HCH497994' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000001108052026' AND l.org_id=3
UNION ALL
SELECT l.id, 'Залог движимого имущества', 'Кудрин Евгений Владимирович', 'Автомобиль: SsangYong Actyon 2012г.в.', 950000.0, 'Z8UA0A1SSC0013349' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000041805082025' AND l.org_id=3
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', 'Головатов Сергей Викторович', '1/4 доли жилого дома: 307,9 м2 346631, Ростовская область, р-н Семикаракорский, г Семикаракорск, ул Ленина, д. 293', 2000000.0, '61:35:0110116:525' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000005204062024' AND l.org_id=3
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', 'Горячева Алена Григорьевна', 'Квартира: 62,9 м2, 346503, Ростовская область, г Шахты, пер Петрашевского, д. 1А, кв. 10', 2500000.0, '61:59:0030423:810' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000036527102023' AND l.org_id=3
UNION ALL
SELECT l.id, 'Поручительство', 'Гасанов Гасан Валех Оглы', NULL, NULL, NULL FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000036527102023' AND l.org_id=3
UNION ALL
SELECT l.id, 'Залог движимого имущества', 'Демидова Светлана Алексеевна', 'Автомобиль Лада Калина, 2012 г.в.', 560000.0, 'XTA219410F0065260' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000003619022025' AND l.org_id=3
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', 'Евсютина Людмила Николаевна', 'Гараж: 28,5 м2, 346530, Ростовская область, г Шахты, пер Стеклова, г-ж 20 литер Г6', 450000.0, '61:59:0020120:821' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000043110102025' AND l.org_id=3
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', 'Евсютина Людмила Николаевна', 'Земельный участок: 34 м2, 346530, Ростовская область, г Шахты, пер Стеклова, г-ж 20 литер Г6', 30000.0, '61:59:0020120:908' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000043110102025' AND l.org_id=3
UNION ALL
SELECT l.id, 'Залог движимого имущества', 'Евсютина Людмила Николаевна', 'Автомобиль: Ford FOCUS, 2014, VIN X9FKXXEEBKEY63708, пробег 68933 км', 1000000.0, 'X9FKXXEEBKEY63708' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000043110102025' AND l.org_id=3
UNION ALL
SELECT l.id, 'Поручительство', 'Казаченко Сергей Федорович', NULL, NULL, NULL FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000043110102025' AND l.org_id=3
UNION ALL
SELECT l.id, 'Поручительство', 'Евсютин Дмитрий Андреевич', NULL, NULL, NULL FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000043110102025' AND l.org_id=3
UNION ALL
SELECT l.id, 'Залог движимого имущества', 'Ежакова Анастасия Алексеевна', 'Автомобиль: Renault LOGAN, 2006', 299160.0, 'X7LLSRAGH6H032273' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000041710072025' AND l.org_id=3
UNION ALL
SELECT l.id, 'Поручительство', 'Елисеев Игорь Александрович', NULL, NULL, NULL FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000000103042026' AND l.org_id=3
UNION ALL
SELECT l.id, 'Поручительство', 'Ершова Галина Ивановна', NULL, NULL, NULL FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000012502042025' AND l.org_id=3
UNION ALL
SELECT l.id, 'Залог движимого имущества', 'Ершова Галина Ивановна', 'Автомобиль ГАЗ A23R32, 2013 года выпуска', 1600000.0, 'X96A23R32D2544304' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000012502042025' AND l.org_id=3
UNION ALL
SELECT l.id, 'Залог движимого имущества', 'Ершова Галина Ивановна', 'Автомобиль ГАЗ АФ 37170А, 2004 год выпуска', 1200000.0, 'X7137170A40000895' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000012502042025' AND l.org_id=3
UNION ALL
SELECT l.id, 'Залог недвижимого имущества', 'Зорило Оксана Андреевна', 'Жилое помещение: 28,4 м2, 303349, Орловская область, р-н Глазуновский, п Техникумовский, ул Школьная, д. 2, помещ. 5', 110000.0, '57:16:0010601:389' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000024422052025' AND l.org_id=3
UNION ALL
SELECT l.id, 'Залог движимого имущества', 'Копаева Вера Ивановна', 'Автомобиль LADA GRANTA, 2021 г.в', 640000.0, 'XTA219170M0409668' FROM t_p25513958_client_erp_developme.loans l WHERE l.contract_no='300-000042328082025' AND l.org_id=3;
