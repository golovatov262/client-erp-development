-- Обновляем дефолтные SMS-шаблоны: добавляем {org_name} и {org_phone}
UPDATE sms_settings SET value='Сегодня платеж по займу {contract_no}, сумма {amount} руб. Ваш "{org_name}", {org_phone}', updated_at=NOW()
 WHERE key='tpl_payment_today' AND value='Сегодня платеж по займу {contract_no}, сумма {amount} руб. КПК';

UPDATE sms_settings SET value='Завтра платеж по займу {contract_no}, сумма {amount} руб. Ваш "{org_name}", {org_phone}', updated_at=NOW()
 WHERE key='tpl_payment_tomorrow' AND value='Завтра платеж по займу {contract_no}, сумма {amount} руб. КПК';

UPDATE sms_settings SET value='Через {days} дн. платеж по займу {contract_no}, сумма {amount} руб. Ваш "{org_name}", {org_phone}', updated_at=NOW()
 WHERE key='tpl_payment_days' AND value='Через {days} дн. платеж по займу {contract_no}, сумма {amount} руб. КПК';

UPDATE sms_settings SET value='Просрочка по займу {contract_no}, сумма {amount} руб. Оплатите во избежание пени. Ваш "{org_name}", {org_phone}', updated_at=NOW()
 WHERE key='tpl_overdue' AND value='Просрочка по займу {contract_no}, сумма {amount} руб. Оплатите во избежание пени. КПК';

UPDATE sms_settings SET value='Сегодня окончание договора сбережений {contract_no}, сумма {amount} руб. Ваш "{org_name}", {org_phone}', updated_at=NOW()
 WHERE key='tpl_savings_today' AND value='Сегодня окончание договора сбережений {contract_no}, сумма {amount} руб. КПК';

UPDATE sms_settings SET value='Завтра окончание договора сбережений {contract_no}, сумма {amount} руб. Ваш "{org_name}", {org_phone}', updated_at=NOW()
 WHERE key='tpl_savings_tomorrow' AND value='Завтра окончание договора сбережений {contract_no}, сумма {amount} руб. КПК';

UPDATE sms_settings SET value='Через {days} дн. окончание договора сбережений {contract_no}, сумма {amount} руб. Ваш "{org_name}", {org_phone}', updated_at=NOW()
 WHERE key='tpl_savings_days' AND value='Через {days} дн. окончание договора сбережений {contract_no}, сумма {amount} руб. КПК';
