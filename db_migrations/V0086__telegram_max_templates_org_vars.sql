-- Заменяем захардкоженный телефон в Telegram/MAX шаблонах на переменные {org_name} и {org_phone}
UPDATE telegram_settings
   SET value = REPLACE(value, 'Тел. +78007008909', 'Ваш "{org_name}", {org_phone}'),
       updated_at = NOW()
 WHERE key LIKE 'tpl_%' AND value LIKE '%Тел. +78007008909%';

UPDATE max_settings
   SET value = REPLACE(value, 'Тел. +78007008909', 'Ваш "{org_name}", {org_phone}'),
       updated_at = NOW()
 WHERE key LIKE 'tpl_%' AND value LIKE '%Тел. +78007008909%';
